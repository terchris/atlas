import { sql } from "./db";
import type {
  DimNgo,
  DimChapter,
  DimActivity,
  ChapterLevel,
} from "./types";

// Red Cross orgnr — used in several queries below. Hardcoded here for v1
// because the supply pages are explicitly Red Cross-only. v1.5 generalises.
export const REDCROSS_ORGNR = "864139442";

// ────────────────────────────────────────────────────────────────────────────
// NGO index — used by /ngo

export type NgoWithStatus = DimNgo & {
  chapter_count: number;
  has_supply: boolean;
};

export async function listNgos(): Promise<NgoWithStatus[]> {
  return sql<NgoWithStatus[]>`
    select
      n.orgnr,
      n.slug,
      n.name,
      n.brand_name,
      n.website_url,
      n.tier,
      n.chapter_data_shape,
      n.has_chapters,
      n.primary_focus,
      n.icnpo_code_1,
      n.icnpo_code_2,
      n.icnpo_code_3,
      coalesce(c.chapter_count, 0)::int as chapter_count,
      coalesce(c.chapter_count, 0) > 0   as has_supply
    from marts.dim_ngo n
    left join (
      select ngo_orgnr, count(*) as chapter_count
      from marts.dim_chapter
      where is_active
      group by ngo_orgnr
    ) c on c.ngo_orgnr = n.orgnr
    order by n.name
  `;
}

export async function getNgoBySlug(slug: string): Promise<DimNgo | null> {
  const rows = await sql<DimNgo[]>`
    select
      orgnr, slug, name, brand_name, website_url, tier,
      chapter_data_shape, has_chapters, primary_focus,
      icnpo_code_1, icnpo_code_2, icnpo_code_3
    from marts.dim_ngo
    where slug = ${slug}
    limit 1
  `;
  return rows[0] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-NGO overview — used by /ngo/redcross

export type NgoOverview = {
  ngo: DimNgo;
  chapter_count: number;
  national_count: number;
  regional_count: number;
  local_count: number;
  activity_count: number;
  kommune_count: number;
};

export async function getNgoOverview(orgnr: string): Promise<NgoOverview | null> {
  const ngo = await sql<DimNgo[]>`
    select
      orgnr, slug, name, brand_name, website_url, tier,
      chapter_data_shape, has_chapters, primary_focus,
      icnpo_code_1, icnpo_code_2, icnpo_code_3
    from marts.dim_ngo
    where orgnr = ${orgnr}
    limit 1
  `;
  if (ngo.length === 0) return null;

  const stats = await sql<
    {
      chapter_count: number;
      national_count: number;
      regional_count: number;
      local_count: number;
      activity_count: number;
      kommune_count: number;
    }[]
  >`
    select
      (select count(*) from marts.dim_chapter where ngo_orgnr = ${orgnr})::int                           as chapter_count,
      (select count(*) from marts.dim_chapter where ngo_orgnr = ${orgnr} and chapter_level = 'national')::int as national_count,
      (select count(*) from marts.dim_chapter where ngo_orgnr = ${orgnr} and chapter_level = 'regional')::int as regional_count,
      (select count(*) from marts.dim_chapter where ngo_orgnr = ${orgnr} and chapter_level = 'local')::int    as local_count,
      (select count(*) from marts.dim_activity where ngo_orgnr = ${orgnr})::int                          as activity_count,
      (select count(distinct kommune_nr) from marts.dim_chapter
        where ngo_orgnr = ${orgnr} and kommune_nr is not null and is_active)::int                        as kommune_count
  `;

  return {
    ngo: ngo[0]!,
    ...stats[0]!,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Chapter table — used by /ngo/redcross/chapters

export type ChapterFilters = {
  ngo_orgnr: string;
  kommune_nr?: string;
  fylke_nr?: string;
  chapter_level?: ChapterLevel;
  service_category_code?: string;
  is_active?: boolean; // default true
  q?: string; // free-text on chapter name
};

export type ChapterRow = {
  chapter_id: string;
  name: string;
  chapter_level: ChapterLevel;
  parent_chapter_id: string | null;
  parent_name: string | null;
  kommune_nr: string | null;
  kommune_name: string | null;
  fylke_nr: string | null;
  fylke_name: string | null;
  is_active: boolean;
};

export async function listChapters(filters: ChapterFilters): Promise<ChapterRow[]> {
  const isActive = filters.is_active ?? true;
  return sql<ChapterRow[]>`
    select
      c.chapter_id,
      c.name,
      c.chapter_level,
      c.parent_chapter_id,
      pc.name                                 as parent_name,
      c.kommune_nr,
      k.kommune_name,
      k.fylke_nr,
      f.fylke_name,
      c.is_active
    from marts.dim_chapter c
    left join marts.dim_chapter pc on pc.chapter_id = c.parent_chapter_id
    left join marts.dim_kommune  k  on k.kommune_nr = c.kommune_nr
    left join marts.dim_fylke    f  on f.fylke_nr = k.fylke_nr
    where c.ngo_orgnr = ${filters.ngo_orgnr}
      and c.is_active = ${isActive}
      ${filters.kommune_nr ? sql`and c.kommune_nr = ${filters.kommune_nr}` : sql``}
      ${filters.fylke_nr ? sql`and k.fylke_nr = ${filters.fylke_nr}` : sql``}
      ${filters.chapter_level ? sql`and c.chapter_level = ${filters.chapter_level}` : sql``}
      ${filters.q ? sql`and c.name ilike ${"%" + filters.q + "%"}` : sql``}
      ${
        filters.service_category_code
          ? sql`and exists (
              select 1
              from marts.fact_chapter_activities fca
              join marts.dim_activity a on a.activity_id = fca.activity_id
              where fca.chapter_id = c.chapter_id
                and a.service_category_code = ${filters.service_category_code}
            )`
          : sql``
      }
    order by c.name
  `;
}

export async function countActiveChapters(ngo_orgnr: string): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
    from marts.dim_chapter
    where ngo_orgnr = ${ngo_orgnr} and is_active
  `;
  return rows[0]?.n ?? 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Chapter detail — used by /ngo/redcross/chapters/[chapter_id]

export type ChapterDetail = {
  chapter: DimChapter;
  kommune_name: string | null;
  fylke_name: string | null;
  parent: { chapter_id: string; name: string } | null;
  children: { chapter_id: string; name: string; is_active: boolean }[];
  activities: {
    activity_id: string;
    canonical_name: string;
    service_category_code: string;
    service_category_label_no: string;
  }[];
  ngo: DimNgo;
};

export async function getChapterDetail(
  chapter_id: string,
): Promise<ChapterDetail | null> {
  const chapterRows = await sql<
    (DimChapter & { kommune_name: string | null; fylke_name: string | null })[]
  >`
    select
      c.chapter_id, c.ngo_orgnr, c.chapter_level, c.parent_chapter_id,
      c.chapter_orgnr, c.name, c.kommune_nr, c.is_active,
      c.postal_address_line1, c.postal_code, c.post_office,
      c.phone, c.email, c.web, c.updated_at,
      k.kommune_name,
      f.fylke_name
    from marts.dim_chapter c
    left join marts.dim_kommune k on k.kommune_nr = c.kommune_nr
    left join marts.dim_fylke   f on f.fylke_nr = k.fylke_nr
    where c.chapter_id = ${chapter_id}
    limit 1
  `;
  if (chapterRows.length === 0) return null;
  const { kommune_name, fylke_name, ...chapter } = chapterRows[0]!;

  const ngoRows = await sql<DimNgo[]>`
    select
      orgnr, slug, name, brand_name, website_url, tier,
      chapter_data_shape, has_chapters, primary_focus,
      icnpo_code_1, icnpo_code_2, icnpo_code_3
    from marts.dim_ngo
    where orgnr = ${chapter.ngo_orgnr}
    limit 1
  `;
  const ngo = ngoRows[0]!;

  const parentRows = chapter.parent_chapter_id
    ? await sql<{ chapter_id: string; name: string }[]>`
        select chapter_id, name
        from marts.dim_chapter
        where chapter_id = ${chapter.parent_chapter_id}
      `
    : [];
  const parent = parentRows[0] ?? null;

  const children = await sql<
    { chapter_id: string; name: string; is_active: boolean }[]
  >`
    select chapter_id, name, is_active
    from marts.dim_chapter
    where parent_chapter_id = ${chapter_id}
    order by name
  `;

  const activities = await sql<
    {
      activity_id: string;
      canonical_name: string;
      service_category_code: string;
      service_category_label_no: string;
    }[]
  >`
    select distinct
      a.activity_id,
      a.canonical_name,
      a.service_category_code,
      sc.label_no as service_category_label_no
    from marts.fact_chapter_activities fca
    join marts.dim_activity a               on a.activity_id = fca.activity_id
    join marts.ref_atlas_service_category sc on sc.code = a.service_category_code
    where fca.chapter_id = ${chapter_id}
    order by a.canonical_name
  `;

  return { chapter, kommune_name, fylke_name, parent, children, activities, ngo };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-NGO activity catalog — used by /ngo/redcross/aktiviteter

export type ActivityRow = DimActivity & {
  service_category_label_no: string;
  chapter_count: number;
};

export async function listActivities(ngo_orgnr: string): Promise<ActivityRow[]> {
  return sql<ActivityRow[]>`
    select
      a.activity_id,
      a.ngo_orgnr,
      a.canonical_name,
      a.service_category_code,
      a.is_active,
      sc.label_no as service_category_label_no,
      coalesce(cc.chapter_count, 0)::int as chapter_count
    from marts.dim_activity a
    join marts.ref_atlas_service_category sc on sc.code = a.service_category_code
    left join (
      select activity_id, count(distinct chapter_id) as chapter_count
      from marts.fact_chapter_activities
      where is_active
      group by activity_id
    ) cc on cc.activity_id = a.activity_id
    where a.ngo_orgnr = ${ngo_orgnr}
    order by a.canonical_name
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// Distrikter (regional chapters) — used by /ngo/redcross/distrikter
// and /ngo/redcross/distrikt/[distrikt_id]

export type DistriktRow = {
  chapter_id: string;
  name: string;
  kommune_nr: string | null;
  kommune_name: string | null;
  child_count: number;
  kommune_coverage_count: number;
};

export async function listDistrikter(ngo_orgnr: string): Promise<DistriktRow[]> {
  return sql<DistriktRow[]>`
    select
      c.chapter_id,
      c.name,
      c.kommune_nr,
      k.kommune_name,
      coalesce(stats.child_count, 0)::int            as child_count,
      coalesce(stats.kommune_coverage_count, 0)::int as kommune_coverage_count
    from marts.dim_chapter c
    left join marts.dim_kommune k on k.kommune_nr = c.kommune_nr
    left join (
      select
        parent_chapter_id,
        count(*)                                  as child_count,
        count(distinct kommune_nr)
          filter (where kommune_nr is not null)   as kommune_coverage_count
      from marts.dim_chapter
      where is_active
      group by parent_chapter_id
    ) stats on stats.parent_chapter_id = c.chapter_id
    where c.ngo_orgnr = ${ngo_orgnr}
      and c.chapter_level = 'regional'
    order by c.name
  `;
}

export type DistriktDetail = {
  distrikt: DimChapter;
  kommune_name: string | null;
  children: {
    chapter_id: string;
    name: string;
    kommune_name: string | null;
    is_active: boolean;
  }[];
  child_count: number;
  kommune_count: number;
  service_category_count: number;
};

export async function getDistriktDetail(
  chapter_id: string,
): Promise<DistriktDetail | null> {
  const rows = await sql<(DimChapter & { kommune_name: string | null })[]>`
    select
      c.chapter_id, c.ngo_orgnr, c.chapter_level, c.parent_chapter_id,
      c.chapter_orgnr, c.name, c.kommune_nr, c.is_active,
      c.postal_address_line1, c.postal_code, c.post_office,
      c.phone, c.email, c.web, c.updated_at,
      k.kommune_name
    from marts.dim_chapter c
    left join marts.dim_kommune k on k.kommune_nr = c.kommune_nr
    where c.chapter_id = ${chapter_id}
      and c.chapter_level = 'regional'
    limit 1
  `;
  if (rows.length === 0) return null;
  const { kommune_name, ...distrikt } = rows[0]!;

  const children = await sql<
    {
      chapter_id: string;
      name: string;
      kommune_name: string | null;
      is_active: boolean;
    }[]
  >`
    select c.chapter_id, c.name, k.kommune_name, c.is_active
    from marts.dim_chapter c
    left join marts.dim_kommune k on k.kommune_nr = c.kommune_nr
    where c.parent_chapter_id = ${chapter_id}
    order by c.name
  `;

  const stats = await sql<
    { kommune_count: number; service_category_count: number }[]
  >`
    select
      (select count(distinct c.kommune_nr)
         from marts.dim_chapter c
         where c.parent_chapter_id = ${chapter_id}
           and c.kommune_nr is not null
           and c.is_active)::int as kommune_count,
      (select count(distinct a.service_category_code)
         from marts.fact_chapter_activities fca
         join marts.dim_chapter c    on c.chapter_id = fca.chapter_id
         join marts.dim_activity a   on a.activity_id = fca.activity_id
         where c.parent_chapter_id = ${chapter_id}
           and fca.is_active)::int as service_category_count
  `;

  return {
    distrikt,
    kommune_name,
    children,
    child_count: children.length,
    kommune_count: stats[0]?.kommune_count ?? 0,
    service_category_count: stats[0]?.service_category_count ?? 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Chapters in a kommune — used by extension to /kommuner/[kommune_nr]

export type KommuneChapterRow = {
  chapter_id: string;
  name: string;
  ngo_orgnr: string;
  ngo_name: string;
  ngo_brand_name: string | null;
  service_category_code: string;
  service_category_label_no: string;
};

export async function listChaptersInKommune(
  kommune_nr: string,
): Promise<KommuneChapterRow[]> {
  // sc.sort_order is in the select list to satisfy `SELECT DISTINCT … ORDER BY`
  // — Postgres requires every ORDER BY expression to appear in the projection
  // when DISTINCT is used. We don't expose it in the type; consumers ignore it.
  return sql<KommuneChapterRow[]>`
    select distinct
      c.chapter_id,
      c.name,
      c.ngo_orgnr,
      n.name           as ngo_name,
      n.brand_name     as ngo_brand_name,
      a.service_category_code,
      sc.label_no      as service_category_label_no,
      sc.sort_order    as sort_order
    from marts.fact_chapter_activities fca
    join marts.dim_chapter c               on c.chapter_id = fca.chapter_id
    join marts.dim_ngo n                   on n.orgnr = c.ngo_orgnr
    join marts.dim_activity a              on a.activity_id = fca.activity_id
    join marts.ref_atlas_service_category sc on sc.code = a.service_category_code
    where c.kommune_nr = ${kommune_nr}
      and c.is_active
      and c.chapter_level = 'local'
    order by sort_order, c.name
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// Service category list — used by /ngo/redcross/aktiviteter for the link target
// (and eventually by /aktivitet index in v1.5).

export async function listServiceCategories(): Promise<
  { code: string; label_no: string; sort_order: number }[]
> {
  return sql<{ code: string; label_no: string; sort_order: number }[]>`
    select code, label_no, sort_order
    from marts.ref_atlas_service_category
    order by sort_order
  `;
}

export async function listFylker(): Promise<
  { fylke_nr: string; fylke_name: string }[]
> {
  return sql<{ fylke_nr: string; fylke_name: string }[]>`
    select fylke_nr, fylke_name
    from marts.dim_fylke
    where is_active
    order by fylke_name
  `;
}
