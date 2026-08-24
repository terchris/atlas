# PLAN: split checks out of the transform build — the minimum START_TIMEOUT unblock

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Goal**: Clear `RunFailureReason.START_TIMEOUT` with the smallest change that works, so integration criteria 10–12 can be verified — without building machinery that a later architectural decision would delete.

**Last Updated**: 2026-08-24

**Investigation**: [INVESTIGATE-transform-job-decomposition.md](../backlog/INVESTIGATE-transform-job-decomposition.md)

**Priority**: High — last blocker on a four-round integration test.

---

## Problem Summary

`transform_and_publish` plans **711 events, 90.5% of them asset checks**. Dagster builds that plan over gRPC before the run pod exists, and it doesn't finish inside `start_timeout_seconds: 300`.

Measured candidate shapes (from the real manifest; the model reproduces the tester's 711 exactly):

| Shape | Worst plan |
|---|---:|
| Today — monolith | 711 |
| **Build only, checks excluded** | **65** |
| Checks in one job | 644 |
| Layer jobs carrying their checks | 344 |

## Scope — deliberately narrow

Terje's decision (2026-08-24): land the minimum unblock now, **park** the elaborate machinery, then pilot the idiomatic Dagster shape (declarative automation + freshness) before committing to a direction.

**In scope**: separate the dbt build from its checks, and chain them in the correct order.

**Explicitly parked** — build only if hand-built jobs remain the primary mechanism after the pilot:
- layer-based job splitting
- the `get_group_name` translator override
- the CI plan-size budget

Parked, not rejected. If declarative automation wins, all three become work we would build and then delete.

---

## Phase 1: Make the dbt command follow the selection

The dbt asset runs `dbt build` unconditionally, so excluding checks from Dagster's *plan* would still leave dbt running all 784 tests inside the step and reporting them as untyped observations — the pre-round-2 behaviour we deliberately left.

### Tasks

- [x] 1.1 In `atlas_dbt_models`, choose the dbt command from the execution context: assets only → `dbt run`; checks only → `dbt test`; both → `dbt build` (the local "materialise everything" case).
- [x] 1.2 Keep the `api_v1_rowcount_matches_marts` exclusion — still misordered inside a single `dbt build`.
- [x] 1.3 Verify all three selections locally.

### Validation

Selecting assets runs `dbt run`; selecting checks runs `dbt test`; selecting both still runs `dbt build`.

---

## Phase 2: Two jobs, correct order

### Tasks

- [x] 2.1 `transform_and_publish` selects dbt assets **and** `api_v1`, both `.without_checks()`.
- [x] 2.2 A `transform_checks` job selecting the checks.
- [x] 2.3 Chain them: checks run **after** the publish. `dbt run` rebuilds `marts.mart_*` by swapping tables and dropping the old ones `CASCADE`, destroying the `api_v1.*` views; `rowcount_matches_marts` compares the two, so it is meaningless until the publish has re-created them. Prefer a run-status sensor over offset schedules — an offset encodes a guess about duration.
- [x] 2.4 Both selections stay **pattern-based**, never enumerated lists (the zero-edit requirement).
- [x] 2.5 Measure the resulting plan sizes and confirm the build job is ~65.

### Validation

Build job ≈65 events; both jobs run green end-to-end locally, checks after publish.

### Outcome (2026-08-24) — phases 1 and 2 complete

| Job | assets | checks | plan |
|---|---:|---:|---:|
| `transform_and_publish` | 65 | 0 | **65** (was 711) |
| `api_v1_checks` | 0 | 1 | **1** |
| `transform_checks` | 0 | 644 | 644 |

All three run green locally, each with the right dbt verb — logged so it is visible
in the run, not inferred.

**A judgment call beyond the brief: the checks are split in two, not one.** The
tactical fix would leave a single 645-event checks job, which is within noise of the
711 that already fails — so criterion 11 (the `api_v1` rowcount check) would have
ridden on exactly the risk this plan exists to remove. The split is semantic rather
than convenient: the `api_v1` check is a **publish gate** ("does the public surface
match the marts it wraps?"), the 644 dbt tests are **data quality** ("is the data
sound?"). Different questions, different audiences. Chaining them means a
publish-gate failure is never queued behind, or hidden by, the bulk suite. Both
selections stay pattern-based.

**A regression caught before it shipped.** The obvious implementation of "build
without checks" is `dbt run` — and `dbt run` **skips seeds**. Atlas has 16 seed
assets (`ref_*`, `dim_postnummer`, the sources manifest) that models join against,
so on a fresh database — the tester's exact starting state — the models referencing
them would fail. Verified by wiping `marts` and `api_v1` and re-running: `dbt run`
gave `PASS=48`, `build --exclude-resource-type test` gives **`PASS=64`** (48 models +
16 seeds), still with zero tests. The build job now uses the latter.

**Ordering is enforced by sensors, not offsets.** `transform_and_publish` →
`api_v1_checks` → `transform_checks`, chained on run success. An offset schedule
would encode a guess about how long the build takes; a sensor encodes the actual
dependency. The dependency is real: `dbt` swaps the marts tables and drops the old
ones `CASCADE`, destroying the `api_v1` views, so the publish gate is meaningless
until the publish has re-created them.

⚠️ **`transform_checks` is still 644 events and carries the same startability risk.**
That is the known limit of a tactical fix, it is why the platform's timeout bump
matters as margin, and bounding it durably is the architectural question — not this
plan's job.

---

## Phase 3: Re-declare

### Tasks

- [ ] 3.1 Merge, record the image tag.
- [ ] 3.2 Update `~/home/ai-developer/for-ops-atlas-testable.md`: new tag, the two-job shape, and criteria 10–12 restated against it.
- [ ] 3.3 State plainly that this is the tactical unblock and the architectural review is separate, so the tester isn't verifying a shape that may change.

### Validation

A PASS on 10–12 from imac.

---

## Acceptance Criteria

- [ ] `transform_and_publish` plans ≈65 events, not 711.
- [ ] dbt tests still run — as `dbt test` in their own job, still surfacing as Dagster asset checks.
- [ ] Checks execute after the `api_v1` publish, never before.
- [ ] Job membership stays pattern-based; adding a source touches no job definition.
- [ ] `dbt build`, `npm test`, `check-osmosis.sh` still pass.

## Out of Scope

- Everything in the "parked" list above.
- The declarative-automation / freshness pilot — its own plan after this lands.
- The 41-source live ingest run — **approval still open with Terje; do not run it.**
