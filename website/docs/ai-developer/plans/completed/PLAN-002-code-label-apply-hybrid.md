# Plan 002: Apply hybrid decoding across indicator models

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Wire the five `marts.ref_*` seeds from PLAN-001 into the indicator models, parse the structured codes (`age`, `age_group`, `period`) into integer min/max columns, and unify the FHI cryptic column names (`kjonn_code`, `sex_code`) onto the canonical `sex` vocabulary at the marts boundary.

**Last Updated**: 2026-04-22
**Completed**: 2026-04-22

**Investigation**: [INVESTIGATE-code-label-mapping.md](INVESTIGATE-code-label-mapping.md)
**Prerequisites**: PLAN-001 (seeds must exist as `marts.ref_*` tables) — completed 2026-04-22.
**Blocks**: PLAN-003 (tests + naming-conventions update) cannot start until this is done.
**Priority**: Medium

---

## Overview

PLAN-001 delivered the seeds. This plan applies the hybrid decoding strategy from [INVESTIGATE-code-label-mapping.md](INVESTIGATE-code-label-mapping.md) — `CASE` for tiny universal enums, `left join ref_*` for domain enums, and integer parsing for structured codes — across the 9 indicator models that surface coded fields. The other 8 indicator models (region+year+contents only) need no changes.

After this plan, every indicator row in `marts.indicators__*` carries human-readable labels alongside the raw codes. The Next.js `/data` explorer and downstream consumers see `family_type_label_no = "Par uten barn"` instead of `family_type = "006"`.

### Scope by model (probed from `models/indicators/*.sql` on 2026-04-22)

| Model | Current coded columns | Treatment |
|---|---|---|
| `indicators__ssb_06083` | `family_type` text | left join `ref_ssb_family_type` → add `_label_no/_en` |
| `indicators__ssb_06944` | `household_type` text | left join `ref_ssb_household_type` → add `_label_no/_en` |
| `indicators__ssb_07459` | `sex` (CASE done), `age` text | add `age_int` (null for `105+`), `age_min` int |
| `indicators__ssb_09429` | `sex` (CASE done), `education_level` text | left join `ref_ssb_nivaa` → add `_label_no/_en` |
| `indicators__ssb_12944` | `age_group` (`00-17` form), `period` (`2022-2024` form) | add `age_group_min/_max`, `period_start_year/_end_year` ints |
| `indicators__fhi_bor_alene` | `age_group` (`16_120` form), `period` | add `age_group_min/_max`, `period_*_year` ints |
| `indicators__fhi_mobbing` | `kjonn_code`, `grade` (readable), `period` | rename `kjonn_code` → `sex` + CASE; add `period_*_year` ints |
| `indicators__fhi_trangbodd` | `age_group`, `education_level` (FHI scheme), `housing_status` (readable), `period` | left join `ref_fhi_utdann`; add `age_group_*` + `period_*_year` ints |
| `indicators__fhi_vgs_gjennomforing` | `kjonn_code` → `sex_code`, `parents_education` (FHI), `immigration_category` (FHI), `period` | rename `sex_code` → `sex` + CASE; left joins for `ref_fhi_utdann` and `ref_fhi_innvkat`; `period_*_year` ints |

The other 8 indicator models (`indicators__ssb_06913`, `_06947`, `_08764`, `_12063`, `_12131`, `_12132`, `_12292`, `_13995`) carry no coded dims that need decoding — leave them alone.

### Conventions adopted in this plan

- **Label columns:** `<field>_label_no` and `<field>_label_en` (separate columns per language). Cheap; matches the seed schema; downstream picks one.
- **Parsed integer columns:** `<field>_min`, `<field>_max` for ranges (`age_group`, SSB single-year `age`); `period_start_year`, `period_end_year` for periods. All `int`, nullable.
- **FHI column renames at marts boundary:** `kjonn_code` and `sex_code` become `sex` (text, `male`/`female`/`all`) — matching SSB indicator models that already CASE this.
- **`fact_kommune_indicators` is not changed by this plan** beyond what the synthetic-contents patterns need (see Phase 2). The fact stays narrow (region × year × contents). Per-source labels live on `indicators__*`.
- **Macros for repeated logic.** Period parsing appears in 5+ models, age-range parsing in 4+. One small macro file keeps the SQL DRY without proliferating helpers.

---

## Phase 1: Macros for repeated logic — DONE

### Tasks

- [x] 1.1 Created [`atlas-data/dbt/macros/parse_codes.sql`](../../../../../atlas-data/dbt/macros/parse_codes.sql) with `decode_sex`, `period_start_year`, `period_end_year`, `age_range_min(col, sep)`, `age_range_max(col, sep)`. Period macros normalise both `_` and `-` separators in one path. Age macros also handle the `067+` open-ended form (min=67, max=null). ✓
- [x] 1.2 `dbt parse` runs clean. ✓

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt parse
```

User confirms parse runs clean (no Jinja errors).

---

## Phase 2: Apply to the 9 indicator models — DONE

### Tasks

- [x] 2.1 `indicators__ssb_06083` — left join `ref_ssb_family_type`; `family_type_label_no/_en` added. ✓
- [x] 2.2 `indicators__ssb_06944` — left join `ref_ssb_household_type`; `household_type_label_no/_en` added. ✓
- [x] 2.3 `indicators__ssb_07459` — `decode_sex` macro applied; `age_int` (null for `105+`) and `age_min` (105 for `105+`) added. ✓
- [x] 2.4 `indicators__ssb_09429` — `decode_sex` macro applied; left join `ref_ssb_nivaa`; `education_level_label_no/_en` added. ✓
- [x] 2.5 `indicators__ssb_12944` — `age_group_min/_max` (separator `-`) and `period_start_year/_end_year` added. `999A` → null/null verified; `00-17` → 0/17; `067+` → 67/null. ✓
- [x] 2.6 `indicators__fhi_bor_alene` — `age_group_min/_max` (separator `_`) and `period_start_year/_end_year` added. ✓
- [x] 2.7 `indicators__fhi_mobbing` — `kjonn_code` dropped; `sex` (via `decode_sex`) replaces it; `period_start_year/_end_year` added. ✓
- [x] 2.8 `indicators__fhi_trangbodd` — `utdann_code` aliased to `parents_education`, joined to `ref_fhi_utdann` (Norwegian only); `age_group_min/_max`, `period_*_year` added. ✓
- [x] 2.9 `indicators__fhi_vgs_gjennomforing` — `kjonn_code` → `sex` via `decode_sex` (verified `male`/`female`/`all` 8180 rows each); `parents_education` + `immigration_category` joined to their seeds; `period_*_year` added. ✓

`dbt run --select indicators` rebuilt all 17 models clean (4.7s). 9 with new columns, 8 untouched. Spot checks all pass.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt run --select indicators
uv run --env-file ../ingest/.env dbt show --inline "select family_type, family_type_label_no, family_type_label_en from marts.indicators__ssb_06083 where family_type = '006' limit 1"
uv run --env-file ../ingest/.env dbt show --inline "select age_group, age_group_min, age_group_max from marts.indicators__fhi_bor_alene where age_group in ('0_120', '16_120') limit 4"
uv run --env-file ../ingest/.env dbt show --inline "select sex, count(*) from marts.indicators__fhi_vgs_gjennomforing group by sex"
```

User confirms: family-type label resolves to "Par uten barn"; age_group_min/max are 0/120 and 16/120; FHI vgs `sex` column is now `male`/`female`/`all` (no `0`/`1`/`2`).

---

## Phase 3: Update fact_kommune_indicators synthetic-contents patterns — DONE

### Tasks

- [x] 3.1 ssb_06083 CTE: synthetic contents_label now uses `family_type_label_no`. Verified via `dbt show` — labels read "Familier (Enpersonfamilie)" etc. ✓
- [x] 3.2 ssb_09429 CTE: synthetic contents_label uses `education_level_label_no`. ✓
- [x] 3.3 fhi_mobbing — `grade` already readable, no change. ✓
- [x] 3.4 Discovered + fixed downstream stale references: the fhi_vgs CTE filtered on `sex_code = '0'` (now `sex = 'all'`); the fhi_trangbodd CTE filtered on `education_level = '0'` (now `parents_education = '0'` per the column rename in 2.8). Fact rebuilt clean with 135 698 rows. ✓

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt run --select fact_kommune_indicators
uv run --env-file ../ingest/.env dbt show --inline "select source_id, contents_code, contents_label from marts.fact_kommune_indicators where source_id in ('ssb-06083','ssb-09429') order by 1, 2 limit 10"
```

User confirms `contents_label` now contains the Norwegian label, not the code.

---

## Phase 4: Full rebuild + smoke test — DONE

### Tasks

- [x] 4.1 `dbt run` — 20/20 models built clean in 3.7s. ✓
- [x] 4.2 `dbt test` — 290 PASS, 0 ERROR, 15 WARN (same warn count as on `main`; the warns are pre-existing relationship warns for historical kommune codes in `ssb_06913`/`12131`/`12292`/`13995`). Three stale schema.yml references caught and fixed: `fhi_mobbing` and `fhi_vgs_gjennomforing` unique-key combinations referred to `sex_code` (now `sex`); `fhi_trangbodd` not_null + unique-key referred to `education_level` (now `parents_education`). ✓
- [x] 4.3 `/data` explorer (already-running dev server on `:4000`) returns HTTP 200 and the HTML carries the human labels: all 9 family types render as `Familier (Enpersonfamilie)`, `Familier (Par uten barn)`, `Familier (Andre familier)`, …; all 7 Nivaa levels render as `Personer 16 år og over (Utdanningsnivå i alt)`, `… (Universitets- og høgskolenivå, kort)`, etc. ✓

### Cosmetic note (out of scope)

The fact's synthetic-contents pattern wraps labels in `' (' || label || ')'`. When labels themselves contain parens (e.g. `"Par med små barn (yngste barn 0-5 år)"`), this produces unbalanced parens in the rendered string: `Familier (Par med små barn (yngste barn 0-5 år)`. Data is correct; this is a fact-layer formatting choice that worked fine for opaque codes and only became visible once labels got real text. Not in PLAN-002 scope; can be a one-liner cleanup later (e.g. drop the outer parens; or use a separator like `' — '`).

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt run
uv run --env-file ../ingest/.env dbt test
```

```bash
cd ../..   # repo root
npm run dev   # http://localhost:4000
# Open /data, click into ssb-06083 or ssb-09429 — confirm labels render.
```

User confirms dbt test passes (zero errors, warns excluded as today) AND the labels appear in the browser.

---

## Acceptance Criteria

- [ ] `dbt run` builds all 17 indicator models + `fact_kommune_indicators` clean.
- [ ] `dbt test` passes (no new errors vs. main).
- [ ] The 5 indicator models with seed joins (`ssb_06083`, `ssb_06944`, `ssb_09429`, `fhi_trangbodd`, `fhi_vgs_gjennomforing`) expose `<field>_label_no` columns; SSB-sourced ones also expose `_label_en`. NULL labels only appear for codes that aren't in the corresponding seed.
- [ ] The 5 indicator models with parsed-range columns expose integer `_min/_max` (or `_start_year/_end_year`) alongside the original text code.
- [ ] FHI `kjonn_code`/`sex_code` columns are gone — `sex` (`male`/`female`/`all`) replaces them.
- [ ] `fact_kommune_indicators.contents_label` for ssb-06083 and ssb-09429 contains Norwegian labels, not codes.
- [ ] `/data` explorer in Next.js shows the human labels in the contents_label column for both sources.

---

## Implementation Notes

- **Why parse in dbt, not at ingest.** Adding columns to `raw.*` would mean migrations + re-ingest. Parsing in indicator models is reversible, requires no schema change in `raw`, and keeps `raw` faithful to upstream.
- **Why separate `_label_no`/`_label_en` columns.** Doubles the column count for label-bearing models — cheap. Lets a future English UI pick `_label_en` without re-running dbt. Matches the seed schema.
- **Why `decode_sex` macro instead of inline CASE.** Two SSB models already inline this; FHI variants will newly do so. A macro avoids drift if SSB ever introduces a fourth code (e.g. `9` for unknown, hypothetical).
- **FHI UTDANN aliasing as `parents_education`.** In `fhi_trangbodd` and `fhi_vgs_gjennomforing`, UTDANN is the *parent's* education level (children's overcrowding / VGS completion stratified by parental education). Calling it `education_level` would suggest the subject's own — misleading. The seed file is still `ref_fhi_utdann.csv` (matches the upstream dimension code); the *column* in indicators is `parents_education`.
- **What this plan does not do.** No new tests (PLAN-003), no `naming-conventions.md` updates (PLAN-003), no changes to non-dim-bearing indicator models, no `fact_kommune_indicators` shape change beyond label substitution in synthetic patterns.

---

## Files to Modify

New:
- `atlas-data/dbt/macros/parse_codes.sql`

Edit (9 indicator models):
- `atlas-data/dbt/models/indicators/indicators__ssb_06083.sql`
- `atlas-data/dbt/models/indicators/indicators__ssb_06944.sql`
- `atlas-data/dbt/models/indicators/indicators__ssb_07459.sql`
- `atlas-data/dbt/models/indicators/indicators__ssb_09429.sql`
- `atlas-data/dbt/models/indicators/indicators__ssb_12944.sql`
- `atlas-data/dbt/models/indicators/indicators__fhi_bor_alene.sql`
- `atlas-data/dbt/models/indicators/indicators__fhi_mobbing.sql`
- `atlas-data/dbt/models/indicators/indicators__fhi_trangbodd.sql`
- `atlas-data/dbt/models/indicators/indicators__fhi_vgs_gjennomforing.sql`

Edit (1 mart):
- `atlas-data/dbt/models/marts/fact_kommune_indicators.sql`
