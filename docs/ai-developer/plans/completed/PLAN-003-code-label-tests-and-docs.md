# Plan 003: Tests and naming-conventions for the new vocabulary

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Lock in the new canonical vocabulary introduced by PLAN-001 + PLAN-002 — add `accepted_values` tests for the decoded enum columns, `accepted_range` tests for the parsed integer columns, `relationships` tests from indicator codes back to their `ref_*` seeds, and extend [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with every new field.

**Last Updated**: 2026-04-22
**Completed**: 2026-04-22

**Investigation**: [INVESTIGATE-code-label-mapping.md](INVESTIGATE-code-label-mapping.md)
**Prerequisites**: PLAN-001 (seeds) ✓ and PLAN-002 (indicator models) ✓ — both completed 2026-04-22.
**Priority**: Medium — closes the investigation.

---

## Overview

PLAN-002 added new columns but only fixed the schema.yml entries that broke dbt test (renames of `sex_code` → `sex`, `education_level` → `parents_education`). This plan **adds** tests for everything new, so future changes can't silently drift the vocabulary, and it updates the canonical naming table so contributors choose the right names without asking.

After this plan:
- Every code column with a corresponding seed has a `relationships` test back to that seed (single source of truth — when the seed changes, the test follows).
- Decoded enum columns without a seed (`sex`, `housing_status`, `grade`) have an `accepted_values` test pinned to the small known set.
- Every `_label_no`/`_label_en` column derived from a seed has a `not_null` test (left join + relationships means nothing should slip through as null).
- Every parsed integer column (`period_start_year`, `age_group_min`, `age_int`, etc.) has an `accepted_range` test.
- `naming-conventions.md` lists every new canonical field, plus the FHI raw column names that must never leak into marts.

**One test per concept, not two.** Where a `relationships` test to a seed already catches drift, do not also add `accepted_values` listing the same codes — the seed is the source of truth and `accepted_values` would be a duplicate to hand-edit.

The seed-README task from the original investigation checklist (*"Document each seed in `dbt/seeds/README.md` with source and update policy"*) was already done as part of PLAN-001 — no-op here.

---

## Phase 1: schema.yml — accepted_values, ranges, relationships

Walk the 9 indicator models with new columns and pin their values.

### Tasks

- [ ] 1.1 [`indicators__ssb_06083`](../../../../atlas-data/dbt/models/indicators/indicators__ssb_06083.sql) — `family_type` relationships to `ref_ssb_family_type.code`. `family_type_label_no` + `_label_en` `not_null`.
- [ ] 1.2 [`indicators__ssb_06944`](../../../../atlas-data/dbt/models/indicators/indicators__ssb_06944.sql) — `household_type` relationships to `ref_ssb_household_type`. Label columns `not_null`.
- [ ] 1.3 [`indicators__ssb_07459`](../../../../atlas-data/dbt/models/indicators/indicators__ssb_07459.sql) — `sex` accepted_values `['male','female','all']` (no seed for sex). `age_int` accepted_range 0–110 (nullable). `age_min` accepted_range 0–110.
- [ ] 1.4 [`indicators__ssb_09429`](../../../../atlas-data/dbt/models/indicators/indicators__ssb_09429.sql) — `education_level` relationships to `ref_ssb_nivaa`. `education_level_label_no/_en` `not_null`. Verify `sex` accepted_values is already present (added in PLAN-002 schema.yml? if not, add).
- [ ] 1.5 [`indicators__ssb_12944`](../../../../atlas-data/dbt/models/indicators/indicators__ssb_12944.sql) — `period_start_year`/`period_end_year` accepted_range 2000–2050 (nullable for `999A`-style rows). `age_group_min`/`age_group_max` accepted_range 0–120 (nullable).
- [ ] 1.6 [`indicators__fhi_bor_alene`](../../../../atlas-data/dbt/models/indicators/indicators__fhi_bor_alene.sql) — `period_*_year` and `age_group_min`/`age_group_max` accepted_range as above.
- [ ] 1.7 [`indicators__fhi_mobbing`](../../../../atlas-data/dbt/models/indicators/indicators__fhi_mobbing.sql) — `sex` accepted_values; `period_*_year` accepted_range.
- [ ] 1.8 [`indicators__fhi_trangbodd`](../../../../atlas-data/dbt/models/indicators/indicators__fhi_trangbodd.sql) — `parents_education` relationships to `ref_fhi_utdann`. `parents_education_label_no` `not_null`. `period_*_year` and `age_group_*` accepted_range.
- [ ] 1.9 [`indicators__fhi_vgs_gjennomforing`](../../../../atlas-data/dbt/models/indicators/indicators__fhi_vgs_gjennomforing.sql) — `sex` accepted_values; `parents_education` relationships + label `not_null`; `immigration_category` relationships to `ref_fhi_innvkat` + label `not_null`; `period_*_year` accepted_range.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt test --select indicators
```

User confirms: every previously-passing test still passes; the count grows by ~30 new tests; zero new errors.

---

## Phase 2: schema.yml — seed tables themselves

Add a `schema.yml` entry per `ref_*` seed with the exact `accepted_values` and primary-key uniqueness on `code`. Catches anyone editing a CSV in a way that breaks downstream joins.

### Tasks

- [ ] 2.1 Create [`atlas-data/dbt/seeds/schema.yml`](../../../../atlas-data/dbt/seeds/) with one `seed:` entry per CSV. For each: `code` `not_null` + `unique`; `label_no` `not_null`; `label_en` no test (blank for FHI); `sort_order` `not_null` + `unique` + `accepted_range: 1..N` (where N is the row count of that seed). The seed CSVs themselves are the canonical code list — no `accepted_values` echo needed.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt test --select source:atlas seeds.*
# Or simply:
uv run --env-file ../ingest/.env dbt test
```

User confirms 5 new seed-level tests pass.

---

## Phase 3: Update naming-conventions.md

Add every new canonical name to the vocabulary table; add raw FHI column names to the "Never in marts" forbidden list. Update the existing `sex` row to allow the third value (`all`) introduced by `decode_sex`.

### Tasks

- [ ] 3.1 In [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) update the `sex` row: `One of "male", "female", "all"`. Mention the `{{ decode_sex(col) }}` macro.
- [ ] 3.2 Add new vocabulary rows to the canonical table:

  | Concept | Canonical name | Type | Rules |
  |---|---|---|---|
  | Period start year | `period_start_year` | `integer` | parsed from `period`; null if not parseable |
  | Period end year | `period_end_year` | `integer` | same |
  | Single-year age as int | `age_int` | `integer` | null for open-ended (`105+`); use `age_min` for sortable floor |
  | Floor of single-year age (incl. open-ended) | `age_min` | `integer` | `105` for `105+` |
  | Age band lower bound | `age_group_min` | `integer` | parsed from `age_group`; null for cryptic codes (`999A`) |
  | Age band upper bound | `age_group_max` | `integer` | same |
  | Family type (SSB FamilieType) | `family_type` | `text` | code `001`–`009`; must exist in `ref_ssb_family_type` |
  | Family type label (Norwegian) | `family_type_label_no` | `text` | from `ref_ssb_family_type` |
  | Family type label (English) | `family_type_label_en` | `text` | from `ref_ssb_family_type` |
  | Household type (SSB HusholdType) | `household_type` | `text` | code `0000`–`0004`; must exist in `ref_ssb_household_type` |
  | Household type label | `household_type_label_no` / `_label_en` | `text` | from `ref_ssb_household_type` |
  | Education level — subject's own (SSB Nivaa NUS2000) | `education_level` | `text` | codes from `ref_ssb_nivaa`; **only when source measures the subject's own level** |
  | Education level label | `education_level_label_no` / `_label_en` | `text` | from `ref_ssb_nivaa` |
  | Education level — parents' (FHI UTDANN) | `parents_education` | `text` | codes `0`–`4`; must exist in `ref_fhi_utdann`. **Use this** when the source stratifies a child outcome by parental education (FHI 360, 794) |
  | Parents' education label | `parents_education_label_no` | `text` | from `ref_fhi_utdann` (no English) |
  | Immigration category (FHI INNVKAT) | `immigration_category` | `text` | from `ref_fhi_innvkat` |
  | Immigration category label | `immigration_category_label_no` | `text` | (no English) |
  | Housing status (FHI BODD) | `housing_status` | `text` | `"trangt"` / `"uoppgitt"`; readable as-is, no seed |
  | School grade (FHI TRINN) | `grade` | `text` | `"7"` or `"10"`; readable as-is |

- [ ] 3.3 Add to the "Never in marts" forbidden list:

  | Seen upstream | Never in marts — use this instead |
  |---|---|
  | `kjonn_code`, `sex_code` | `sex` (decoded via `decode_sex`) |
  | `aar_code` | `period` (text) and/or `period_start_year`/`period_end_year` (int) |
  | `alder_code` | `age_group` (text) and/or `age_group_min`/`age_group_max` (int) |
  | `utdann_code` (FHI parents' education) | `parents_education` (+ `parents_education_label_no`) |
  | `innvkat_code` | `immigration_category` (+ `immigration_category_label_no`) |
  | `bodd_code` | `housing_status` |
  | `trinn_code` | `grade` |

- [ ] 3.4 Add a short subsection "Decoding strategy reference" at the end pointing to `dbt/macros/parse_codes.sql`, the `marts.ref_*` seeds, and the completed investigation.

### Validation

User reviews [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md). Vocabulary entries match what's actually in `marts.indicators__*` (cross-reference any column from `\d marts.indicators__ssb_06083` against the table).

---

## Phase 4: Final full-suite verification

### Tasks

- [x] 4.1 `dbt build --full-refresh` — clean. ✓
- [x] 4.2 Test count: PLAN-002 ended at 290 PASS / 305 TOTAL (`dbt test`). PLAN-003 final `dbt build` reports PASS=406, WARN=15, ERROR=0, TOTAL=421. (Note: `dbt build` includes seed and source tests `dbt test` skips, so the absolute jump is larger than just the new tests added by this plan; the indicator-only test count grew from 290 → 326.) Same 15 warns as baseline. ✓

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt build --full-refresh
```

User confirms the suite is green.

---

## Acceptance Criteria

- [ ] Every code column with a corresponding seed has a `relationships` test back to it (no duplicate `accepted_values`).
- [ ] Decoded enum columns without a seed (`sex`, `housing_status`, `grade`) have an `accepted_values` test.
- [ ] Every `_label_no`/`_label_en` column derived from a seed has a `not_null` test.
- [ ] Every parsed integer column (`period_*_year`, `age_int`, `age_min`, `age_group_min/_max`) has an `accepted_range` test.
- [ ] All five `ref_*` seeds have schema.yml entries with `not_null` + `unique` on `code`, and tests on `sort_order`.
- [ ] [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) lists every new canonical field and every forbidden FHI raw name.
- [ ] `dbt build` runs clean (PASS grows by ~25, ERROR=0, WARN=15 unchanged).

---

## Implementation Notes

- **Why `relationships` and not `accepted_values` for code columns with a seed.** The seed is the source of truth. `relationships` tests against the seed catch every drift mode (added/removed/renamed codes); `accepted_values` would be a duplicate code list to hand-edit. One test per concept.
- **Why `accepted_values` for `sex`/`housing_status`/`grade`.** These have no seed, so an enumerated list in `schema.yml` is the only place to assert what the values can be.
- **Why label columns are `not_null` even though the join is `left`.** They're only null when the underlying code isn't in the seed. The `relationships` test ensures every code is in the seed. So `not_null` on the label closes the loop: if a `not_null` label fails, it means the code passed `relationships` but the join still produced null — a bug worth seeing immediately.
- **Why no test that `period_start_year <= period_end_year`.** dbt-utils has `expression_is_true` that can express this. Worth adding if it's a one-liner, but not blocking.
- **What this plan does not do.** No model changes (PLAN-002 closed that). No new seeds. No frontend changes. The seeds README from the investigation checklist was done in PLAN-001.

---

## Files to Modify

Edit:
- `atlas-data/dbt/models/indicators/schema.yml` — add tests on the 9 touched models
- `docs/stack/naming-conventions.md` — vocabulary expansion + forbidden list

New:
- `atlas-data/dbt/seeds/schema.yml` — one `seed:` entry per ref_*
