# PLAN-001 — API-shaped `mart_*` views

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Complete — 2026-04-27 (merged in PR #21)

**Goal**: Build the ~9 `mart_<feature>` dbt views identified by the per-route audit in [`INVESTIGATE-public-api-surface.md`](INVESTIGATE-public-api-surface.md), so PostgREST has stable, OpenAPI-friendly endpoints to project for the dogfood API. **Pure data-side work** — no API code, no frontend changes in this PLAN. The Next.js frontend keeps reading `marts.*` directly until PLAN-E migrates it.

## Final outcome (2026-04-27)

All 7 phases complete. 9 mart views landed under `atlas-data/dbt/models/marts/api/`, each with full schema.yml descriptions and tests; sample-row diffs against the original inline queries match. `check-osmosis.sh` strict gate stays green; full `dbt build` runs 654 PASS / 21 WARN / 0 ERROR / 675 TOTAL across the whole project. The 21 WARNs are 20 pre-existing data-quality warns plus 1 expected new warn for Svalbard (kommune_nr 2100, Longyearbyen Røde Kors) on `mart_kommune_local_chapters` — kept visible by `severity: warn` rather than failing the build.

PLAN-D.2 (PostgREST stand-up) is now unblocked.

Two PLAN expectations were off; verified actual is correct:
- PLAN said `mart_distrikt_summary` = 19; actual = 18. The original `listDistrikter()` query also returns 18 for Red Cross today.
- PLAN said `mart_kommune_local_chapters` for kommune 0301 (Oslo) returns the same chapter list as `/kommuner/0301`. Both old and new return 0 because Red Cross Oslo `redcross-L032` has no rows in `fact_chapter_activities` yet — known supply-side gap, separate from this PLAN.

## Phase 1 outcome (2026-04-27)

Phase 1 ran. dbt-osmosis baseline propagation surfaced **180 columns** in existing models that have no description (initial pass surfaced 164; a second pass — required for full convergence — surfaced 16 more). Per **option D** (resolved during Phase 1), these are accepted as-is and tracked separately in [PLAN-002-fill-schema-yml-description-gaps.md](../backlog/PLAN-002-fill-schema-yml-description-gaps.md). The check script `atlas-data/dbt/check-osmosis.sh` is strict on `models/marts/api/` (the new mart_* views from this PLAN) and lenient (report-only) on existing models. As PLAN-002 phases land, the gap count goes down.

Verification at Phase 1 close:
- `dbt parse` clean, `dbt test` 521 PASS / 20 WARN / 0 ERROR / 541 TOTAL
- `dbt-osmosis yaml document --dry-run --check` exits 0 (idempotent after the two-pass baseline)

Net Phase 1 deliverables:
- `dbt-osmosis>=1.0,<2` in `requirements.txt`
- `+dbt-osmosis: schema.yml` config in `dbt_project.yml`
- 12 schema.yml/sources.yml files reformatted + descriptions propagated + 180 newly-discovered columns surfaced
- `atlas-data/dbt/check-osmosis.sh` (strict-on-marts/api/, lenient-elsewhere)
- `atlas-data/dbt/README.md` documents the new hygiene workflow
- `PLAN-002-fill-schema-yml-description-gaps.md` tracks the 180 backlog

**Last Updated**: 2026-04-27

**Investigation**: [INVESTIGATE-public-api-surface.md](INVESTIGATE-public-api-surface.md)

**Prerequisites**: None blocking. May overlap with PLAN-A from [`INVESTIGATE-semantic-foundation-before-expansion.md`](INVESTIGATE-semantic-foundation-before-expansion.md) (dbt MCP + dbt-osmosis); both share the schema.yml hygiene work in Phase 1 below. Either plan can install dbt-osmosis; the other inherits.

---

## Problem

Atlas's Next.js code today executes hand-written SQL with CTEs and ad-hoc joins for ~10 route patterns that don't fit a simple "select rows from one table" shape. Examples (from the audit):

- `/data` runs a CTE finding `max(year)` per `(source_id, contents_code)`, then groups + counts to summarise every indicator.
- `/coverage-gap/barnefattigdom` runs a CTE finding latest year for `ssb-08764 / EUskala60`, then self-joins for both EU60 and Personer.
- `/ngo/redcross` runs 6 count subqueries (chapters by level, activities, distinct kommuner).
- `/ngo/redcross/distrikter` aggregates child chapter counts per distrikt.

These query shapes can't be expressed cleanly via PostgREST's column-projection API, but they *can* be expressed as dbt views. Promoting each one to a `mart_<feature>` view:

1. Lets PostgREST project them as stable OpenAPI endpoints (PLAN-D.2).
2. Keeps the [naming-conventions doctrine](../../../../docs/stack/naming-conventions.md#when-to-add-a-new-mart_feature) intact: query logic in dbt, API stays projection.
3. Consolidates the SQL — currently scattered across Next.js page files and `atlas-frontend/src/lib/{indicators,supply}.ts` — into the proper dbt layer.
4. Adds dbt tests on each view, catching shape regressions automatically.

## The 9 views

From the audit ([INVESTIGATE-public-api-surface.md → Per-route audit](INVESTIGATE-public-api-surface.md#per-route-audit-2026-04-27-what-backing-the-existing-15-routes-actually-requires)):

| View | Backs route(s) | Source query |
|---|---|---|
| `mart_indicator_summary` | `/data` | `listIndicators()` in `atlas-frontend/src/lib/indicators.ts` |
| `mart_indicator_latest_values` | `/data/[source_id]/[contents_code]` | `loadIndicatorValues()` |
| `mart_indicator_missing_kommuner` | `/data/[source_id]/[contents_code]` | `listMissingKommuner()` |
| `mart_coverage_gap_barnefattigdom` | `/coverage-gap/barnefattigdom` | inline CTE in `atlas-frontend/app/coverage-gap/barnefattigdom/page.tsx` |
| `mart_kommune_local_chapters` | `/kommuner/[kommune_nr]` | `listChaptersInKommune()` in `atlas-frontend/src/lib/supply.ts` |
| `mart_ngo_index` | `/ngo` | `listNgos()` |
| `mart_ngo_overview` | `/ngo/redcross` | `getNgoOverview()` |
| `mart_activity_catalog` | `/ngo/redcross/aktiviteter` | `listActivities()` |
| `mart_distrikt_summary` | `/ngo/redcross/distrikter`, `/distrikt/[id]` | `listDistrikter()` |

Optional 10th view, only if the service-category filter on the chapters page is kept: `mart_chapters_with_service_categories`. Defer the decision to PLAN-E (frontend migration) — by then we'll know if that filter stays.

## Decisions resolved (2026-04-27)

All six decision points settled before implementation begins.

- ~~**[Q1]**~~ dbt-osmosis vs hand-rolled CI gate → **install dbt-osmosis.** Atlas already has 27+ dbt models with 9 more landing in this PLAN; manual schema.yml maintenance scales poorly. dbt-osmosis's description propagation across lineage (write `kommune_nr` once in `dim_kommune`, auto-fills downstream) pays back fast, and the `yaml check` CI gate adds free insurance. Shared with PLAN-A from semantic-foundation. **Resolved.**
- ~~**[Q2]**~~ Subfolder placement → **`atlas-data/dbt/models/marts/api/` subfolder from day one.** With 9 views landing in one PLAN, we cross the naming-conventions threshold ("promote to `marts/api/` subfolder once 5+ exist") immediately. **Resolved.**
- ~~**[Q3]**~~ Materialisation per view → **`table` for all 9.** Atlas's data rebuilds daily at most; consumers want fast reads. `view` would re-execute on every PostgREST request. **Resolved.**
- ~~**[Q4]**~~ Sample-row diff method → **option (a) for the pattern-setter (Phase 2), option (c) for the rest.** Use `dbt show --inline "<existing query>"` and `dbt show --select <new_view>` side-by-side for `mart_indicator_summary` to validate the pattern. For the other 8, eyeball-only unless something looks off — they're mechanical applications of the same template. **Resolved.**
- ~~**[Q5]**~~ Schema.yml description richness → **full descriptions on all 9.** Every column documented; table-level prose explaining what query shape the view serves. Developers consuming the public API need rich documentation to trust the system. PostgREST's auto-generated OpenAPI uses these descriptions verbatim. **Resolved.**
- ~~**[Q6]**~~ Frontend update timing → **separate PLAN.** Next.js stays on inline SQL until the frontend-migration PLAN (PLAN-E lineage from `INVESTIGATE-public-api-surface.md`) lands. This PLAN ships dbt views only; `atlas-frontend/` is untouched. **Resolved.**

---

## Phase 1: dbt-osmosis + schema.yml CI gate

Install dbt-osmosis as the schema.yml safety net before any new mart views land. Coordinate with PLAN-A from [`INVESTIGATE-semantic-foundation-before-expansion.md`](INVESTIGATE-semantic-foundation-before-expansion.md) — whichever PLAN runs first installs it; the other inherits.

### Tasks

- [ ] 1.1 Add `dbt-osmosis` to `atlas-data/dbt/requirements.txt`. Pin to a recent stable version.
- [ ] 1.2 Run `uv pip install -r requirements.txt` in `atlas-data/dbt/.venv` to install.
- [ ] 1.3 Run `dbt-osmosis yaml refactor --target-path target/` against `models/` to baseline-propagate descriptions across the existing lineage. Review the resulting schema.yml diffs in PR.
- [ ] 1.4 Add a CI step (or pre-commit hook) that runs `dbt-osmosis yaml check` and fails on missing descriptions on any `marts.*` model.
- [ ] 1.5 Commit the description backfill as a separate sub-commit so the diff is reviewable separately from the new mart views.

### Validation

- `dbt-osmosis yaml check` exits 0 against the existing repo.
- `dbt build` still passes (the description backfill should be metadata-only, no model changes).

---

## Phase 2: Pattern-setter view — `mart_indicator_summary`

Build one view end-to-end as the template for the other 8. Verify shape against the existing `listIndicators()` query. This phase tests the pattern; the per-view phases that follow are mechanical applications.

### Phase 2 outcome (2026-04-27)

Phase 2 built `mart_indicator_summary` end-to-end: 171 rows, identical top-5 and identical row count to the original `listIndicators()` inline query. `dbt build --select mart_indicator_summary` clean (1 model, 8 tests passing). `check-osmosis.sh` strict gate confirmed the new schema.yml under `models/marts/api/` is fully documented (the gate was previously skipping the directory because it didn't exist).

**Pattern for Phases 3-6:**

1. **SQL file**: copy the relevant inline query from `atlas-frontend/src/lib/{indicators,supply}.ts` into `models/marts/api/mart_<feature>.sql`. Replace `marts.fact_<x>` references with `{{ ref('fact_<x>') }}` (and `marts.dim_<x>` with `{{ ref('dim_<x>') }}`). Keep `order by` for stable output. No `{{ config(...) }}` block — the `marts:` block in `dbt_project.yml` already provides `+materialized: table` + `+schema: marts`, which inherits to `marts/api/`.
2. **schema.yml**: append a model entry to `models/marts/api/schema.yml` (single file shared across all 9 views, per dbt-osmosis's one-schema.yml-per-directory convention). Every column gets a description (Q5). Tests: `not_null` on key columns, `dbt_utils.unique_combination_of_columns` on the natural key, `dbt_utils.accepted_range` where ranges are knowable.
3. **Verify**: `dbt build --select mart_<feature>` (clean), `dbt show --select mart_<feature> --limit 5` vs `dbt show --inline "<original SQL>" --limit 5` (identical top-5), and `./check-osmosis.sh` (strict-on-marts/api/ stays green).
4. **Pitfall**: `dbt show --inline` appends `LIMIT N` itself, so don't include `limit` in the inline SQL — pass `--limit 5` as a flag.

### Tasks

- [ ] 2.1 Write `atlas-data/dbt/models/marts/api/mart_indicator_summary.sql` with `materialized='table'`. Source the SQL from `listIndicators()` in `atlas-frontend/src/lib/indicators.ts:29-53` — the CTE + group-by-source-and-contents already there. Add `source_id`, `contents_code`, `contents_label`, `latest_year`, `kommuner_with_value`, `kommuner_with_null`, `min_value`, `max_value`, `upstream_updated` columns.
- [ ] 2.2 Add `atlas-data/dbt/models/marts/api/schema.yml` with the new model: full description per [Q5] (what it represents, who reads it, query shape), every column documented, `not_null` on key columns, `accepted_range` on `latest_year`.
- [ ] 2.3 Run `dbt build --select mart_indicator_summary` — verify clean run, all tests pass.
- [ ] 2.4 Sample-row diff (option a per [Q4]): `dbt show --select mart_indicator_summary --limit 5` vs. the equivalent of `listIndicators()` (run via psql or a one-off script). Expect identical row shape.
- [ ] 2.5 Document the pattern in this PLAN (a one-paragraph "lessons learned" note) so the next 8 follow the same shape.

### Validation

User reviews the first view, schema.yml description style, and shape-diff result. Approves the pattern before Phase 3 begins.

---

## Phase 3: Data-explorer views (2 more)

Apply the Phase 2 pattern.

### Tasks

- [ ] 3.1 `mart_indicator_latest_values` — source from `loadIndicatorValues()`. Pre-filter `fact_kommune_indicators` to latest year per `(source_id, contents_code)`. Columns: `source_id`, `contents_code`, `kommune_nr`, `kommune_name`, `fylke_name`, `value`, `status`, `year`. PostgREST will filter via `?source_id=eq.X&contents_code=eq.Y`.
- [ ] 3.2 `mart_indicator_missing_kommuner` — source from `listMissingKommuner()`. Active kommuner with no value at latest year per `(source_id, contents_code)`. Columns: `source_id`, `contents_code`, `kommune_nr`, `kommune_name`.
- [ ] 3.3 schema.yml descriptions for both, full style per Phase 2.
- [ ] 3.4 `dbt build --select mart_indicator_latest_values mart_indicator_missing_kommuner` — clean.

### Validation

User confirms the data-explorer views produce shapes equivalent to what `/data/[source_id]/[contents_code]` currently displays.

---

## Phase 4: Coverage-gap view

### Tasks

- [ ] 4.1 `mart_coverage_gap_barnefattigdom` — source from the inline CTE in `atlas-frontend/app/coverage-gap/barnefattigdom/page.tsx`. Latest year per kommune for `ssb-08764 / EUskala60` joined with `Personer`. Columns: `kommune_nr`, `kommune_name`, `fylke_name`, `year`, `value_pct`, `personer`.
- [ ] 4.2 schema.yml description (mention this is the "barnefattigdom map" view; future similar views will follow the same `mart_coverage_gap_*` family naming).
- [ ] 4.3 `dbt build --select mart_coverage_gap_barnefattigdom`.

### Validation

Shape matches the existing barnefattigdom map's data shape; row count equals number of active kommuner with EU60 data.

---

## Phase 5: NGO views (3)

### Tasks

- [ ] 5.1 `mart_ngo_index` — source from `listNgos()`. One row per NGO from `dim_ngo` with `chapter_count` and `has_supply` joined in. Columns: all `dim_ngo` fields + `chapter_count` + `has_supply`.
- [ ] 5.2 `mart_ngo_overview` — source from `getNgoOverview()`. One row per NGO with the 6 counts (chapters total, by level, activities, distinct kommuner). Columns: `orgnr`, `chapter_count`, `national_count`, `regional_count`, `local_count`, `activity_count`, `kommune_count`.
- [ ] 5.3 `mart_activity_catalog` — source from `listActivities()`. One row per (NGO, activity) with service-category label + chapter count. Columns: `activity_id`, `ngo_orgnr`, `canonical_name`, `service_category_code`, `service_category_label_no`, `is_active`, `chapter_count`.
- [ ] 5.4 schema.yml descriptions for all three.
- [ ] 5.5 `dbt build --select mart_ngo_index mart_ngo_overview mart_activity_catalog`.

### Validation

Row counts: `mart_ngo_index` = 11 (matches `dim_ngo`); `mart_ngo_overview` = 11; `mart_activity_catalog` = 35 (current Red Cross activity count, will grow as more NGOs land).

---

## Phase 6: Supply views (2)

### Tasks

- [ ] 6.1 `mart_distrikt_summary` — source from `listDistrikter()`. One row per regional chapter (distrikt) with child counts and kommune coverage. Columns: `chapter_id`, `name`, `kommune_nr`, `kommune_name`, `child_count`, `kommune_coverage_count`, `ngo_orgnr`.
- [ ] 6.2 `mart_kommune_local_chapters` — source from `listChaptersInKommune()`. Distinct chapter+activity rows for active local chapters in a kommune. Columns: `kommune_nr`, `chapter_id`, `name`, `ngo_orgnr`, `ngo_name`, `ngo_brand_name`, `service_category_code`, `service_category_label_no`, `sort_order`. PostgREST filters via `?kommune_nr=eq.X`.
- [ ] 6.3 schema.yml descriptions for both. Note that `mart_kommune_local_chapters` returns multiple rows per chapter (one per service category) — call this out so consumers don't expect chapter-uniqueness.
- [ ] 6.4 `dbt build --select mart_distrikt_summary mart_kommune_local_chapters`.

### Validation

`mart_distrikt_summary` = 19 rows (matches Red Cross distrikt count). `mart_kommune_local_chapters` for kommune `0301` (Oslo) returns the same chapter list `/kommuner/0301` currently shows.

---

## Phase 7: Final verification

### Tasks

- [ ] 7.1 Full `dbt build` against the whole project. All 9 new views materialise; all tests pass; schema.yml coverage gate (Phase 1) passes.
- [ ] 7.2 Spot-check 2-3 of the new views in the database directly (`uv run --env-file ../ingest/.env dbt show --select mart_<view> --limit 5`).
- [ ] 7.3 Update [`atlas-data/dbt/seeds/README.md`](../../../../../atlas-data/dbt/seeds/README.md) or `atlas-data/dbt/models/marts/api/README.md` (new) explaining the `mart_*` family — what it's for (PostgREST API surface), naming convention, when to add a new one.

### Validation

User confirms: all 9 views build clean, tests pass, schema.yml descriptions reviewed, sample rows look right. PLAN-D.2 (PostgREST stand-up) is now unblocked.

---

## Acceptance Criteria

- [ ] dbt-osmosis installed and `yaml check` passes (Phase 1).
- [ ] All 9 `mart_<feature>` views exist as dbt models in `atlas-data/dbt/models/marts/api/`.
- [ ] All 9 have full schema.yml descriptions covering every column.
- [ ] All 9 have at least 2 dbt tests (`not_null` + one of `unique`, `accepted_values`, `relationships`, `accepted_range`).
- [ ] `dbt build` runs clean end-to-end.
- [ ] Sample-row diffs against existing inline SQL (Phase 2 fully, others spot-checked) confirm shape equivalence.
- [ ] No frontend changes — `atlas-frontend/` is untouched. The existing inline SQL keeps working until PLAN-E migrates it.

---

## Files to Modify

- `atlas-data/dbt/requirements.txt` (add `dbt-osmosis`)
- `atlas-data/dbt/models/marts/api/` (new subfolder, 9 new `.sql` files + 1 `schema.yml`)
- `atlas-data/dbt/models/marts/api/README.md` (new — explains the `mart_*` family)
- `atlas-data/dbt/models/marts/schema.yml` may need updating if any of the new views reference existing models that need clarification
- CI config (likely `.github/workflows/*.yml` if it exists, otherwise a `Makefile` target or a `pre-commit` hook) to wire `dbt-osmosis yaml check`

## Files NOT modified

- Anything under `atlas-frontend/` — frontend migration is PLAN-E's job.
- Anything under `atlas-data/ingest/` — ingest is unaffected.

---

## What's next after this PLAN

- **PLAN-D.2** — Stand up PostgREST against `marts.*` (now including these 9 new views). PostgREST auto-generates OpenAPI from the schema; the descriptions written in this PLAN become the public API documentation.
- **PLAN-E** — Migrate `atlas-frontend/src/lib/{indicators,supply,db}.ts` to call PostgREST instead of executing SQL directly. Replace each inline-SQL function with a `fetch()` call against the corresponding `mart_*` endpoint.
- **PLAN-F** — Publish the OpenAPI spec at `api.atlas.helpers.no/docs` (Swagger/Redoc).
- **PLAN-G** — Lift the freeze on supply-side data adds (per `INVESTIGATE-semantic-foundation-before-expansion.md`).
