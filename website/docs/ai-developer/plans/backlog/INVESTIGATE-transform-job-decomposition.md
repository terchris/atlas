# INVESTIGATE: decompose `transform_and_publish` — plan size, not job count

> **IMPLEMENTATION RULES:** Before implementing, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — RE-SCOPED 2026-08-24 after Terje's architectural review

⚠️ **Read this first.** The tactical unblock has been separated out and shipped as
[PLAN-transform-checks-split](../active/PLAN-transform-checks-split.md) (711 → 65
events). Everything this investigation proposed *beyond* that — layer-based job
splitting, the `get_group_name` translator, the CI plan-size budget — is
**parked**, not rejected, pending the question below.

**The question that came out of review** (Terje, 2026-08-24): *are we using Dagster
so that it follows best practice?* The audit says no. Atlas uses `ScheduleDefinition`
and `define_asset_job` — the oldest, most Airflow-shaped part of the API — and **none**
of `AutomationCondition`, `FreshnessPolicy`, partitions, sensors\*, or
`AutoMaterializePolicy`, all of which ship in the 1.13 we run.

That reframes this whole document. **The 711-event plan is not a Dagster problem
Atlas must engineer around; it is a consequence of using Dagster as a cron runner.**
Asset-centric Dagster does not have large jobs to start — the daemon materialises
what is stale, in small units. And Terje's zero-edit requirement is precisely what
declarative automation delivers structurally: there are no job membership lists to
edit because there are no jobs.

So the machinery below risks being sophisticated workarounds for a shape idiomatic
Dagster would not produce. **Decision (Terje): land the tactical unblock, park the
machinery, then pilot the idiomatic shape on one slice and compare before
committing.** The pilot is its own plan.

\* sensors are now used, for the transform chaining — added by the tactical plan.

The analysis below stands on its measurements and is retained as the record of what
a job-splitting approach would cost.

**Goal**: Make Atlas's transform pipeline start reliably regardless of how many sources exist, and make adding a source require **zero** edits to any existing job or schedule.

**Last Updated**: 2026-08-24

**Origin**: Round-4 integration test (`~/home/ai-developer/for-ops-test-atlas.md`) — criteria 1–9 and 13 PASS; 10–12 blocked by `RunFailureReason.START_TIMEOUT`. Direction from ops/Terje in `~/home/ai-developer/for-atlas-transform-split.md`.

**Authority**: Terje fixed the *requirement*; the *solution* is Atlas's to design. This investigation adopts part of ops's suggestion, **measures the rest and disagrees with it**, and proposes a different primary fix.

---

## The requirement (fixed — not up for redesign)

> **Adding a new data source must touch ZERO existing job/schedule definitions.**

Plus: `START_TIMEOUT` must be solved durably — growth must degrade run *duration*, never run *startability*.

---

## What actually failed

`transform_and_publish` plans **711 events**, and Dagster constructs and persists that plan over gRPC *before* the run pod exists. On the test cluster that does not finish inside `start_timeout_seconds: 300`, so the run dies having created no pod. A 3-asset job starts fine — it scales with **plan size**, not job type.

**Plan size measured from the real manifest** (this reproduces the tester's 711 exactly — 708 + `api_v1` + its check — which is the evidence that the model below is sound):

| dbt layer | assets | checks | plan events |
|---|---:|---:|---:|
| indicators | 23 | 321 | **344** |
| marts | 17 | 150 | 167 |
| seeds/sources (`?`) | 16 | 111 | 127 |
| dimensions | 5 | 44 | 49 |
| supply | 3 | 18 | 21 |
| **total** | **64** | **644** | **708** |

**90.5% of the plan is asset checks.** That number is the whole story.

---

## Where this investigation disagrees with the suggestion

Ops proposed Split 1 (checks out of the build) and Split 2 (by layer). Measuring both against candidate job shapes:

| Shape | Worst-case plan | Verdict |
|---|---:|---|
| A. Today — one monolith | 711 | ❌ the blocker |
| B. Build only, checks excluded | **65** | ✅ **11× smaller — fixes the write path** |
| C. Checks in one job (Split 1 as stated) | **644** | ❌ **inherits the identical problem** |
| D. Checks split by layer (Split 1 + 2) | **321** | ⚠️ better, still 5× the build job |
| E. Layer jobs each carrying their checks (Split 2 alone) | **344** | ❌ half the monolith; not a fix |

Two conclusions the suggestion doesn't reach:

1. **"Checks as a separate job" relocates the timeout, it does not kill it.** A checks job is 644 events — within noise of the 711 that already fails. Split 1 fixes the *build*, which is what unblocks the pipeline's write path, and leaves the checks path exactly as unstartable.
2. **Splitting by layer is a maintainability change, not a startability fix.** The worst layer job is 344 events — better than 711, but the same order of magnitude, and it is the *growth* that matters (below).

Neither point is a reason to abandon the suggestion; Split 1's build side is the single highest-value change available (711 → 65). But it is a reason not to stop there and call it fixed.

## How much runway the timeout bump actually buys — measured, 2026-08-24

The platform raised `start_timeout_seconds` 300 → 900, and the tester measured the
monolith against it rather than declaring victory:

```
launch 22:05:06 → run pod created 22:14:30   = 564s to construct and persist the plan
SUCCESS, 65 materializations
```

**564s of 900s consumed. ~336s spare — roughly 60% growth before it returns.** That
turns a vague worry into arithmetic:

| | |
|---|---|
| Plan budget at 900s | ~1135 events |
| Cost per source | ~15.8 events (711 − 65 build events, over 41 sources) |
| Sources before the limit returns | **~68** |
| Sources today | 41 |

**The bump buys about 27 more sources.** Atlas's own sector map lists 35+ NGOs
before counting public-data sources, so that is a runway measured in months of
onboarding, not a fix. ops said as much — margin, not cure — and this is the number
behind it.

Against the same measurement, after the checks split:

| Job | events | projected plan time |
|---|---:|---:|
| `transform_and_publish` | 65 | **~52s** |
| `transform_checks` | 644 | ~511s |

So the split moves the **write path** — the one that must run for the API to be
fresh — from 564s to about 52s, comfortably clear of any plausible limit. It leaves
the **checks path** at ~511s, still 57% of the budget. That is the precise shape of
the remaining problem, and it is worth being clear that it is now a *checks*
problem rather than a *pipeline* problem.

## The structural problem: a fixed partition count cannot bound a growing plan

Atlas has ~19 dbt tests per source and the layer count is **five and stable** — which is exactly what makes layers attractive for membership, and exactly what makes them useless as a size bound. Layer *count* never grows; layer *size* grows with every source. `indicators` is already 344 events at 41 sources. At 80 sources it is the monolith again, and we will be having this conversation with a different job name.

So the design target is not "fewer events per job today". It is **a plan whose size does not grow with source count**, or a partition scheme whose partition *count* grows instead of its partition *size*.

---

## Proposed direction

### 1. Build excludes checks — do this first, it unblocks 10–12 (711 → 65)

The build job selects assets with `.without_checks()`, and — importantly — the dbt asset must invoke **`dbt run`, not `dbt build`**. Excluding checks from Dagster's *plan* while still calling `dbt build` would leave dbt running all 784 tests inside the step and reporting them as untyped observations, which is the pre-round-2 behaviour we deliberately moved away from. The split has to happen in both the Dagster selection and the dbt command.

### 2. Checks run per layer, membership by dbt folder — and this needs a mechanic that does not exist yet

⚠️ **All 64 dbt assets are currently in group `default`.** dagster-dbt is not deriving groups from folders, so *no* pattern-based layer selection is possible today. This is the one genuine piece of new machinery the split needs: a `get_group_name` override on `AtlasDbtTranslator` that maps `models/<layer>/...` → group `<layer>`. Once that exists, `AssetSelection.groups("indicators")` is a pure selector and a new model in `models/indicators/` joins automatically.

### 3. Bound the plan in CI, so this fails on a build and not in a cluster

This is the pattern that has caught every prior class of defect in this integration (the path bug, `dagster_postgres`, the `.env` wrapper): assert the property at build time. Add a check that computes the largest job's plan size from the manifest and **fails above a budget** (~400 events, comfortably under a 300s start and well under the platform's new 900s margin). Then the next time Atlas grows past what a run pod can start, a PR goes red with "the indicators checks job is now 410 events" instead of a run dying silently in a cluster months later.

Without this, every option above is a one-time fix to a recurring problem.

### 4. Ordering — the CASCADE constraint is load-bearing

`dbt run` rebuilds `marts.mart_*` by swapping tables and dropping the old ones `CASCADE`, which **destroys the dependent `api_v1.*` views**. So the only valid order is:

```
models (dbt run) → api_v1 publish → checks
```

Checks must run last because `rowcount_matches_marts` compares `api_v1` against `marts`, and before the publish those views do not exist. Splitting into separate jobs makes this choreography explicit rather than implicit — which is an argument *for* the split, but only if the chaining is real. Options to evaluate when planning: a run-status sensor chaining each stage, versus one schedule per stage with offsets (fragile — offsets encode assumed durations), versus keeping the stages as one job with the checks excluded from the plan.

### 5. Rejected, with reasons

- **Split by domain/source family** — rejected by Terje, and independently by the requirement: each new family means new job wiring.
- **Disable asset checks** (`enable_asset_checks=False`) — collapses the plan to ~65 events, the smallest possible. Rejected: it reverts to untyped observations where a failing test is a log line rather than an unhealthy asset. That visibility *is* Atlas's in-pipeline data-quality gate (conformance C11 tier 3). Trading it for startability would be solving the right problem with the wrong currency.
- **Relying on the platform's timeout bump** — the raise to 900s is margin, not a cure, and ops says so. At the current growth rate it buys time, not safety.

---

## The requirement is already violated on the ingest side — fix it in the same work

Worth stating plainly, because it was not in the brief and it is the same defect class:

```python
# schedules.py
_ANNUAL_SOURCE_IDS = [*SSB_SOURCES, *SSB_CRIME_SOURCES, *FHI_SOURCES, "bufdir-barnefattigdom"]
```

That hardcoded `"bufdir-barnefattigdom"` means **adding any annual source that is not SSB or FHI requires editing a job definition today.** The transform side is being held to a standard the ingest side does not currently meet.

Proposed fix, same principle: cadence becomes a **tag on the asset** (`atlas/cadence: annual|monthly|weekly`), set where the source is declared, and the jobs select `AssetSelection.tag("atlas/cadence", "annual")`. Adding a source then means declaring it with a cadence — and nothing else. This should be validated by the dry-run below alongside the transform work.

## Validating the acceptance criterion

Per ops: add a fake source and count files touched outside its own additions — must be **0**. Worth automating as a test rather than performing once by hand, since the criterion is about a property that must hold for every future source, not about today's tree.

---

## Open questions for review

1. **Is 400 the right plan-size budget?** It is chosen to sit under the *old* 300s timeout rather than the new 900s, on the grounds that a budget calibrated to the margin consumes the margin. Wants a sanity check from ops/assist.
2. **Chaining mechanism** — run-status sensor vs per-stage schedules. Sensors are more correct and less familiar in this codebase; offsets are simpler and encode a guess about duration.
3. **Does the checks job need further subdivision now, or is a CI budget enough?** At 321 events the worst checks job starts today; the budget gate is what stops it silently becoming 500.
4. **Should `?`-layer assets (seeds/sources, 127 events) get an explicit layer**, or stay grouped as-is?

## Out of scope

- The 41-source live ingest run — **approval still open with Terje; do not run it.**
- The platform's `start_timeout_seconds` bump and the webserver connection-pool observation — both routed to assist.
