import { sql } from "@/lib/db";
import { REDCROSS_ORGNR } from "@/lib/supply";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Atlas — Red Cross supply data validation",
  robots: { index: false, follow: false },
};

// Expected counts after PLAN-002 (Red Cross ingest).
const EXPECTED = {
  raw_branches: 391,
  raw_activities: 2143,
  dim_chapter: 391,
  dim_activity: 35,
  fact: 1941,
  national: 1,
  regional: 19,
  local: 371,
} as const;

type RowCount = { actual: number; expected: number; ok: boolean };

async function tryQuery<T>(q: () => Promise<T>): Promise<T | null> {
  try {
    return await q();
  } catch {
    return null;
  }
}

export default async function RedCrossValidationPage() {
  // Section 1 — marts counts (always available)
  const martsRow = await sql<
    { dim_chapter: number; dim_activity: number; fact: number }[]
  >`
    select
      (select count(*) from marts.dim_chapter where ngo_orgnr = ${REDCROSS_ORGNR})::int as dim_chapter,
      (select count(*) from marts.dim_activity where ngo_orgnr = ${REDCROSS_ORGNR})::int as dim_activity,
      (select count(*) from marts.fact_chapter_activities where source_id = 'redcross-branches')::int as fact
  `;
  const marts = martsRow[0]!;

  // Section 1 — raw counts (frontend role may not have access; degrade gracefully)
  const rawRow = await tryQuery(
    () => sql<{ raw_branches: number; raw_activities: number }[]>`
      select
        (select count(*) from raw.redcross_branches)::int as raw_branches,
        (select count(*) from raw.redcross_branch_activities)::int as raw_activities
    `,
  );

  const counts: Record<string, RowCount | null> = {
    "raw.redcross_branches": rawRow
      ? { actual: rawRow[0]!.raw_branches, expected: EXPECTED.raw_branches, ok: rawRow[0]!.raw_branches === EXPECTED.raw_branches }
      : null,
    "raw.redcross_branch_activities": rawRow
      ? { actual: rawRow[0]!.raw_activities, expected: EXPECTED.raw_activities, ok: rawRow[0]!.raw_activities === EXPECTED.raw_activities }
      : null,
    "dim_chapter (Red Cross)": { actual: marts.dim_chapter, expected: EXPECTED.dim_chapter, ok: marts.dim_chapter === EXPECTED.dim_chapter },
    "dim_activity (Red Cross)": { actual: marts.dim_activity, expected: EXPECTED.dim_activity, ok: marts.dim_activity === EXPECTED.dim_activity },
    "fact_chapter_activities (Red Cross)": { actual: marts.fact, expected: EXPECTED.fact, ok: marts.fact === EXPECTED.fact },
  };

  // Section 2 — chapter level breakdown
  const levels = await sql<{ chapter_level: string; n: number }[]>`
    select chapter_level, count(*)::int as n
    from marts.dim_chapter
    where ngo_orgnr = ${REDCROSS_ORGNR}
    group by chapter_level
    order by chapter_level
  `;

  // Section 3 — service category coverage
  const categories = await sql<
    { service_category_code: string; chapter_count: number }[]
  >`
    select da.service_category_code, count(distinct fca.chapter_id)::int as chapter_count
    from marts.fact_chapter_activities fca
    join marts.dim_activity da on da.activity_id = fca.activity_id
    where fca.source_id = 'redcross-branches'
    group by da.service_category_code
    order by chapter_count desc, da.service_category_code
  `;

  const allCategories = await sql<{ code: string; label_no: string }[]>`
    select code, label_no
    from marts.ref_atlas_service_category
    order by sort_order
  `;
  const coveredCodes = new Set(categories.map((c) => c.service_category_code));
  const uncoveredCategories = allCategories.filter((c) => !coveredCodes.has(c.code));

  // Section 4 — sample 10 random chapters
  const sample = await sql<
    {
      chapter_id: string;
      name: string;
      chapter_level: string;
      kommune_nr: string | null;
      kommune_name: string | null;
      is_active: boolean;
      web: string | null;
    }[]
  >`
    select c.chapter_id, c.name, c.chapter_level, c.kommune_nr, k.kommune_name, c.is_active, c.web
    from marts.dim_chapter c
    left join marts.dim_kommune k on k.kommune_nr = c.kommune_nr
    where c.ngo_orgnr = ${REDCROSS_ORGNR}
    order by random()
    limit 10
  `;

  // Section 5 — distrikt coverage
  const distrikter = await sql<
    {
      chapter_id: string;
      name: string;
      child_count: number;
      kommune_count: number;
    }[]
  >`
    select
      d.chapter_id,
      d.name,
      coalesce(s.child_count, 0)::int   as child_count,
      coalesce(s.kommune_count, 0)::int as kommune_count
    from marts.dim_chapter d
    left join (
      select parent_chapter_id,
             count(*) as child_count,
             count(distinct kommune_nr) filter (where kommune_nr is not null) as kommune_count
      from marts.dim_chapter
      where parent_chapter_id is not null and is_active
      group by parent_chapter_id
    ) s on s.parent_chapter_id = d.chapter_id
    where d.ngo_orgnr = ${REDCROSS_ORGNR}
      and d.chapter_level = 'regional'
    order by d.name
  `;

  // Section 6 — ingest run history (raw.ingest_runs may not be in role)
  const ingestRuns = await tryQuery(
    () => sql<
      {
        run_id: number;
        started_at: Date;
        finished_at: Date | null;
        exit_code: number | null;
        rows_scraped: number | null;
        rows_parsed: number | null;
        warnings_count: number;
        errors_count: number;
      }[]
    >`
      select run_id, started_at, finished_at, exit_code,
             rows_scraped, rows_parsed, warnings_count, errors_count
      from raw.ingest_runs
      where source_slug = 'redcross-branches'
      order by run_id desc
      limit 10
    `,
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 font-sans text-sm">
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">
          Atlas — Red Cross supply data validation
        </h1>
        <p className="mt-1 text-muted-foreground">
          Internal validation page. Not for public use. Renders fresh on every request.
        </p>
      </header>

      {/* Section 1 — Row counts */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">1. Row counts (expected vs actual)</h2>
        {!rawRow && (
          <p className="mb-2 text-muted-foreground">
            <em>
              raw.* counts are unavailable to this Postgres role; only marts.* counts shown.
            </em>
          </p>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4">Table</th>
              <th className="py-2 pr-4 text-right">Expected</th>
              <th className="py-2 pr-4 text-right">Actual</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(counts).map(([name, c]) => (
              <tr key={name} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono">{name}</td>
                <td className="py-2 pr-4 text-right">{c?.expected ?? "—"}</td>
                <td className="py-2 pr-4 text-right">{c?.actual ?? "—"}</td>
                <td className={`py-2 ${c?.ok === false ? "text-destructive" : ""}`}>
                  {c == null ? "—" : c.ok ? "✓" : "✗ MISMATCH"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 2 — Chapter level breakdown */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">2. Chapter level breakdown</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4">chapter_level</th>
              <th className="py-2 pr-4 text-right">Expected</th>
              <th className="py-2 pr-4 text-right">Actual</th>
            </tr>
          </thead>
          <tbody>
            {(["national", "regional", "local"] as const).map((level) => {
              const row = levels.find((l) => l.chapter_level === level);
              const actual = row?.n ?? 0;
              const expected = EXPECTED[level];
              const ok = actual === expected;
              return (
                <tr key={level} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono">{level}</td>
                  <td className="py-2 pr-4 text-right">{expected}</td>
                  <td className={`py-2 pr-4 text-right ${ok ? "" : "text-destructive"}`}>
                    {actual}
                    {ok ? " ✓" : " ✗"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Section 3 — Service category coverage */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">
          3. Service category coverage (Red Cross chapters per Atlas category)
        </h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4">service_category_code</th>
              <th className="py-2 pr-4 text-right">Chapters</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.service_category_code} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono">{c.service_category_code}</td>
                <td className="py-2 pr-4 text-right">{c.chapter_count}</td>
              </tr>
            ))}
            {uncoveredCategories.map((c) => (
              <tr key={c.code} className="border-b border-border/50 text-muted-foreground">
                <td className="py-2 pr-4 font-mono">{c.code}</td>
                <td className="py-2 pr-4 text-right">0 (no Red Cross chapter)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 4 — Sample chapters */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">4. Sample 10 random chapters</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4">chapter_id</th>
              <th className="py-2 pr-4">name</th>
              <th className="py-2 pr-4">level</th>
              <th className="py-2 pr-4">kommune</th>
              <th className="py-2 pr-4">active</th>
              <th className="py-2">web</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((c) => (
              <tr key={c.chapter_id} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs">{c.chapter_id}</td>
                <td className="py-2 pr-4">{c.name}</td>
                <td className="py-2 pr-4">{c.chapter_level}</td>
                <td className="py-2 pr-4">
                  {c.kommune_name ?? "—"}{" "}
                  <span className="text-muted-foreground">{c.kommune_nr ?? ""}</span>
                </td>
                <td className="py-2 pr-4">{c.is_active ? "yes" : "no"}</td>
                <td className="py-2 truncate text-xs text-muted-foreground">
                  {c.web ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 5 — Distrikt coverage */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">
          5. Distrikt coverage ({distrikter.length} distrikter)
        </h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4">name</th>
              <th className="py-2 pr-4 text-right">Active children</th>
              <th className="py-2 pr-4 text-right">Distinct kommuner</th>
            </tr>
          </thead>
          <tbody>
            {distrikter.map((d) => (
              <tr key={d.chapter_id} className="border-b border-border/50">
                <td className="py-2 pr-4">{d.name}</td>
                <td className="py-2 pr-4 text-right">{d.child_count}</td>
                <td className="py-2 pr-4 text-right">{d.kommune_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 6 — Ingest run history */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">
          6. Ingest run history (raw.ingest_runs)
        </h2>
        {ingestRuns == null ? (
          <p className="text-muted-foreground">
            <em>
              raw.ingest_runs is not visible to this Postgres role
              (frontend role is SELECT-only on marts.*). The redcross-branches
              ingest pre-dates the scraping infrastructure; future re-runs will
              populate this table.
            </em>
          </p>
        ) : ingestRuns.length === 0 ? (
          <p className="text-muted-foreground">
            <em>No runs recorded yet for source_slug = redcross-branches.</em>
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 text-right">run_id</th>
                <th className="py-2 pr-4">started_at</th>
                <th className="py-2 pr-4">finished_at</th>
                <th className="py-2 pr-4 text-right">exit</th>
                <th className="py-2 pr-4 text-right">scraped</th>
                <th className="py-2 pr-4 text-right">parsed</th>
                <th className="py-2 pr-4 text-right">warns</th>
                <th className="py-2 text-right">errors</th>
              </tr>
            </thead>
            <tbody>
              {ingestRuns.map((r) => (
                <tr key={r.run_id} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-right font-mono">{r.run_id}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {new Date(r.started_at).toISOString()}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {r.finished_at ? new Date(r.finished_at).toISOString() : "—"}
                  </td>
                  <td className={`py-2 pr-4 text-right ${r.exit_code === 0 ? "" : "text-destructive"}`}>
                    {r.exit_code ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">{r.rows_scraped ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{r.rows_parsed ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{r.warnings_count}</td>
                  <td className={`py-2 text-right ${r.errors_count > 0 ? "text-destructive" : ""}`}>
                    {r.errors_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-12 border-t border-border pt-4 text-xs text-muted-foreground">
        Page rendered at {new Date().toISOString()}. No caching.
      </footer>
    </main>
  );
}
