# Investigate: Coded fields across sources — decoding strategy

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide a per-field treatment for every coded field in Atlas's `raw.*` tables (sex, age, family_type, household_type, education_level, age_group, period, etc.) so consumers (Next.js, dbt analysts, the `/data` explorer) see human-readable labels rather than upstream codes — without inventing a heavyweight platform service.

**Last Updated**: 2026-04-22

**Origin:** Atlas data layer. Atlas's upstream sources publish many dimensions as short codes (`"0"` for all sexes, `"0001"` for a family type, `"02a"` for an education level). The raw layer preserves them verbatim. The marts layer has been renaming **some** (kommune codes, sex in two sources) but leaving most as-is. That pushes the code-to-meaning problem onto every consumer. Flagged as an **open decision** in [`../../../stack/data-strategy.md`](../../../stack/data-strategy.md) (line 183, "dim_codes or dbt seeds for enum decoding").

---

## Questions to Answer

1. Which architectural pattern fits best — **inline CASE** in dbt, **dbt seeds** as reference tables, a **universal `dim_codes`** lookup, or **dbt macros**? Or a **hybrid** matched per pattern?
2. For each of the 19 currently-ingested sources, which coded fields need decoding and which architectural pattern fits each?
3. Where do canonical labels come from — fetched once from upstream metadata and pinned in CSV (versioned, but drifts), or re-fetched on each `dbt seed` run (always fresh, but seeds stop being declarative)?
4. Should we ship `label_no` (bokmål) only, or `label_no` + `label_en` from day 1 in case Atlas gets an English UI?
5. How many seed files do we actually commit? (5 candidates listed below; one has only 1 value today.)
6. What happens to consumers when an upstream code is retired — do we keep stale rows in our seed, or remove them and risk over-filtering?

---

## Current State

### Inventory — every coded field, as it currently exists in Postgres

Data below is probed directly from the `raw.*` tables (not guessed).

#### Universal concepts

| Field | Source tables (raw) | Observed codes | Readable? |
|---|---|---|---|
| `sex` (SSB Kjonn) | `raw.ssb_07459`, `raw.ssb_09429` | `"0"` / `"1"` / `"2"` | ❌ numeric |
| `sex` (FHI KJONN, current col name `kjonn_code`) | `raw.fhi_mobbing`, `raw.fhi_vgs_gjennomforing` | `"0"` / `"1"` / `"2"` | ❌ numeric |
| `age` (SSB Alder, single-year) | `raw.ssb_07459` | `"000"` … `"104"`, `"105+"` | ⚠️ integer-like but string because of `"105+"` |
| `age_group` (SSB 12944) | `raw.ssb_12944` | `"999A"`, `"00-17"`, `"18-34"`, `"35-49"`, `"50-66"`, `"067+"` | ⚠️ mixed — ranges understandable but `"999A"` cryptic |
| `age_group` (FHI ALDER, current col name `alder_code`) | `raw.fhi_bor_alene`, `raw.fhi_trangbodd`, `raw.fhi_mobbing` (indirectly) | `"0_120"`, `"16_120"`, `"0_17"`, `"18_29"`, `"30_44"`, `"45_64"`, `"65_74"`, `"75_84"`, `"85_120"` … | ⚠️ range-style but needs parsing |
| `year` (SSB Tid) | all SSB non-KOSTRA | `"2024"` (parses clean to int) | ✅ clean |
| `period` (FHI AAR, current col name `aar_code`) | all FHI | `"2024_2024"` (single-year) or `"2022_2024"` (3-year rolling) | ⚠️ needs parse |
| `period` (SSB 12944) | `raw.ssb_12944` | `"2022-2024"` (hyphen, not underscore) | ⚠️ different range format |

#### Domain-specific SSB enums

| Field | Source table | Observed codes |
|---|---|---|
| `family_type` (SSB FamilieType) | `raw.ssb_06083` | `"001"` through `"009"` (9 codes) |
| `household_type` (SSB HusholdType) | `raw.ssb_06944` | `"0000"` through `"0004"` (5 codes) |
| `education_level` (SSB Nivaa NUS-based) | `raw.ssb_09429` | `"00"`, `"01"`, `"02a"`, `"03a"`, `"04a"`, `"09a"`, `"11"` (7 codes) |
| `grade` (FHI TRINN, current col name `trinn_code`) | `raw.fhi_mobbing` | `"7"`, `"10"` (self-explanatory) |

#### Domain-specific FHI enums

| Field | Source table | Observed codes |
|---|---|---|
| `education_level` (FHI UTDANN — parents' level, different scheme from SSB!) | `raw.fhi_trangbodd`, `raw.fhi_vgs_gjennomforing` | `"0"`, `"1"`, `"2"`, `"3"`, `"4"` (5 codes) |
| `housing_status` (FHI BODD) | `raw.fhi_trangbodd` | `"trangt"` (overcrowded), `"uoppgitt"` (unknown) |
| `immigration_category` (FHI INNVKAT) | `raw.fhi_vgs_gjennomforing` | `"0"` only (all — table doesn't break it down) |
| `question_id` (FHI SPM_ID) | `raw.fhi_mobbing` | `"479"` only (opaque internal id) |
| `measure_type` (FHI MEASURE_TYPE) | all FHI | `"RATE"`, `"SMR"`, `"MEIS"`, `"TELLER"` (semi-cryptic) |
| `contents_code` (varies per table) | every SSB + FHI | Wildly inconsistent — `Personer`, `EUskala60`, `Folkemengde`, `SamletInntekt`, `Folketilvekst`, `KOSFolkemengdeia0000`, `RATE`, `SMR`, etc. |

#### Region codes (separate problem, partially solved)

| Field | Observed | Current treatment |
|---|---|---|
| 4-digit kommune codes | `"0301"`, `"5601"`, etc. | ✅ Already mapped via `dim_kommune` |
| 2-digit fylke codes | `"03"`, `"31"`, etc. | ✅ Already mapped via `dim_fylke` |
| XX99 rest-of-fylke aggregates | `"0199"`, `"0299"` | ✅ Excluded from `kommune_nr` |
| K_/F_ prefixed codes (06913) | `"K_0301"`, `"F_03"` | ✅ Stripped in dbt |
| 6-digit bydel codes | `"030101"` | 🟡 Preserved in raw, no `dim_bydel` yet |
| Special codes (Svalbard, offshore, "Rest", "9999 Uoppgitt") | `"2111"`, `"9999"`, `"Rest"` | 🟡 Flagged with warn-severity tests |

#### Status / suppression markers

| Field | Source | Values |
|---|---|---|
| `status` | all | `"."` (SSB suppressed), `":"` (FHI not available), or null. Handled uniformly by `parseJsonStat2`. ✅ |

### What the codes actually mean

For concepts where the label is widely known (sex 0/1/2, overcrowding "trangt"/"uoppgitt"), meaning is obvious. For domain-specific enums, **we don't currently store the labels** — they're in upstream metadata that we fetch but discard. Specifically:

- **SSB FamilieType `001`–`009`** — couple without children, couple with children 0–17, single mother with children 0–17, single father with children 0–17, cohabiting couple, etc. Nine specific combinations. Need to fetch the mapping from SSB metadata.
- **SSB HusholdType `0000`–`0004`** — aggregations: all households, single-person, couples, couples with children, single-parent with children, etc. Five codes.
- **SSB Nivaa `00`, `01`, `02a`, `03a`, `04a`, `09a`, `11`** — NUS2000-based education levels: no education / primary / lower secondary / upper secondary / tertiary short / tertiary long / unspecified. Seven codes, semi-standardised.
- **FHI UTDANN `0`–`4`** — aggregated education level (different scheme from SSB Nivaa). Roughly: all, grunnskole, videregående, høyere utdanning kort, høyere utdanning lang.
- **FHI INNVKAT `0`** — "all immigration categories" in this table's slice. Single value; future tables may expand.
- **FHI SPM_ID** — internal question identifier. Opaque; we just pass it through.

The upstream response carries human labels in `dimension.<name>.category.label` alongside `index`. We parse `index` (the code list) but throw away `label`. Restoring the label flow is part of the fix.

### Patterns across coded fields

The codes split into four distinct patterns that want different architectural treatments:

**Pattern 1 — Small universal enum** (2–5 codes, mostly obvious meaning) — `sex`, `housing_status`, `grade`. Small, bounded, doesn't change. CASE expression in the dbt indicator model is enough; the "lookup table" would be more overhead than value.

**Pattern 2 — Medium domain enum** (5–15 codes, needs a label lookup) — `family_type`, `household_type`, `education_level` (both SSB and FHI variants), `age_group` per source, `measure_type`. These benefit from a proper lookup: one seed file per `(provider, dimension)` pair with code + label_no + label_en + sort_order. Join once, expose label everywhere.

**Pattern 3 — Per-table content code** (`contents_code`) — Every SSB/FHI table has its own vocabulary for the statistical variables it publishes. These are too numerous + table-specific for a central dim. Upstream already provides `contents_label` which we store — that's the right pattern: preserve label alongside code, no cross-source join needed.

**Pattern 4 — Structured parse, not a lookup** (`age`, `period`) — `"105+"`, `"105"`, `"2022_2024"`, `"0_17"` — these encode structure (single age vs range) that we parse, not look up. Extract numeric start/end year or min/max age, store alongside the raw code.

**Special case — region codes** — Already handled. `dim_kommune` + `dim_fylke` cover it. Bydel-level is the open gap.

---

## Options

### Option A — Inline CASE expressions in each indicator model

```sql
case sex
  when '0' then 'all'
  when '1' then 'male'
  when '2' then 'female'
end as sex
```

**Pros:** simple, obvious, no new tables, works per-source. Explicit.
**Cons:** Logic duplicated across N models. If FamilieType's 9 labels need to change, we edit 1+ places. Doesn't scale for big enums.

### Option B — dbt `seeds/` reference tables

One CSV per `(provider, dimension)`: `ref_ssb_family_type.csv`, `ref_ssb_nivaa.csv`, `ref_fhi_utdann.csv`, etc. Columns: `code`, `label_no`, `label_en`, `sort_order`, optional `parent_code`.

Indicator models `left join ref_...` to expose `family_type_label`.

**Pros:** clean separation. Labels versioned in git, editable without code changes, testable. One source of truth per enum.
**Cons:** one more table per dimension. Extra join per model. Seeds need `dbt seed` step.

### Option C — Universal `dim_codes` lookup

Single table: `marts.dim_codes(provider, dimension, code, label_no, label_en, sort_order)`. One filter gets you any dimension's labels.

**Pros:** one table for all enums. Easy to query: *"all codes for FHI UTDANN"*. Ad-hoc research friendly.
**Cons:** loose typing — everything's generic. Harder to use in joins (need 2-col filter). Not as clean as per-dim tables.

### Option D — dbt macros that encode the CASE

```sql
{{ decode_sex(sex_code) }}
{{ decode_ssb_family_type(family_type_code) }}
```

**Pros:** DRY, centralised, testable, no new tables.
**Cons:** macro proliferation if we have many enums. Scripts aren't as browseable as seed CSVs.

---

## Recommendation — hybrid

Match approach to pattern:

| Pattern | Approach | Why |
|---|---|---|
| 1 — small universal (sex, housing_status, grade) | Inline CASE (Option A) | 2-5 codes; inlining is clearer than another join. Already done for `sex` in some models. |
| 2 — domain enum (family_type, household_type, education levels, age bands) | Seed tables (Option B) | Labels deserve a proper home. Easy to keep in sync with upstream when codes change. |
| 3 — per-table content code | Preserve `contents_label` from upstream | Already works; no new architecture needed. |
| 4 — structured parse (age, period) | Parse at ingest, store components | Store `period_start_year`, `period_end_year`, `age_min`, `age_max` alongside `period` and `age_group`. |

### Proposed per-field treatment

Concrete decisions for every coded field currently in our raw tables:

| Field (marts layer) | Current code form | Treatment | What consumers see |
|---|---|---|---|
| `sex` | `"0"`/`"1"`/`"2"` | CASE inline | `"all"` / `"male"` / `"female"` |
| `housing_status` | `"trangt"` / `"uoppgitt"` | Already readable | unchanged |
| `grade` | `"7"` / `"10"` | Already readable | unchanged |
| `age` (single-year SSB) | `"000"`…`"104"`, `"105+"` | Keep raw `age`; add `age_int` (null for `"105+"`) + `age_min`/`age_max` | `age = "042"`, `age_int = 42`; `age = "105+"`, `age_int = null, age_min = 105` |
| `age_group` (FHI `0_17` style) | range strings | Keep raw `age_group`; add `age_group_min`/`age_group_max` ints | both code and ints |
| `age_group` (SSB 12944 `00-17` style) | range strings | Same treatment as FHI; but map `"999A"` → null ints | both |
| `family_type` | `"001"`–`"009"` | **Seed** `ref_ssb_family_type` | `family_type_label = "Par uten barn"` etc. |
| `household_type` | `"0000"`–`"0004"` | **Seed** `ref_ssb_household_type` | `household_type_label` |
| `education_level_ssb` | `"00"`,`"01"`,`"02a"`… | **Seed** `ref_ssb_nivaa` | `education_level_label_no/en` |
| `education_level_fhi` | `"0"`–`"4"` | **Seed** `ref_fhi_utdann` (separate scheme from SSB) | same |
| `immigration_category` | `"0"` only | Seed anyway (future-proof) | `immigration_category_label` |
| `measure_type` (FHI) | `RATE`/`SMR`/`MEIS`/`TELLER` | CASE inline (already done) | Already has label |
| `contents_code` (per source) | varies | Keep raw code + upstream `contents_label` | Already works |
| `period` (FHI) | `"2024_2024"` / `"2022_2024"` | Add `period_start_year`, `period_end_year` ints | both code and parsed ints |
| `period` (SSB 12944) | `"2022-2024"` | Same treatment but parse on `-` | same |
| `question_id` (FHI SPM_ID) | opaque id | Keep as-is | opaque is fine for meta-ids |

### Naming-convention updates

For the canonical vocabulary table in [`../../../stack/naming-conventions.md`](../../../stack/naming-conventions.md), add:

- `sex` with values `"male"` / `"female"` / `"all"`
- `age` (text, single-year, `"000"` form or int)
- `age_min` / `age_max` / `age_group_min` / `age_group_max` (int)
- `age_group` (text, source-specific enum)
- `grade` (text, `"7"`, `"10"`, `"Vg1"`, etc.)
- `housing_status` (text, e.g., `"trangt"`, `"uoppgitt"`)
- `family_type` (text, SSB code) + `family_type_label` (text)
- `household_type` + `household_type_label`
- `education_level` + `education_level_label`
- `immigration_category` + `immigration_category_label`
- `period` (text, range form) + `period_start_year`, `period_end_year` (int)

---

## Open Questions

1. **Which seed files do we actually commit?** The recommendation lists 5. Probably right, but `ref_fhi_innvkat` has only 1 value right now — might be overkill. Keep anyway for consistency?
2. **Label languages.** `label_no` (bokmål) always; `label_en` for roles where Atlas might get an English UI. Worth the upfront cost, or bokmål-only until English UI is real?
3. **How to handle codes that disappear upstream?** If SSB retires a FamilieType code, our seed file still has it. Consumers may over-filter. Probably acceptable; flag in a review once/year.
4. **Where do seed labels come from?** Two honest options: (a) fetch once from upstream metadata and pin in CSV (versioned, but drifts from upstream); (b) re-fetch on each dbt seed run (always fresh, but seeds stop being declarative). Recommended: (a) with a manual "refresh seeds" script.

---

## Next Steps

Following the [PLANS.md](../../PLANS.md) guidance on splitting investigations into ordered plans:

- [x] **PLAN-001-code-label-seed-tables.md** — Probe SSB and FHI metadata endpoints to fetch canonical labels per code. Write `dbt/seeds/` CSVs: `ref_ssb_family_type.csv`, `ref_ssb_household_type.csv`, `ref_ssb_nivaa.csv`, `ref_fhi_utdann.csv`, `ref_fhi_innvkat.csv`. Configure `seeds` in `dbt_project.yml`. Verify `dbt seed` runs clean. **(Completed 2026-04-22 — see [`../completed/PLAN-001-code-label-seed-tables.md`](../completed/PLAN-001-code-label-seed-tables.md). FHI workaround: `/metadata` returns prose only; refresh script uses `/query` + minimal `/data` POST instead.)**
- [x] **PLAN-002-code-label-apply-hybrid.md** — Apply the hybrid to every indicator model. CASE expressions for small universal enums. Parse age/period strings, add min/max int columns. Left-join seed tables for domain enums; expose `<field>_label` alongside the raw code. Consistently rename FHI cryptic columns at the marts boundary (`kjonn_code` → `sex`, `alder_code` → `age_group`, `aar_code` → `period`). **(Completed 2026-04-22 — see [`../completed/PLAN-002-code-label-apply-hybrid.md`](../completed/PLAN-002-code-label-apply-hybrid.md). 9 of 17 indicator models touched; the others are region+year+contents only. FHI UTDANN aliased as `parents_education` in indicator models since the table breaks by parent's education, not subject's.)**
- [ ] **PLAN-003-code-label-tests-and-docs.md** — Extend `schema.yml` `accepted_values` tests for cleaned-up columns. Update [`naming-conventions.md`](../../../stack/naming-conventions.md) with new canonical fields. Run `dbt run` + `dbt test` full suite — all 140+ tests should stay green (warns excluded). Document each seed in `dbt/seeds/README.md` with source and update policy.

Estimated total effort: 3–4 hours of focused work.

### Not in scope for this investigation

- Backfilling historical upstream labels (seeds use today's labels; old data that referred to a since-renamed code stays with the current label).
- Per-content-code labelling across sources — each source already stores its own `contents_label`.
- Bydel codes — separate `dim_bydel` work.

---

## Files to Modify

Atlas-side (in `atlas-data-repo/`):

- `dbt/seeds/ref_ssb_family_type.csv` *(new)*
- `dbt/seeds/ref_ssb_household_type.csv` *(new)*
- `dbt/seeds/ref_ssb_nivaa.csv` *(new)*
- `dbt/seeds/ref_fhi_utdann.csv` *(new)*
- `dbt/seeds/ref_fhi_innvkat.csv` *(new)*
- `dbt/seeds/README.md` *(new)*
- `dbt/dbt_project.yml` — add `seeds` configuration
- `dbt/models/indicators/indicators__*.sql` — apply CASE / join / parse per field per source (~19 models)
- `dbt/models/indicators/schema.yml` — extend `accepted_values` tests
- `docs/stack/naming-conventions.md` — add canonical vocabulary entries

---

## Cross-references

- [`../../../stack/data-strategy.md`](../../../stack/data-strategy.md) — data integration strategy (this investigation is the field-dictionary sub-problem)
- [`../../../stack/naming-conventions.md`](../../../stack/naming-conventions.md) — current field dictionary (will be extended by PLAN-003)
- [`../../../stack/suggested-stack.md`](../../../stack/suggested-stack.md) — v1 stack (this work fits within the existing dbt scope)
