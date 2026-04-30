# Atlas naming conventions

The constitution for names used anywhere a consumer sees them. "Consumer" = the Next.js frontend, any future public API, analyst tooling, or another team/app reading our data.

**Scope**: `marts.*` schema, public API endpoints, and any data product we expose beyond the ingest team.
**Out of scope**: `raw.*` schema — raw names follow upstream verbatim by design; the rename happens in the dbt passthrough.

This file is authoritative. When it conflicts with a specific model, fix the model.

---

## Hard rules

All rules apply to marts, public APIs, and any external contract.

1. **MUST** use `snake_case` for every identifier (schemas, tables, columns, constants).
2. **MUST** use full words — no abbreviations except those in the canonical vocabulary below.
3. **MUST** use English for generic identifiers (model names, verb-based columns). **MUST** preserve Norwegian for Norway-specific concepts: `kommune`, `fylke`, `orgnr`, `bydel`, `grunnkrets`.
4. **MUST NOT** let raw column names from upstream leak into marts. Rename in the dbt passthrough.
5. **MUST** declare a description in `schema.yml` for every column in every model, seed, and source. Enforced repo-wide by [`atlas-data/dbt/check-osmosis.sh`](../../atlas-data/dbt/check-osmosis.sh) (PLAN-002 phase 6, 2026-04-28); a missing description fails CI.
6. **MUST** declare a `relationships:` test for every column that references a `dim_*` table.
7. **MUST** commit changes that follow this file, not ones that violate it. If a rule is wrong, change the rule; don't bypass it.
8. **MUST** update `website/docs/contributors/*.md` in the same PR as any change to behaviour the page documents. If you change how dbt-osmosis is configured, the `dbt-osmosis.md` page is part of the same PR. If you change the source-add workflow, `adding-a-source.md` updates with it. The contributor docs are the canonical guide; PRs that drift from them create a divergent local rule (rule #7 forbids this). PLAN-003 phase 5 (2026-04-28) made this convention explicit; reviewer responsibility to flag.
9. **MUST** re-run `atlas-data/dbt/regenerate-api-v1.sh` and commit the updated `atlas-data/dbt/api_v1_generated.sql` + `atlas-data/dbt/api_v1_state.json` whenever a model under `models/marts/api/` is added, removed, or has columns / descriptions changed. The drift gate at [`atlas-data/dbt/check-api-v1.sh`](../../atlas-data/dbt/check-api-v1.sh) (PLAN-004 phase 3, 2026-04-29) fails CI if the generated artefacts on disk don't match what the generator would produce now. The artefacts ARE the public-API contract — `api_v1.*` is what PostgREST projects. See [`/website/docs/contributors/api-v1.md`](../../website/docs/contributors/api-v1.md) for the workflow.

---

## Canonical vocabulary

Use these **exact names** when the concept is present. Never invent variants.

| Concept | Canonical name | Type | Rules |
|---|---|---|---|
| 4-digit kommune code (active) | `kommune_nr` | `text` | 4 chars, zero-padded, must exist in `dim_kommune` |
| Kommune name | `kommune_name` | `text` | |
| 2-digit fylke code (active) | `fylke_nr` | `text` | 2 chars, zero-padded, must exist in `dim_fylke` |
| Fylke name | `fylke_name` | `text` | |
| Bydel code (Oslo/Bergen/etc.) | `bydel_code` | `text` | |
| Bydel name | `bydel_name` | `text` | |
| Calendar year as integer | `year` | `integer` | 1900–2100 |
| Three-year rolling period | `period` | `text` | e.g. `"2022-2024"` |
| 9-digit Brreg org number | `orgnr` | `text` | |
| Atlas source identifier | `source_id` | `text` | `"ssb-08764"` form, matches catalogue. Renamed from `raw.*.source_slug` at the dbt passthrough — see Raw-schema scraper conventions below. |
| Source-specific variable code | `contents_code` | `text` | verbatim from upstream |
| Human-readable label for `contents_code` | `contents_label` | `text` | verbatim from upstream |
| Upstream numeric value | `value` | `numeric` | null when suppressed |
| Upstream suppression marker | `status` | `text` | null when value is present |
| When this row was last loaded | `updated_at` | `timestamptz` | |
| Valid-from date (temporal dims) | `valid_from` | `date` | |
| Valid-to date (temporal dims) | `valid_to` | `date` | null = still valid |
| Boolean currently-active flag | `is_active` | `boolean` | computed from `valid_to` |
| Geographic region code, mixed type | `region_code` | `text` | **Allowed only at mart level where mixing is intentional.** For kommune-only data use `kommune_nr`. |
| Biological/administrative sex | `sex` | `text` | One of `"male"`, `"female"`, `"all"`. Decode raw codes via the `{{ decode_sex(col) }}` macro in `dbt/macros/parse_codes.sql` (`'0'`→`'all'`, `'1'`→`'male'`, `'2'`→`'female'`). |
| Single-year age | `age` | `text` | Upstream codes preserved (`"000"` … `"105+"`). |
| Single-year age as integer | `age_int` | `integer` | NULL for the open-ended `"105+"` bucket. |
| Floor of single-year age (incl. open-ended) | `age_min` | `integer` | `105` for `"105+"`; sortable, never NULL. |
| Age band | `age_group` | `text` | Source-specific enum (varies per table); preserved verbatim. |
| Age band lower bound | `age_group_min` | `integer` | Parsed from `age_group` via the `age_range_min(col, sep)` macro. NULL for cryptic codes (`"999A"`). |
| Age band upper bound | `age_group_max` | `integer` | Same; NULL for open-ended (e.g. `"067+"`) and cryptic codes. |
| Three-year rolling period start | `period_start_year` | `integer` | Parsed from `period` via `period_start_year(col)` macro. Handles both `"YYYY_YYYY"` (FHI) and `"YYYY-YYYY"` (SSB 12944). |
| Three-year rolling period end | `period_end_year` | `integer` | Same. |
| Family type (SSB FamilieType) | `family_type` | `text` | Codes `"001"`–`"009"`; must exist in `marts.ref_ssb_family_type`. |
| Family type label (Norwegian) | `family_type_label_no` | `text` | From `ref_ssb_family_type`. |
| Family type label (English) | `family_type_label_en` | `text` | From `ref_ssb_family_type`. |
| Household type (SSB HusholdType) | `household_type` | `text` | Codes `"0000"`–`"0004"`; must exist in `marts.ref_ssb_household_type`. |
| Household type label (Norwegian) | `household_type_label_no` | `text` | |
| Household type label (English) | `household_type_label_en` | `text` | |
| Education level — subject's own (SSB Nivaa NUS2000) | `education_level` | `text` | Codes from `marts.ref_ssb_nivaa`. **Use this only when the source measures the subject's own level.** For child-outcome tables stratified by parental education, use `parents_education`. |
| Education level label (Norwegian) | `education_level_label_no` | `text` | From `ref_ssb_nivaa`. |
| Education level label (English) | `education_level_label_en` | `text` | From `ref_ssb_nivaa`. |
| Education level — parents' (FHI UTDANN) | `parents_education` | `text` | Codes `"0"`–`"4"`; must exist in `marts.ref_fhi_utdann`. Distinct vocabulary from SSB Nivaa — coarser scheme; the two are not interchangeable. |
| Parents' education label (Norwegian) | `parents_education_label_no` | `text` | From `ref_fhi_utdann`. FHI publishes Norwegian only. |
| Immigration category (FHI INNVKAT) | `immigration_category` | `text` | From `marts.ref_fhi_innvkat`. |
| Immigration category label (Norwegian) | `immigration_category_label_no` | `text` | |
| Housing status (FHI BODD) | `housing_status` | `text` | `"trangt"` / `"uoppgitt"`; readable as-is, no seed. |
| School grade (FHI TRINN) | `grade` | `text` | `"7"` / `"10"` etc.; readable as-is, no seed. |
| UN Sustainable Development Goal | `sdg_code` | `text` | `"1"`–`"17"`; must exist in `marts.ref_un_sdg`. |
| ICNPO category code (Brreg) | `icnpo_code` | `text` | Frivillighetsregisteret's classification of NGOs. 1- or 2-digit codes are main groups; 4- or 5-digit codes are subgroups. Must exist in `marts.ref_brreg_icnpo`. |
| Postal code | `postnummer` | `text` | 4 chars, zero-padded; must exist in `marts.dim_postnummer`. |
| Postal-area name | `post_office` | `text` | From `dim_postnummer`; ALLCAPS as published by Bring. |
| Free-text municipality name | `name` | `text` | Used in `marts.crosswalk_kommune_name` to resolve upstream text to `kommune_nr`. |
| Kind of resolved name | `name_kind` | `text` | One of `"canonical"`, `"alternative"`, `"historical"` in `crosswalk_kommune_name`. |
| NGO Brreg organisasjonsnummer | `ngo_orgnr` | `text` | 9 chars; must exist in `marts.dim_ngo`. Same shape as `orgnr` but namespaced when used as a foreign key in supply-side facts/dims. |
| NGO URL slug | `ngo_slug` | `text` | kebab-case, lowercase, unique in `dim_ngo`. URL-friendly; what filters and routes use (`'redcross'`, `'kirkens-bymisjon'`, `'sanitetskvinnene'`). |
| NGO structural-fit tier | `tier` | `text` | One of `"A"`, `"B"`, `"B-minus"`, `"C-donor"`, `"C-petition"`, `"C-industry"`, `"C-quasigovernmental"` (per `docs/research/ngo-landscape.md`). |
| NGO chapter-data shape | `chapter_data_shape` | `text` | One of `"api_canonical"`, `"cms_bins"`, `"programme_only"`, `"no_structure"`. Drives ingest pattern. |
| NGO primary focus | `primary_focus` | `text` | One of `"humanitarian"`, `"health"`, `"social"`, `"youth"`, `"environment"`, `"civic"`, `"patient_support"`, `"faith_adjacent"`, `"service_club"`. |
| Atlas service category | `service_category_code` | `text` | snake_case identifier; must exist in `marts.ref_atlas_service_category`. The cross-NGO connector — every `dim_activity` row points at one category. |
| Chapter id (cross-NGO) | `chapter_id` | `text` | Composite slug, e.g. `'redcross-L098'`. Namespaced by NGO so PKs don't collide. Must exist in `marts.dim_chapter`. |
| Chapter level | `chapter_level` | `text` | One of `"national"`, `"regional"`, `"local"`. Coverage-gap supply queries filter to `'local'`. |
| Parent chapter id | `parent_chapter_id` | `text` | Self-FK on `dim_chapter`. NULL for top-level (national) and orphan (Ukjent) rows. |
| Chapter's own Brreg orgnr | `chapter_orgnr` | `text` | Optional 9-digit orgnr if the chapter is separately registered with Brreg (e.g. Red Cross local branches each have own). NULL otherwise. |
| Chapter subtype (non-geographic) | `chapter_subtype` | `text` | NULL = normal geographic chapter. Optional vocabulary for structurally distinct chapters: `"youth-political"` (e.g. NF Solidaritetsungdom), `"youth-health"` (NF Sanitetsungdom / RC RØFF), `"student"`, `"hospital"`, `"umbrella"`. Free-text in v1; promoted to `accepted_values` once 3+ NGOs populate it consistently. Used by frontend to filter chapter-finder maps to `chapter_subtype IS NULL` (kommune-anchored supply) vs structurally-distinct rows. |
| Activity id (cross-NGO) | `activity_id` | `text` | Composite slug `<ngo_slug>-<canonical_slug>`, e.g. `'redcross-besokstjeneste'`. Must exist in `marts.dim_activity`. |
| NGO's canonical activity name | `canonical_name` | `text` | The NGO's own canonical term, verbatim (e.g. Red Cross's `globalActivityName = "Besøkstjeneste"`). Per-NGO reporting pivots on this. |
| NGO's local activity display string | `local_activity_name` | `text` | Per-chapter display string (e.g. `"Modum Røde Kors Besøkstjeneste"`). On `fact_chapter_activities` only. |

## Raw-schema scraper conventions

These names are raw-schema only (per the "raw follows upstream" scope rule above, with an exception here because scraper raw tables share a consistent column set across all sources — see INVESTIGATE-ngo-scraping-infrastructure §C.5). Listed here so a new scraper author doesn't have to chase them across multiple files.

| Concept | Name in `raw.*` | Type | Rules |
|---|---|---|---|
| Source ingest identity | `source_slug` | `text` | Matches the `src/sources/<slug>/` folder name and the `npm run ingest:<slug>` script. kebab-case. Cross-source shared tables (`raw.ingest_runs`, `raw.sitemap_log`) use this; per-source raw tables don't (their name already scopes the source). **Renamed to `source_id` at the marts boundary.** |
| Scraped-page URL | `url` | `text not null unique` | Verbatim sitemap URL; no normalization. Join key against `raw.sitemap_log.url` for orphan detection and fetch-skip. Every scraper raw **parent** table must carry it. |
| Extracted-record hash | `record_hash` | `text not null` | sha256 of canonical JSON (`fast-json-stable-stringify` + NFC). 64 hex chars. Skip signal for upsert: equal hash = no DB write. |
| HTML body hash (audit) | `html_raw_hash` | `text` (nullable) | sha256 of canonicalized body. Audit-only — template-drift forensics via `mart_ingest_health`. Not a skip signal. |
| Row active flag | `is_active` | `boolean not null default true` | Set `false` on fetch-time 404 or sitemap orphan. Preserves history instead of deleting the row. |
| Sitemap lastmod | `lastmod` | `timestamptz` (nullable) | NULL when the sitemap omits `<lastmod>` or the source uses HTML-index discovery. NULL is never a trustworthy skip signal (see §C.2 step 3 of the investigation). |
| Shared cross-source tables | `raw.ingest_runs`, `raw.sitemap_log` | | One table across all scraper (and API-source) ingests. `source_slug` is the discriminator column. Migrations: `NNN_raw_ingest_runs.sql`, `NNN_raw_sitemap_log.sql`. |

## Never in marts

Forbidden names, and what to use instead.

| Seen upstream | Never in marts — use this instead |
|---|---|
| `kommunenummer`, `komnr`, `kommunenr` | `kommune_nr` |
| `Region`, `region`, `regioncode` (when kommune-only) | `kommune_nr` |
| `K_0301` style prefixed code | strip prefix in dbt; store as `kommune_nr` |
| `kommunenavn`, `region_name` (when kommune-only) | `kommune_name` |
| `aar`, `tid`, `period_year`, `year_code` | `year` (integer) or `period` (text) |
| `organisasjonsnummer`, `org_id`, `orgnummer` | `orgnr` |
| `verdi`, `amount`, `val`, `v` | `value` |
| `loaded_at` (when exposed beyond raw) | `updated_at` |
| `id`, `recno`, `row_id` | don't expose; use the business key |
| `created_by`, `modified_by` | don't expose unless the concept is user-facing |
| SSB's raw sex codes `"1"` / `"2"` / `"0"` | `"male"` / `"female"` / `"all"` (via `decode_sex` macro) |
| `kjonn`, `kjønn`, `gender`, `kjonn_code`, `sex_code` | `sex` |
| `aar_code` (FHI), `tid_code` | `period` (text); also `period_start_year` / `period_end_year` (int) |
| `alder_code` (FHI) | `age_group` (text); also `age_group_min` / `age_group_max` (int) |
| `utdann_code` (FHI) when source stratifies by parental education | `parents_education` (+ `parents_education_label_no`) |
| `innvkat_code` | `immigration_category` (+ `immigration_category_label_no`) |
| `bodd_code` | `housing_status` |
| `trinn_code` | `grade` |

---

## Schema assignments

| Schema | Purpose | Who writes | Who reads |
|---|---|---|---|
| `raw.*` | Upstream landing. Names follow source. | `atlas-data/ingest/*` | `dbt` only |
| `marts.*` | Atlas internal API-shaped layer. Canonical names. | `dbt` only | frontend (today, until PLAN-E migrates), analysts, the `api_v1` wrapper layer |
| `api_v1.*` | **External public contract.** Auto-generated wrapper views over `marts.mart_*` (one per `models/marts/api/` model). Versioned. PostgREST projects this as the OpenAPI surface at `api-atlas.helpers.no`. See [PLAN-004](../ai-developer/plans/active/PLAN-004-postgrest-api-v1-wrapper.md). | `atlas-data/dbt/scripts/generate_api_v1.py` (auto) | external API consumers, future `atlas_authenticator` PostgREST role |
| `dagster.*` | Dagster platform metadata. | Dagster itself | Dagster itself |

A process **MUST NOT** write to a schema it doesn't own. A consumer **MUST NOT** read from a schema it's not listed for.

---

## Model naming

| Pattern | Use | Example |
|---|---|---|
| `dim_<concept>` | Conformed dimension. One row per natural key. Used as a join target by facts. Owner is implicit from context — no second token. | `dim_kommune`, `dim_fylke`, `dim_postnummer`, `dim_ngo`, `dim_country` |
| `ref_<owner>_<concept>` | Reference taxonomy / controlled vocabulary / code-label decoder. **Owner is the second token** (`ssb`, `fhi`, `brreg`, `un`, `iso`, `atlas`, …); concept follows. Not the primary join target of any fact. | `ref_ssb_family_type`, `ref_fhi_utdann`, `ref_brreg_icnpo`, `ref_un_sdg`, `ref_atlas_service_category` |
| `crosswalk_<from>_<to>` | Explicit many-to-many or alternative-key mapping between two reference systems. Suffix reads as the relationship. May be implemented as a **seed** (when authoritative or hand-curated) or as a **derived dbt model** (when a projection of existing reference tables is enough). | `crosswalk_kommune_name` (derived from `dim_kommune`), `crosswalk_activity_to_category` (curated seed: NGO local activity → Atlas service category) |
| `indicators__<source_id>` | Per-source passthrough from raw. Double underscore. | `indicators__ssb_08764` |
| `fact_<concept>` | Fact table joining multiple sources, FKs to dims. | `fact_kommune_indicators` |
| `mart_<feature>` | Application-shaped marts sized to a specific feature. | `mart_coverage_gap_barnefattigdom` |
| `<entity>_kommune_coverage` | Link table declaring which kommuner a non-local entity serves. Rows are `(entity_id, kommune_nr, source)` with `source IN ('declared','inferred')`. Built by UNIONing per-source `supply__<ngo>_<entity>_kommune_coverage` staging models. | `chapter_kommune_coverage` (regional NGO chapters → kommuner) |

- **MUST NOT** prefix models by team or date (owner is encoded only in `ref_*`, where it's the source-of-truth distinction).
- **MUST NOT** create variants like `dim_kommune_v2` — fix the original, deprecate only as a last resort.
- **SHOULD** keep mart names short; the schema prefix (`marts.`) carries the rest.

### Choosing between `dim_*` and `ref_*`

When in doubt:

- If facts will join to it as a dimension (FK relationship enforced by `relationships:` tests), it's `dim_*`. Carries identity + descriptive attributes (e.g. `dim_kommune.kommune_name`, `dim_postnummer.post_office`).
- If it's a controlled list of codes that decodes upstream values or rolls indicators up to a standard taxonomy (ICNPO, SDG, NUS2000, …), it's `ref_<owner>_<concept>`.
- If it bridges two reference systems with a non-1:1 relationship (alt names → canonical, local term → Atlas vocabulary), it's `crosswalk_<from>_<to>`.

### When to add a new `mart_<feature>`

A `mart_*` model exists to **shape data for a specific consumer query** that the underlying `dim_*` / `fact_*` / `ref_*` surface can't express directly without aggregation, latest-year-per-X logic, or DISTINCT across multi-table joins. The driving consumer is usually a single Next.js page or a single public-API endpoint.

When you need one:

- A page or endpoint runs a CTE / multi-step aggregation against `marts.*` (e.g. "latest year per kommune", "count of children per chapter", "top N by metric").
- The same query gets reused across multiple consumers with the same shape.
- The query is too computed to express as a PostgREST embedded resource (covered in [`../ai-developer/plans/completed/INVESTIGATE-public-api-surface.md`](../ai-developer/plans/completed/INVESTIGATE-public-api-surface.md)).

Naming and shape:

- **Name by feature, not entity.** `mart_coverage_gap_barnefattigdom` ✓ (the page it serves). `mart_dim_ngo_with_chapter_count` ✗ (rename to `mart_ngo_index`).
- One row per consumer-meaningful natural key (e.g. one row per kommune, one row per indicator, one row per NGO).
- Compose from existing `dim_*` / `fact_*` models — never reach back into `raw.*`.
- Materialise as a table (default) when the consumer hits it on every page load; as a view when the underlying data changes more often than the read pattern justifies.

Subfolder convention: API-shaped marts live under `models/marts/api/`. The api_v1 generator (PLAN-004) walks this directory and emits one `api_v1.<feature>` wrapper view per model — drop the `mart_` prefix in the api_v1 name (e.g. `mart_indicator_summary` → `api_v1.indicator_summary`). Marts NOT under `models/marts/api/` are internal-only (consumed by Atlas's frontend or other dbt models) and are NOT exposed via PostgREST. After adding, removing, or changing a model under `models/marts/api/`, run `regenerate-api-v1.sh` (rule #9).

---

## Reference table refresh cadence

Reference and dimension tables fall into one of four refresh buckets. Pick at table creation; document in the table's `seeds/README.md` entry (for seeds) or in the model description (for non-seed dims).

| Bucket | When values change | Mechanism | Examples |
|---|---|---|---|
| **Never** | Truly fixed standards | Pin once in CSV; comment "do not refresh"; no script | `ref_un_sdg` (17 goals fixed since 2015); ISO 3166/4217 |
| **Rare** | Years between revisions | Manual via `refresh-seeds`-style script; review once per year | `ref_brreg_icnpo` (last revised 2009); the `ref_ssb_*` and `ref_fhi_*` decoders |
| **Periodic** | Annual / quarterly / on admin reform | Scheduled (initially manual; automatable later via Dagster) | `dim_kommune`, `dim_fylke` (annual + at reforms); `dim_postnummer` (quarterly). Derived crosswalks like `crosswalk_kommune_name` inherit their parent's cadence — no separate refresh. |
| **Curated** | When the team decides | Edit CSV in PR; no refresh script; review part of normal PR flow | `ref_atlas_service_category`; `crosswalk_activity_to_category` |

---

## Deprecation

When a model is retired:

1. Add `deprecation_date: YYYY-MM-DD` to its config. dbt warns on reference from that date.
2. Announce in the commit message that references should migrate.
3. Remove the model file at the deprecation date. No tolerance for "we'll delete it later" — we won't.

**Don't leave dead code in the repo.** Old tables rot; they become someone else's cleanup project.

---

## How this file is enforced

- `schema.yml` descriptions + `relationships:` tests catch most name-and-FK drift automatically.
- PR checklist (see `atlas-data/CONTRIBUTING.md`) asks each contributor to check this file.
- New columns that match a "Never in marts" entry → rename before merge.
- If no canonical name exists for a concept you're introducing, **add it to the Canonical vocabulary table in this file** as part of the same PR. The vocabulary grows deliberately, not by accident.

For a visual map of how these fields connect across `marts.*` (entities + relationships), see [`erd.md`](erd.md). It is regenerated from the same `relationships:` tests this file relies on.

---

## Decoding strategy reference

The hybrid strategy for turning upstream codes into the canonical vocabulary above is documented in:

- [`website/docs/ai-developer/plans/completed/INVESTIGATE-code-label-mapping.md`](../../website/docs/ai-developer/plans/completed/INVESTIGATE-code-label-mapping.md) — the original investigation.
- `atlas-data/dbt/macros/parse_codes.sql` — `decode_sex`, `period_start_year`, `period_end_year`, `age_range_min(col, sep)`, `age_range_max(col, sep)`.
- `atlas-data/dbt/seeds/` — the five `marts.ref_*` lookup CSVs and their refresh policy ([`seeds/README.md`](../../atlas-data/dbt/seeds/README.md)).

When adding a new source with coded fields, follow the same hybrid pattern: small universal enums (`sex`, `housing_status`) inline; medium domain enums via a new `marts.ref_*` seed + left join; structured codes (period, age band) parsed into `_min/_max` or `_start/_end_year` integer columns alongside the raw text.

The `ref_<owner>_<concept>` and `crosswalk_<from>_<to>` patterns extend to **all** reference tables Atlas adds going forward — see [Model naming](#model-naming) above and [INVESTIGATE-reference-tables-convention.md](../ai-developer/plans/backlog/INVESTIGATE-reference-tables-convention.md) for the convention's rationale.

---

## Rationale

These rules exist because another team's data warehouse grew to 1800 tables with cryptic internal names that no consumer could read without an OpenAPI retrofit. Every rule here is a specific thing that could have prevented that, applied at the moment a new table is born rather than a decade later.
