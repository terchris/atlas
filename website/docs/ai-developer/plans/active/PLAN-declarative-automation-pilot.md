# PLAN: declarative automation + freshness — pilot on one slice

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — pilot ran, Terje approved adoption, migration implemented

**Goal**: Answer with evidence whether Atlas should move from hand-written jobs and cron schedules to Dagster's asset-centric automation — by running it on one slice, beside the existing jobs, not instead of them.

**Last Updated**: 2026-08-24

**Investigation**: [INVESTIGATE-transform-job-decomposition.md](../backlog/INVESTIGATE-transform-job-decomposition.md)

**Origin**: Terje asked, on seeing the job-splitting work, *"aren't we using Dagster so that it follows best practice?"* The audit said no: Atlas used `ScheduleDefinition` and `define_asset_job` — the oldest, most Airflow-shaped part of the API — and none of `AutomationCondition`, `FreshnessPolicy`, partitions or sensors, all of which ship in the 1.13 we run.

---

## Why this matters beyond tidiness

Two of Atlas's recent problems are consequences of the job-centric shape, not of Dagster:

- The **711-event plan** that could not start existed because we built a monolithic job. Asset-centric Dagster has no large job to start.
- **"Adding a source must touch zero job definitions"** is satisfied by cadence buckets only by convention — and not even reliably: `schedules.py` still hardcodes `"bufdir-barnefattigdom"`, so adding a non-SSB/FHI annual source means editing a job today.

And one gap is about the product rather than the plumbing: **Atlas claims its data is current** — the website says "recently refreshed" — while having 645 checks about data *shape* and no machine-readable definition of what fresh means.

## Scope

Pilot slice: the **SSB Klass family** (`ssb_klass_kommuner`, `ssb_klass_fylker`) — 2 assets, monthly, feeding `dim_kommune`. Small, and its cadence is simple enough that a difference in behaviour is attributable.

`klass_monthly` is **left in place**. Both the job and the automation sensor ship **STOPPED**; enable one or the other, never both. Reverting the pilot is deleting one module and two keyword arguments.

---

## Phase 1: Implement the pilot

### Tasks

- [x] 1.1 `_factory` accepts `automation_condition` and `freshness_policy`, defaulting to `None` so all 39 non-pilot sources are untouched.
- [x] 1.2 Klass assets declare `AutomationCondition.on_cron("0 1 1 * *", "Europe/Oslo")` — the same monthly cadence, expressed on the asset.
- [x] 1.3 Klass assets declare a `FreshnessPolicy` — WARN at 45 days, FAIL at 90.
- [x] 1.4 A scoped `AutomationConditionSensorDefinition` targeting only the pilot assets.
- [x] 1.5 Verify the rest of the graph is unchanged (113 assets, three transform jobs as before).

### Validation

Definitions load; conditions and policies attached to exactly two assets; nothing else moved.

---

## Phase 2: Findings

### ⚠️ Finding 1 — the headline. `on_cron` silently never fires if an upstream is not also automated.

Tested with `evaluate_automation_conditions` against an ephemeral instance:

| | requested |
|---|---:|
| After the monthly cron tick, deps never materialised | **0** |
| Same tick, after `raw/_migrations` materialises | **2** |

`AutomationCondition.on_cron` is not "run on this cron". It expands to *cron tick passed* **AND** `all_deps_updated_since_cron`. The Klass assets depend on `raw/_migrations` — an upstream **I added in round 3** so the graph would show that ingests need their tables — and `raw/_migrations` has no automation condition of its own. So the condition can never become true, and the assets **would never run**.

This is the dangerous class of failure: not a failed run, but **no run at all, and no error**. A cron job that breaks tells you. This would just quietly stop refreshing, and the first symptom would be a user reading stale data.

It is not an argument against declarative automation — it is an argument that adopting it is a **graph-wide** change, not a per-asset one. Any real adoption must give every upstream in the chain a condition (`raw/_migrations` included), or explicitly drop the deps clause and accept running before the schema exists. Piecemeal adoption is the trap.

### Finding 2 — the documented way in is already superseded

`build_last_update_freshness_checks` + `build_sensor_for_freshness_checks` — the approach most examples still show — warn on import:

```
SupersessionWarning: ... Attach `FreshnessPolicy` objects to your assets instead.
```

The replacement is better on both axes we care about: the policy lives **on the asset**, next to the source it describes, so a new source declares its own freshness and nothing central changes; and it needs **no sensor**, so there is one less stopped-by-default thing to remember to enable. Switched before committing. Worth recording because the superseded form is what a search will find.

### Finding 3 — freshness is the part that pays for itself immediately

Independent of the scheduling question. `FreshnessPolicy.time_window(fail_window=90d, warn_window=45d)` is a one-line, machine-readable statement of what Atlas promises about a source, attached where the source is defined. WARN rather than ERROR deliberately: an SSB table published late is not a broken pipeline, and a check that cries wolf is one people learn to ignore.

### Finding 4 — it does deliver the zero-edit requirement, structurally

A new source declaring its own cadence joins nothing and edits nothing: there is no membership list. That is a stronger guarantee than cadence-bucket jobs, which rely on a maintainer adding the id to the right list — and which Atlas already gets wrong (`"bufdir-barnefattigdom"`, hardcoded in `schedules.py`).

### What the pilot could not answer here

Whether the daemon behaves as expected over time — condition evaluation and freshness state are daemon-side, and this was verified against an ephemeral instance and a simulated clock, not a running cluster.

---

## Phase 3: The recommendation

**Adopt, but as one deliberate graph-wide migration — not incrementally.** Finding 1 is the reason: a half-migrated graph has assets that silently never run, which is worse than the cron shape we have now.

Suggested order, if Terje agrees:
1. **Take freshness policies now**, across all 41 sources, independent of scheduling. Low risk, immediate product value, no daemon behaviour change.
2. **Then migrate automation in one pass** — every ingest asset plus `raw/_migrations` gets a condition, cron jobs and schedules are deleted in the same PR, and the automation sensor is enabled once.
3. **Re-verify with imac** afterwards, since it changes what runs and how.

**Do not** leave the pilot half-enabled in production. As shipped it is inert (everything STOPPED), which is the safe state.

### Tasks

- [x] 3.1 Terje decides: adopt, adopt-freshness-only, or revert.
- [x] 3.2 If adopting, cut the migration PLAN(s) from the order above.
- [ ] 3.3 If reverting, delete `atlas_data/automation.py` and the two keyword arguments.

---

## Acceptance Criteria

- [x] Pilot runs on one slice with the existing job intact and everything shipped STOPPED.
- [x] Evidence gathered on whether the idiomatic shape suits Atlas.
- [x] No change to the other 39 sources or the transform jobs.
- [x] A decision — adopt, 2026-08-24.

## Out of Scope

- Partitions — worth their own investigation; they fit the ingest layer far better than marts models joining many sources.
- The 41-source live ingest run — **approval still open with Terje; do not run it.**


---

## Phase 4: The migration (2026-08-24) — implemented

Terje approved the recommendation, so the pilot became the migration in one pass.

**Freshness, all 41 sources.** `cadence.py` declares the semantics once. Bounds
follow the **polling** cadence, not the publication cadence — an annual SSB table is
still fetched weekly, so "not fetched in a month" means the pipeline is broken
regardless of whether SSB published anything. Weekly-polled sources WARN at 14 days
and FAIL at 30; Klass WARNs at 45 and FAILs at 90.

⚠️ **`frr` gets no freshness policy and no condition.** It reads the private repo,
which is absent from the image by design, so it materialises zero rows on any public
deployment. A freshness policy there would be permanently violated — an alarm that is
always on, which is the same as no alarm at all.

**Automation, 41 assets** (40 sources + `raw/_migrations`). Cadence moved from job
membership lists onto the assets. `raw/_migrations` uses
`AutomationCondition.any_downstream_conditions()` — it materialises whenever any
downstream wants to, serving weekly, monthly and scraper cadences without
enumerating any of them. That is the direct fix for Finding 1, and **it is what
stops all 40 sources silently never running.**

Measured before and after, with `evaluate_automation_conditions`:

| | requested on the weekly tick |
|---|---:|
| Before (migrations unautomated) | **0** — everything stranded |
| After | **41** |

### Three deviations from the plan as written, and why

1. **The ingest jobs were kept; only their schedules were deleted.** The plan said
   delete both. But `klass_refresh` is how the integration tester runs a family on
   demand, and it is the fallback if automation misbehaves. A job nobody schedules
   costs nothing; losing the ability to run one by hand costs a debugging session.
   What was actually removed is the *clock*, which is the part automation replaces.
2. **The pilot's scoped automation sensor was deleted.** Once every asset has a
   condition, Dagster supplies `default_automation_condition_sensor` covering all of
   them. Keeping a second, narrower sensor over the same assets would be two things
   deciding when Klass runs. Verified the default ships **STOPPED**.
3. **A `Definitions`-level executor was added.** Automation launches runs that belong
   to no job, so the job-level executor could not bound them — migrating would have
   *silently discarded* the `ATLAS_MAX_CONCURRENT_INGESTS` bound the tester verified
   in round 4, letting 38 assets open as many concurrent Postgres writers as the pod
   has CPUs. Setting it on `Definitions` keeps it.

### What is still unverified, and it is the important part

**Steady-state behaviour could not be simulated faithfully.** `evaluate_automation_conditions`
requests but does not execute, and materialisations reported into a test instance carry
real timestamps rather than the simulated clock — so multi-cycle sequences (does the
weekly tick fire again next Sunday?) do not reproduce reliably offline. The first-tick
behaviour and the Finding-1 fix are solid; *repeat* behaviour needs a daemon.

Also: `any_downstream_conditions` is flagged **beta** by Dagster, and it is now
load-bearing for every source. Worth knowing.

**Everything ships STOPPED.** The migration changes what *would* run, not what does.
Nothing starts itself on deploy, and enabling the automation sensor is a deliberate act
that should follow cluster verification, not precede it.
