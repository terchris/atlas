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
| Ingest wall clock | ~49 min | **~31.5 min** |
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

## The real lever is pod startup, not throughput

The number that matters for anyone wanting this faster:

```
ingest wall clock      ~31.5 min
actual transfer work     3.7 min   (sum of per-source durations, 224 s)
unaccounted             ~28 min    ← Dagster pod scheduling
```

**Nearly 90% of the ingest was waiting for pods, not moving data.** 38 assets at a
concurrency of 4 means roughly ten waves, and the overhead works out at about 175
seconds per wave.

So optimisation effort should go to pod startup — image size, pull caching, or
running more steps per pod — and **not** to dbt, the SQL, or the relay. Atlas's
image is ~1.5–2 GiB, which is the obvious first suspect.

⚠️ **Open question, and it bears on a safety property.** The observed shape (one pod
per asset) is *not* what Atlas's code asks for. `annual_sources_refresh` declares a
`multiprocess_executor`, which should run 38 steps as subprocesses inside **one** pod
— and the arithmetic agrees: 224 s of work at 4-way concurrency in a single pod is
one to two minutes, not 31.5.

If steps are executing as separate pods, the platform's executor is overriding
Atlas's, which means **`ATLAS_MAX_CONCURRENT_INGESTS` is inert on asgard** — a knob
everyone believes in, doing nothing. The concurrency of 4 observed would then be the
platform's cap rather than Atlas's bound. The imac tester verified that bound working
in round 4, so this would be an environment difference, not a code regression.
Being chased with ops.

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
