/** Shared types for the Atlas frontend. These mirror the `marts.*` schema
 *  that dbt produces — see `atlas-data-repo/dbt/models/` for authoritative
 *  definitions. Keep these aligned by hand until we auto-generate types.
 */

export type DimKommune = {
  kommune_nr: string;
  kommune_name: string;
  kommune_name_alt: string | null;
  fylke_nr: string;
  notes: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
  updated_at: Date;
};

export type DimFylke = {
  fylke_nr: string;
  fylke_name: string;
  fylke_name_alt: string | null;
  notes: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
  updated_at: Date;
};

export type FactKommuneIndicator = {
  source_id: string;
  kommune_nr: string;
  kommune_name: string;
  fylke_nr: string;
  fylke_name: string | null;
  year: number;
  contents_code: string;
  contents_label: string | null;
  value: string | null; // numeric is returned as string by postgres.js
  status: string | null;
  kommune_is_active: boolean;
  updated_at: Date;
};

// ────────────────────────────────────────────────────────────────────────────
// Supply side: dim_ngo, dim_chapter, dim_activity, fact_chapter_activities,
// ref_atlas_service_category. See atlas-data-repo/dbt/seeds/ + dimensions/ +
// supply/ for authoritative definitions.

export type DimNgo = {
  orgnr: string;
  slug: string;
  name: string;
  brand_name: string | null;
  website_url: string | null;
  tier: string;
  chapter_data_shape: "api_canonical" | "cms_bins" | "programme_only" | "no_structure";
  has_chapters: boolean;
  primary_focus: string | null;
  icnpo_code_1: string | null;
  icnpo_code_2: string | null;
  icnpo_code_3: string | null;
};

export type ChapterLevel = "national" | "regional" | "local";

/**
 * Optional subtype for non-geographic / structurally distinct chapters.
 * NULL for normal geographic chapters. Free-text in v1; promoted to
 * accepted_values test in dbt once 3+ NGOs populate it consistently
 * (per INVESTIGATE-multi-ngo-supply-model-extensions Q1).
 *
 * Current v1 vocabulary: 'youth-political', 'youth-health', 'student',
 * 'hospital', 'umbrella'.
 */
export type ChapterSubtype =
  | "youth-political"
  | "youth-health"
  | "student"
  | "hospital"
  | "umbrella";

export type DimChapter = {
  chapter_id: string;
  ngo_orgnr: string;
  chapter_level: ChapterLevel;
  parent_chapter_id: string | null;
  chapter_orgnr: string | null;
  name: string;
  kommune_nr: string | null;
  is_active: boolean;
  postal_address_line1: string | null;
  postal_code: string | null;
  post_office: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
  /** NULL for normal geographic chapters. See ChapterSubtype above. */
  chapter_subtype: ChapterSubtype | null;
  updated_at: Date;
};

export type DimActivity = {
  activity_id: string;
  ngo_orgnr: string;
  canonical_name: string;
  service_category_code: string;
  is_active: boolean;
};

export type FactChapterActivity = {
  chapter_id: string;
  activity_id: string;
  ngo_orgnr: string;
  kommune_nr: string | null;
  local_activity_name: string | null;
  canonical_name: string;
  is_active: boolean;
  source_id: string;
  updated_at: Date;
};

export type RefAtlasServiceCategory = {
  code: string;
  label_no: string;
  label_en: string;
  description: string | null;
  sort_order: number;
};
