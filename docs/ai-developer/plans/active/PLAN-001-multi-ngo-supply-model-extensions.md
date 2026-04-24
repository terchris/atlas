# Plan 001: Multi-NGO supply model extensions

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Active

**Goal**: Land two data-model extensions on the supply side — `dim_chapter.chapter_subtype` and the new `marts.chapter_kommune_coverage` link table — plus retro-backfill the coverage table for Red Cross so the table has real data on day one. After this plan, the Folkehjelp scrape PLAN can populate `chapter_subtype` for its non-geographic chapters (Solidaritetsungdom, Studentgruppe, Sanitet Haukeland, Sentralt) and write its 14 regional chapters' kommune coverage without any schema work.

**Last Updated**: 2026-04-24

**Investigation**: [INVESTIGATE-multi-ngo-supply-model-extensions.md](../backlog/INVESTIGATE-multi-ngo-supply-model-extensions.md) — 5 design decisions resolved, 3 open items deferred (polish, revisit after 3+ NGOs ingest).

**Scope revision (2026-04-24, from `talk.md` Message 1)**: the original investigation proposed a third extension — `dim_chapter.source_url` with a Red Cross retro-backfill from the API's `branchUrl`. That work is now **dropped**: `dim_chapter.web` already exists and is populated from `supply__redcross_branches.sql`, and the supply-display v1 frontend (PR #9) already deep-links through `chapter.web`. Adding a parallel `source_url` column would duplicate data. If we later want consistent naming (`web` → `source_url`), it's a discrete rename+retrofit PLAN — not bundled here. This PLAN now ships two extensions, not three.

**Prerequisites**: [PLAN-001-scraping-infrastructure](../completed/PLAN-001-scraping-infrastructure.md) — shipped.
**Blocks**: [INVESTIGATE-folkehjelp-supply.md](../backlog/INVESTIGATE-folkehjelp-supply.md)'s PLAN-002 (Folkehjelp scrape) — that PLAN writes to `dim_chapter.chapter_subtype` and `chapter_kommune_coverage`.
**Priority**: Medium

---

## Overview

Three phases, estimated **~1.5–2 h**. The investigation's design work is done; this plan executes it.

**Built in PLAN-001:**

- **`dim_chapter` column**: `chapter_subtype TEXT` added to `dim_chapter.sql` SELECT + schema.yml. Free-text in v1; promoted to `accepted_values` test once 3+ NGOs populate it per investigation [Q1].
- **Supply staging update**: `supply__redcross_branches.sql` adds `NULL::TEXT as chapter_subtype` so the UNION type-aligns when Folkehjelp joins.
- **New marts model**: `chapter_kommune_coverage` (link table) with schema.yml tests (PK, FKs, accepted_values on `source`).
- **New Red Cross staging**: `supply__redcross_chapter_kommune_coverage.sql` — rolls up `parent_chapter_id` → child `kommune_nr` values, writes `source='inferred'`.
- **Docs**: `naming-conventions.md` extended with `chapter_subtype` and `chapter_kommune_coverage`. ERD regenerated.

**NOT built in PLAN-001:**

- **`source_url` column** — redundant with the existing `dim_chapter.web`. Keep using `web`. A rename PLAN can happen later if worthwhile.
- **Folkehjelp contributions to `chapter_subtype` / `chapter_kommune_coverage`** — that's PLAN-002 from the Folkehjelp investigation. This plan ships the schema; Folkehjelp's PLAN populates it for NF.
- **Declared coverage** (`source='declared'`) — every Red Cross row is `inferred`. NGO-published region-coverage scrapes are a future PLAN.
- **`accepted_values` constraint on `chapter_subtype`** — deferred per investigation [Q1].
- **`coverage_role` column on `chapter_kommune_coverage`** — deferred per investigation [Q8].

---

## Phase 1: `dim_chapter.chapter_subtype` — IN PROGRESS

### Tasks

- [ ] 1.1 Update `atlas-data-repo/dbt/models/dimensions/dim_chapter.sql` — add `chapter_subtype` to the SELECT list. Each contributing `supply__*_*` staging model provides the column (either a real value or `NULL::TEXT` as a placeholder) so the UNION type-aligns.
- [ ] 1.2 Update `atlas-data-repo/dbt/models/supply/supply__redcross_branches.sql` — add `NULL::TEXT as chapter_subtype` to the SELECT. No RØFF-specific subtyping yet per investigation §B.2; that's a future pass.
- [ ] 1.3 Update `atlas-data-repo/dbt/models/dimensions/schema.yml` for `dim_chapter` — add `chapter_subtype` entry with description: "Optional subtype for non-geographic chapters. NULL = normal geographic chapter. Vocabulary (`youth-political`, `youth-health`, `student`, `hospital`, `umbrella`) is free-text in v1; promoted to `accepted_values` once 3+ NGOs populate it consistently." No data tests in v1.
- [ ] 1.4 Run `dbt build --select +dim_chapter`. Sanity-check with `dbt show --inline "select count(*), count(chapter_subtype) from marts.dim_chapter"` — `chapter_subtype` is all NULL for Red Cross in v1.

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt build --select +dim_chapter
uv run --env-file ../ingest/.env dbt show --inline "select chapter_id, name, chapter_subtype from marts.dim_chapter limit 5"
```

User confirms: the column exists on `dim_chapter`, all values NULL.

---

## Phase 2: `chapter_kommune_coverage` link table

### Tasks

- [ ] 2.1 Create `atlas-data-repo/dbt/models/marts/chapter_kommune_coverage.sql`:
  ```sql
  {{ config(materialized='table', schema='marts', indexes=[
    {'columns': ['chapter_id']},
    {'columns': ['kommune_nr']},
  ]) }}

  -- chapter_kommune_coverage — which kommuner each regional chapter serves.
  --
  -- Link table between dim_chapter (regional rows) and dim_kommune. Local-level
  -- chapters do NOT need rows here — their kommune_nr lives on dim_chapter directly.
  --
  -- source = 'declared' → NGO publishes the region's coverage explicitly. Authoritative.
  -- source = 'inferred' → rolled up from child chapters' kommune_nr values. May under-report.

  with all_coverage as (
    select * from {{ ref('supply__redcross_chapter_kommune_coverage') }}
    -- Future: union folkehjelp_chapter_kommune_coverage, nks_*, etc.
  )
  select * from all_coverage
  ```
- [ ] 2.2 Create `atlas-data-repo/dbt/models/supply/supply__redcross_chapter_kommune_coverage.sql` — rolls up `parent_chapter_id` → child `kommune_nr` for Red Cross's 19 distrikter:
  ```sql
  {{ config(materialized='view', schema='marts') }}

  with regional as (
    select chapter_id from {{ ref('dim_chapter') }}
    where ngo_orgnr = '864139442' and chapter_level = 'regional'
  ),
  child_coverage as (
    select
      c.parent_chapter_id as chapter_id,
      c.kommune_nr,
      max(c.updated_at)   as updated_at
    from {{ ref('dim_chapter') }} c
    where c.parent_chapter_id is not null
      and c.kommune_nr is not null
      and c.chapter_level = 'local'
    group by c.parent_chapter_id, c.kommune_nr
  )
  select
    cc.chapter_id,
    cc.kommune_nr,
    'inferred'::text as source,
    cc.updated_at
  from child_coverage cc
  join regional r on r.chapter_id = cc.chapter_id
  ```
- [ ] 2.3 Add schema.yml entry for `chapter_kommune_coverage`:
  - `chapter_id` — not_null, relationships to `dim_chapter.chapter_id`.
  - `kommune_nr` — not_null, relationships to `dim_kommune.kommune_nr`.
  - `source` — not_null, accepted_values: `['declared', 'inferred']`.
  - `updated_at` — not_null.
  - Model-level: `dbt_utils.unique_combination_of_columns: [chapter_id, kommune_nr]`.
- [ ] 2.4 Also add a schema.yml entry for `supply__redcross_chapter_kommune_coverage` (placed under `dbt/models/supply/schema.yml`). Minimal — the real tests live on the mart.
- [ ] 2.5 Run `dbt build --select +chapter_kommune_coverage`. Verify:
  - Model builds cleanly.
  - Row count is roughly "number of (Red Cross regional chapter, kommune) pairs where the kommune has at least one local child" — should be a few hundred.
  - All FK tests pass.

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt build --select +chapter_kommune_coverage
uv run --env-file ../ingest/.env dbt show --inline "
  select count(distinct chapter_id) as distrikter_with_coverage,
         count(*) as total_rows,
         min(source) as src
  from marts.chapter_kommune_coverage
"
```

User confirms: coverage rows exist for Red Cross distrikter.

---

## Phase 3: Docs, ERD, wrap-up

### Tasks

- [ ] 3.1 Extend [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md):
  - Add `chapter_subtype` to Canonical vocabulary: list the 5-value v1 vocabulary (`youth-political`, `youth-health`, `student`, `hospital`, `umbrella`) and note it's free-text in v1, promoted to `accepted_values` once 3+ NGOs use it.
  - Add `chapter_kommune_coverage` to Model naming: mention it's a link table in `marts/` following the per-source staging + UNION ALL pattern.
- [ ] 3.2 Regenerate the ERD: `cd atlas-data-repo/dbt && ./regenerate-erd.sh`. Verify `CHAPTER_KOMMUNE_COVERAGE` appears in `docs/stack/erd.md` with edges to `DIM_CHAPTER` and `DIM_KOMMUNE`.
- [ ] 3.3 Final gates: `npm run typecheck` + `npm test` in ingest (tests unchanged; should stay green) + `dbt build` (full; verify PASS increased vs the pre-plan baseline of 526).
- [ ] 3.4 Move this plan from `plans/backlog/` to `plans/completed/`. Update Status to `Completed`, add completion date, one-line shipped-summary.

### Validation

```bash
cd atlas-data-repo/ingest && npm run typecheck && npm test
cd ../dbt && uv run --env-file ../ingest/.env dbt build
grep -A3 "CHAPTER_KOMMUNE_COVERAGE" ../../docs/stack/erd.md | head -8
```

User confirms ERD has the new node; dbt build is green.

---

## Acceptance Criteria

- [ ] `marts.dim_chapter` has a `chapter_subtype` column; all values NULL in v1 (no NGO populates it yet; Folkehjelp PLAN-002 will be the first).
- [ ] `marts.chapter_kommune_coverage` exists with `source='inferred'` rows for Red Cross's 19 distrikter.
- [ ] All relationships tests pass; no new WARN beyond the existing 19.
- [ ] `docs/stack/naming-conventions.md` covers `chapter_subtype` and `chapter_kommune_coverage`.
- [ ] `docs/stack/erd.md` regenerated; `CHAPTER_KOMMUNE_COVERAGE` appears with correct edges.
- [ ] No per-NGO scraper is touched by this PLAN — Folkehjelp's work is separate.
- [ ] `dim_chapter.web` is unchanged — we deliberately did **not** rename/duplicate it as `source_url` per the 2026-04-24 scope revision.

---

## Implementation Notes

- **`dim_chapter.web` stays as-is.** Originally this PLAN was going to add a `source_url` column alongside `web` (with Red Cross retro-backfill from `branchUrl`). Scope revision from talk.md: skip it, use `web`. A future "rename/unify" PLAN can address naming consistency when there's a reason.
- **`dim_chapter` UNION ALL shape**: every supply staging model contributing to `dim_chapter` must include `chapter_subtype` (as `NULL::TEXT` where not yet populated) so Postgres type-aligns the UNION. Folkehjelp's PLAN-002 is aware of this.
- **Inferred coverage does not include inactive local chapters** → actually the Phase 2.2 query filters to `chapter_level = 'local'` but does NOT filter `is_active`. Rationale: if a regional office historically covered kommune X via a now-inactive local chapter, that's still legitimate coverage information for historical queries. Revisit if Coverage-gap queries need an active-only coverage variant.
- **Red Cross local chapters without kommune_nr**: per [PLAN-002 completion notes](../completed/PLAN-002-redcross-ingest.md), some branches have NULL `kommune_nr`. The Phase 2.2 query filters those out — a distrikt won't claim coverage of a kommune it can't point to.
- **dbt build time**: baseline is PASS=526 from PLAN-001-scraping-infrastructure, plus whatever PR #9 (supply-display-v1) and PR #10 (private-atlas-architecture) added. After this plan: +1 mart (`chapter_kommune_coverage`) + its staging + a handful of tests. Verify the exact PASS delta during Phase 3.

---

## Files to Modify

**New files:**
- `atlas-data-repo/dbt/models/marts/chapter_kommune_coverage.sql`
- `atlas-data-repo/dbt/models/supply/supply__redcross_chapter_kommune_coverage.sql`

**Modified files:**
- `atlas-data-repo/dbt/models/dimensions/dim_chapter.sql` — add `chapter_subtype` to SELECT.
- `atlas-data-repo/dbt/models/dimensions/schema.yml` — column description for new field.
- `atlas-data-repo/dbt/models/supply/supply__redcross_branches.sql` — add `NULL::TEXT as chapter_subtype` to SELECT.
- `atlas-data-repo/dbt/models/supply/schema.yml` — entry for `supply__redcross_chapter_kommune_coverage`.
- `atlas-data-repo/dbt/models/marts/schema.yml` — entry for `chapter_kommune_coverage` with all tests.
- `docs/stack/naming-conventions.md` — new entries per Phase 3.1.
- `docs/stack/erd.md` — regenerated by `regenerate-erd.sh`.

**No raw migrations** — this PLAN is marts-layer only after the scope revision.

---

## Decision-points specific to PLAN-001-multi-ngo (per [PLANS.md](../../PLANS.md#decision-point-ids-qn))

Two implementation-level choices the plan leaves to the implementer:

- **[P1M.Q1]** **`updated_at` semantics on `chapter_kommune_coverage`** → `max(child.updated_at)` from the inferred rollup (as drafted in Phase 2.2). Alternative: `now()`. The max-of-children approach is more honest ("this coverage row is as old as the newest contributing child chapter"). No strong reason to deviate.
- **[P1M.Q2]** **Whether to filter inactive local chapters from inferred coverage** → don't (per Implementation Notes). Edge case only matters for historical queries. Revisit if Coverage-gap regresses.
