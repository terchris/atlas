# Plan 001: NGO supply foundation

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Land the cross-cutting foundation every NGO ingest will need — `marts.ref_atlas_service_category` (the 22-row Atlas-curated cross-NGO vocabulary) and `marts.dim_ngo` (one row per NGO, sourced from a curated `landscape.json` derived from `ngo-landscape.md`). After this plan, PLAN-002 (Red Cross ingest) and PLAN-003 (Folkehjelp ingest) can populate `dim_chapter` and `dim_activity` against a stable foundation.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — all 3 phases done. 11 NGOs in dim_ngo, 22 service categories. dbt build PASS=465 / WARN=16 / ERROR=0. One small bug caught + fixed during implementation (column-level vs model-level `dbt_utils.expression_is_true` syntax — see Phase 2 notes).

**Investigation**: [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md)
**Prerequisites**: [PLAN-foundation-reference-tables](../completed/PLAN-foundation-reference-tables.md) — needed for `dim_postnummer`, `crosswalk_kommune_name`, `ref_brreg_icnpo`, `ref_un_sdg`. All shipped on main.
**Blocks**: PLAN-002 (Red Cross ingest) — populates `dim_chapter` and `dim_activity` against the foundation this plan lays.
**Priority**: Medium

---

## Overview

Two real seeds, plus the documentation/ERD wiring. Estimated ~3–4 h.

**Built in PLAN-001:**
- `marts.ref_atlas_service_category` — 22-row hand-curated CSV (Appendix A of the investigation).
- `marts.dim_ngo` — populated from a curated `landscape.json` via a new seed-source script. ~10 Tier A NGOs in v1.

**Not built in PLAN-001** (deferred to PLAN-002):
- `dim_chapter` and `dim_activity` schemas — both wait for PLAN-002, which is the first plan to actually populate them with Red Cross data. The schemas are already documented in the [investigation's PLAN-A footprint](INVESTIGATE-ngo-supply-data-model.md#q25-plan-a--supply-side-foundation-cross-cutting); PLAN-002 implements them. Empty stub models would add no real value (they'd hold zero rows and ship vacuous tests).
- `fact_chapter_activities` — also waits for PLAN-002 (first ingest = first data).
- `fact_kommune_supply` aggregate — deferred per [Q37](INVESTIGATE-ngo-supply-data-model.md#decisions-resolved-during-planning-2026-04-23-conversation) (rollup added only if performance demands).

**Decision-points specific to PLAN-001** (per [PLANS.md](../../PLANS.md#decision-point-ids-qn) `[Q<N>]` convention):

- **[P1.Q1]** **Defer `dim_chapter` + `dim_activity` to PLAN-002** rather than ship empty stub models in PLAN-001. Recommendation: defer. Stubs add no value (vacuous tests, empty tables in the ERD, no data to query). Schemas are captured in the investigation; PLAN-002 reads them.
- **[P1.Q2]** **Initial NGO list scope**: ~10 Tier A NGOs from `ngo-landscape.md` (Røde Kors, Folkehjelp, Nasjonalforeningen, N.K.S., Speiderforbundet, 4H, Frelsesarmeen, Kirkens Bymisjon, Mental Helse, LHL, Diabetesforbundet — 11 candidates). Add Tier B/C orgs in follow-up plans if needed.
- **[P1.Q3]** **`landscape.json` location**: `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json`. The seed-source folder owns both the JSON (human-edited source-of-truth) and the `index.ts` script that flattens it to CSV. Mirrors the existing per-source pattern.
- **[P1.Q4]** **ICNPO codes in v1 dim_ngo**: populate from `ngo-landscape.md` research where the curator already knows them; leave blank otherwise. A follow-up `refresh:brreg-frivillighet` script (separate plan) can enrich these from Brreg's open API.

---

## Phase 1: `ref_atlas_service_category` seed (22 rows) — DONE

### Tasks

- [x] 1.1 [`ref_atlas_service_category.csv`](../../../../atlas-data-repo/dbt/seeds/ref_atlas_service_category.csv) — 22 rows in appendix order. Norwegian labels picked for natural Norwegian usage (`Norsktrening` rather than `Språktrening`; `Hjelpetelefon` rather than `Krisetelefon`). 5 descriptions have commas → CSV-quoted. ✓
- [x] 1.2 schema.yml entry: not_null + unique on code; not_null on label_no, label_en, description; sort_order range 1..22. ✓
- [x] 1.3 seeds/README.md row added (owner=Atlas, refresh=curated). ✓
- [x] 1.4 `description: text` added to `+column_types` in dbt_project.yml. ✓
- [x] 1.5 `dbt build --full-refresh` clean: PASS=446 (was 437 = +9 tests), 0 errors, WARN=16 unchanged. ✓

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt show --inline "select code, label_no, label_en from marts.ref_atlas_service_category order by sort_order"
```

User confirms 22 rows render with Norwegian + English labels matching Appendix A.

---

## Phase 2: `dim_ngo` end-to-end (landscape.json + script + seed) — DONE

Per [Q40 resolution](INVESTIGATE-ngo-supply-data-model.md#open-questions): hand-curated JSON is the source of truth; a TypeScript script flattens it to CSV; dbt loads the CSV.

### Tasks

- [x] 2.1 Created [`landscape.json`](../../../../atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json) with 11 Tier A NGO entries — Røde Kors, Folkehjelp, Nasjonalforeningen, Sanitetskvinnene, Speiderforbundet, 4H Norge, Frelsesarmeen, Kirkens Bymisjon, Mental Helse, LHL, Diabetesforbundet. orgnrs taken from `ngo-landscape.md`. ICNPO codes left null per [P1.Q4]; brand_name set where distinct from legal name. ✓ Schema:

  ```json
  {
    "ngos": [
      {
        "orgnr": "864139442",
        "slug": "redcross",
        "name": "Norges Røde Kors",
        "brand_name": "Røde Kors",
        "website_url": "https://www.rodekors.no",
        "tier": "A",
        "chapter_data_shape": "api_canonical",
        "has_chapters": true,
        "primary_focus": "humanitarian",
        "icnpo_code_1": null,
        "icnpo_code_2": null,
        "icnpo_code_3": null
      }
    ]
  }
  ```

- [x] 2.2 Created [`index.ts`](../../../../atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/index.ts) — reads landscape.json, validates each entry against enum sets (tier, chapter_data_shape, primary_focus), checks for duplicate orgnr/slug, sorts by slug, calls `runSeedSourceGeneric`. ✓
- [x] 2.3 Added `refresh:atlas-ngo-landscape` to package.json. ✓
- [x] 2.4 Created [`README.md`](../../../../atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/README.md) explaining the JSON pipeline + workflow. ✓
- [x] 2.5 `npm run refresh:atlas-ngo-landscape` generated `dim_ngo.csv` with 11 rows. ✓
- [x] 2.6 schema.yml entry added with all the expected tests. **One bug caught**: `dbt_utils.expression_is_true` at column-level prepends the column name to the expression (so `length(orgnr) = 9` becomes `orgnr length(orgnr) = 9` — invalid SQL). Fixed by moving both `length(orgnr) = 9` and `slug = lower(slug)` to model-level `data_tests:` block. Now passes. ✓
- [x] 2.7 Added column types to `+column_types` in dbt_project.yml. ✓
- [x] 2.8 Updated seeds/README.md summary with dim_ngo row. ✓
- [x] 2.9 `dbt seed --select dim_ngo` clean. ✓
- [x] 2.10 `dbt build --full-refresh` PASS=465 (was 446 = +19 tests for dim_ngo), 0 errors, WARN=16 unchanged. Re-running the script reports "no diff" — proves byte-equivalence. ✓

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt show --inline "select slug, name, tier, chapter_data_shape, has_chapters from marts.dim_ngo order by slug"
```

User confirms ~10 NGOs render with correct names, tiers, and `chapter_data_shape` matching the investigation's expectations (Røde Kors → api_canonical, Folkehjelp → cms_bins, etc.).

```bash
cd atlas-data-repo/ingest
npm run refresh:atlas-ngo-landscape
git diff -- ../dbt/seeds/dim_ngo.csv
```

User confirms the diff is empty (proves the script and the committed CSV agree — same byte-equivalence pattern as the other seed-sources).

---

## Phase 3: Vocabulary, ERD regen, final build — DONE

### Tasks

- [x] 3.1 Extended naming-conventions.md canonical vocabulary with 6 new fields: `ngo_orgnr`, `ngo_slug`, `tier`, `chapter_data_shape`, `primary_focus`, `service_category_code`. ✓
- [x] 3.2 Final `dbt build --full-refresh`: **PASS=465, WARN=16, ERROR=0, TOTAL=481**. Total grew from 437 (post-PLAN-foundation baseline) by +28 tests (5 from ref_atlas_service_category + 21 from dim_ngo + 2 model-level expression_is_true tests). ✓
- [x] 3.3 ERD regenerated: now **31 entities, 48 relationships** (was 29/45 before this PLAN; +2 entities = ref_atlas_service_category + dim_ngo, +3 relationships = dim_ngo's three icnpo_code_1/2/3 edges to ref_brreg_icnpo). Verified the new entities and edges are visible in `docs/stack/erd.md`. ✓

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt build --full-refresh
./regenerate-erd.sh
```

User confirms `dbt build` is clean and the ERD shows the two new entities with their edges.

---

## Acceptance Criteria

- [ ] `marts.ref_atlas_service_category` exists with 22 rows matching Appendix A of the investigation (Norwegian + English labels).
- [ ] `marts.dim_ngo` exists with ~10 Tier A NGOs from `ngo-landscape.md`, populated via `landscape.json` and the new `atlas-ngo-landscape` seed-source script.
- [ ] `npm run refresh:atlas-ngo-landscape` regenerates `dim_ngo.csv` byte-equivalently from `landscape.json` (verified via empty `git diff`).
- [ ] `dbt build --full-refresh` passes: PASS grows by ~15, ERROR=0, WARN=16 (unchanged).
- [ ] `docs/stack/erd.md` shows both new entities with their relationships.
- [ ] `docs/stack/naming-conventions.md` lists the new canonical fields (`ngo_orgnr`, `ngo_slug`, `tier`, `chapter_data_shape`, `primary_focus`, `service_category_code`).
- [ ] `dim_chapter` and `dim_activity` are NOT built in this plan — deferred to PLAN-002 per [P1.Q1].

---

## Implementation Notes

- **Why no stub `dim_chapter` / `dim_activity`**: empty tables hold zero rows; their tests would be vacuously true; the ERD would show entities with no real meaning. PLAN-002's first task is "create the dim_chapter SQL + schema.yml", which is cleaner than "edit the empty stub PLAN-001 left behind". Schemas are captured in the investigation; that's the contract.
- **Why JSON not CSV as `dim_ngo` source**: NGO records have nullable fields, future arrays (e.g. `programmes` for Tier C orgs), and human-edited content where YAML/JSON formatting matters more than CSV's flat shape. The seed-source script is the only translation layer; the JSON is the source-of-truth.
- **Why per-NGO `icnpo_code_1/2/3` (denormalised) rather than a junction table**: per [Q43 in the convention investigation](../completed/INVESTIGATE-reference-tables-convention.md#open-questions) — cardinality is hard-capped at 3 by Brreg, ranking matters, junction would lose the order without an extra column. Simple denorm is the right shape.
- **Why no SDG mapping on `ref_atlas_service_category` rows in v1**: SDG tagging is genuinely fuzzy (most categories touch 2-3 SDGs); deferring to a follow-up plan when there's a concrete UI use case is more honest than guessing now. The column can be added later as `sdg_goals text[]`.
- **`refresh:atlas-ngo-landscape` cadence**: curated bucket (per the convention's refresh cadence taxonomy). Refreshed when the team decides to add an NGO or update an existing entry. No external API; nothing to drift against.
- **`dbt_utils.expression_is_true` — column-level vs model-level (gotcha caught in Phase 2.6)**: when used at *column-level*, the macro **prepends the column name** to the expression. So a column-level `dbt_utils.expression_is_true: { expression: "length(orgnr) = 9" }` renders as SQL `WHERE NOT (orgnr length(orgnr) = 9)` — invalid. The same expression works at *model-level* (under the table's bottom `data_tests:` block) where the macro uses the expression verbatim. Rule of thumb: any expression that doesn't start with an operator (`>= 0`, `<> 'foo'`) belongs at model-level. The original PLAN proposed column-level for `length(orgnr) = 9` and `slug = lower(slug)` — both got moved during implementation. Future schema.yml authors should default to model-level for any `expression_is_true` containing the column name explicitly.

---

## Files to Modify

New seeds:
- `atlas-data-repo/dbt/seeds/ref_atlas_service_category.csv`
- `atlas-data-repo/dbt/seeds/dim_ngo.csv` (generated by script in 2.5)

New seed-source module:
- `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/landscape.json`
- `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/index.ts`
- `atlas-data-repo/ingest/src/seed-sources/atlas-ngo-landscape/README.md`

Edit:
- `atlas-data-repo/dbt/seeds/schema.yml` — add 2 seed entries with tests
- `atlas-data-repo/dbt/seeds/README.md` — add 2 rows to summary table
- `atlas-data-repo/dbt/dbt_project.yml` — add new column types to `+column_types`
- `atlas-data-repo/ingest/package.json` — add `refresh:atlas-ngo-landscape` script
- `docs/stack/naming-conventions.md` — add 6 new canonical fields
- `docs/stack/erd.md` — auto-regenerated by `./regenerate-erd.sh` (no manual edit)

---

## Cross-references

- [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md) — the parent investigation; PLAN-A footprint at [Q25].
- [PLAN-foundation-reference-tables.md](../completed/PLAN-foundation-reference-tables.md) — prerequisite PLAN, shipped on main; provides `dim_postnummer`, `crosswalk_kommune_name`, `ref_brreg_icnpo`, `ref_un_sdg`.
- [INVESTIGATE-reference-tables-convention.md](../completed/INVESTIGATE-reference-tables-convention.md) — naming convention for ref/dim/crosswalk tables.
- [`docs/research/ngo-landscape.md`](../../../research/ngo-landscape.md) — source data for `landscape.json`; carries orgnr per NGO.
- [`atlas-data-repo/ingest/src/lib/seed.ts`](../../../../atlas-data-repo/ingest/src/lib/seed.ts) — `runSeedSourceGeneric` runner (added in PLAN-foundation-reference-tables) that this plan reuses.
