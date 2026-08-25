# Asgard performance baseline (2026-08-25)

The first full production ingest of Atlas on asgard, and the numbers worth keeping.
Recorded because two of them contradict what everyone expected, including me.

Measured by ops during `PLAN-atlas-asgard-001-deployment` phase 2.2. The imac column
is the controlled comparison: same image, same 41 sources, same code, but talking to
an **in-cluster** Postgres instead of Odin pg through a relay.

| | imac (in-cluster pg) | asgard (relay to Odin pg) |
|---|---|---|
| Sources ingested | 39/41 | **40/41** |
| Rows written | 2,824,464 | **2,904,664** |
| Ingest wall clock | ~49 min | **2m39s** |
| `transform_and_publish` | 2m38s | **38.05 s** |
| `atlas_db` size | 944 MB | 1038 MB |

The +80,200 rows are `bufdir-barnefattigdom`, which was broken on imac and fixed
before this run — explained, not drift.

## The relay is exonerated

Atlas's ETL was the first bulk workload ever to cross the socat relay: a userspace
TCP forwarder, single replica, capped at 200m CPU and 64Mi. Its throughput under
that load was unmeasured, and the standing instruction was *"if the transform is
unexpectedly slow, look at the relay before you look at dbt."*

It was not slow. **Both phases beat the in-cluster baseline.**

```
socat during the run:  21m CPU  of 200m     9–10Mi of 64Mi
```

Roughly a tenth of its CPU limit while shipping 2.9M rows. The three-way diagnostic
set out before the run — *ingest slower with transform proportional → row-shipping;
ingest fine but transform slow → dbt; uniformly slower → round-trips* — returns
**none of the above**. Neither phase was slower than in-cluster at all.

Worth stating plainly for the next tenant that crosses that relay: **at this scale
it is not the bottleneck, and it is not close.**

## What the executor actually did — one pod, multiprocess, as declared

`annual_sources_refresh` created **exactly one** run pod, and its log reads
`Executing steps using multiprocess executor: parent process (pid: 1)`. So the
platform runs **one pod per run** and Atlas's own executor drives the steps as
subprocesses inside it — which is precisely what the job declares.

**`ATLAS_MAX_CONCURRENT_INGESTS` is therefore live, not inert.** It configures that
multiprocess executor's `max_concurrent`, so it is the bound that actually ran. It
should be kept, and it remains the first knob to reach for if the shared Postgres
ever needs protecting.

> ⚠️ **This entry was briefly wrong in the opposite direction, and the mistake is
> worth keeping.** The first version of this page recorded a 31.5-minute ingest with
> ~28 minutes of "pod scheduling", and concluded from it that the executor was being
> overridden and the knob was dead — I was ready to delete a working safety
> mechanism. The 31.5 minutes came from comparing a launch time against the moment
> someone happened to look, rather than against completion. Two people then reasoned
> confidently from it. What settled it was asking for the pod count and the run's
> executor rather than continuing to infer. **Arithmetic on bad inputs is still
> arithmetic, and it is persuasive.**

### One thing genuinely worth a look

| | |
|---|---|
| Sum of per-source durations | 224 s |
| Wall clock | 159 s |
| **Effective parallelism** | **~1.4×** |

With `max_concurrent` at its default of 4, a perfectly packed run would be nearer
56 s of work plus startup, and the two slowest sources alone are 87.7 s. So the
observed 1.4× is well short of what 4-way should deliver.

Most likely explanation: **per-step subprocess startup dominates.** Every step
spawns `npm run ingest:<id>` → npm → tsx → Node → module load, and 38 of those is
real time that no amount of database concurrency removes. If ingest wall clock ever
needs to come down, that is the thing to measure first — not the relay, and not the
database. It is also the same shape as the image-size question: process startup, not
data movement.

Not urgent. 2m39s for 2.9M rows is not a problem that needs solving.

## Slowest sources

| Source | Duration | Rows |
|---|---:|---:|
| `ssb-crime-tables` | 46.2 s | 709,118 |
| `ssb-06913` | 41.5 s | 783,104 |
| `fhi-befolkning` | 17.7 s | 166,968 |
| `ssb-07459` | 15.9 s | 210,728 |
| `bufdir-barnefattigdom` | 13.2 s | 81,568 |

Two sources account for half the transferred rows. If per-source parallelism ever
needs tuning, these are the ones that matter.

## Historical note on the transform

38.05 s is the same job that, three weeks earlier, could not **start** — a 711-event
plan that exceeded a 300-second timeout before a pod existed. Splitting the checks
out of the build took the write path to 65 events. See
[INVESTIGATE-transform-job-decomposition](./plans/backlog/INVESTIGATE-transform-job-decomposition.md).
