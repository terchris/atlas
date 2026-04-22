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
5. **MUST** declare a description in `schema.yml` for every column in every marts model.
6. **MUST** declare a `relationships:` test for every column that references a `dim_*` table.
7. **MUST** commit changes that follow this file, not ones that violate it. If a rule is wrong, change the rule; don't bypass it.

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
| Atlas source identifier | `source_id` | `text` | `"ssb-08764"` form, matches catalogue |
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
| `raw.*` | Upstream landing. Names follow source. | `atlas-data-repo/ingest/*` | `dbt` only |
| `marts.*` | Atlas public contract. Canonical names. | `dbt` only | frontend, analysts, public API, other teams |
| `dagster.*` | Dagster platform metadata. | Dagster itself | Dagster itself |

A process **MUST NOT** write to a schema it doesn't own. A consumer **MUST NOT** read from a schema it's not listed for.

---

## Model naming

| Pattern | Use | Example |
|---|---|---|
| `dim_<concept>` | Conformed dimension. One per concept, never per source. | `dim_kommune`, `dim_fylke`, `dim_periode`, `dim_orgnr` |
| `indicators__<source_id>` | Per-source passthrough from raw. Double underscore. | `indicators__ssb_08764` |
| `fact_<concept>` | Fact table joining multiple sources, FKs to dims. | `fact_kommune_indicators` |
| `mart_<feature>` | Application-shaped marts sized to a specific feature. | `mart_coverage_gap_barnefattigdom` |

- **MUST NOT** prefix models by team, owner, or date.
- **MUST NOT** create variants like `dim_kommune_v2` — fix the original, deprecate only as a last resort.
- **SHOULD** keep mart names short; the schema prefix (`marts.`) carries the rest.

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
- PR checklist (see `atlas-data-repo/CONTRIBUTING.md`) asks each contributor to check this file.
- New columns that match a "Never in marts" entry → rename before merge.
- If no canonical name exists for a concept you're introducing, **add it to the Canonical vocabulary table in this file** as part of the same PR. The vocabulary grows deliberately, not by accident.

---

## Decoding strategy reference

The hybrid strategy for turning upstream codes into the canonical vocabulary above is documented in:

- [`docs/ai-developer/plans/completed/INVESTIGATE-code-label-mapping.md`](../ai-developer/plans/backlog/INVESTIGATE-code-label-mapping.md) — the original investigation (kept in backlog as a living reference).
- `atlas-data-repo/dbt/macros/parse_codes.sql` — `decode_sex`, `period_start_year`, `period_end_year`, `age_range_min(col, sep)`, `age_range_max(col, sep)`.
- `atlas-data-repo/dbt/seeds/` — the five `marts.ref_*` lookup CSVs and their refresh policy ([`seeds/README.md`](../../atlas-data-repo/dbt/seeds/README.md)).

When adding a new source with coded fields, follow the same hybrid pattern: small universal enums (`sex`, `housing_status`) inline; medium domain enums via a new `marts.ref_*` seed + left join; structured codes (period, age band) parsed into `_min/_max` or `_start/_end_year` integer columns alongside the raw text.

---

## Rationale

These rules exist because another team's data warehouse grew to 1800 tables with cryptic internal names that no consumer could read without an OpenAPI retrofit. Every rule here is a specific thing that could have prevented that, applied at the moment a new table is born rather than a decade later.
