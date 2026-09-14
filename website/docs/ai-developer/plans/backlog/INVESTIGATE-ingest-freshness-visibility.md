# INVESTIGATE: A source can silently stop refreshing and every signal stays green

## Status: Backlog

**Question**: On 2026-08-30, 15 of 41 sources did not refresh — and the check suite returned
exactly the same numbers as the night before. What signal should have gone red, where should it
live, and how do we build it without alarming on the sources that have no cadence *by design*?

**Last Updated**: 2026-09-14 — the surface is built; see the 2026-09-14 section below for what is answered and what remains.

**Priority**: **High** — this is the finding with teeth from the 2026-08-30 tick. The retry and
API-version items are about *preventing* a missed refresh; this one is about *noticing* it. We
currently would not.

**Origin**: Sunday 02:00 tick, 2026-08-30 (`for-atlas-ops-sunday-tick-capture.md` in
`terchris/home`), and the exchange that followed it.

---

## What happened

All 15 `raw__ssb_*` steps failed on HTTP 429. Then:

- the 05:00 chain ran **clean** — `transform_and_publish`, `api_v1_checks`, `transform_checks` all
  SUCCESS;
- the check suite returned **649 total, 632 pass, 17 WARN — identical to before the tick**;
- row counts looked healthy: `raw` 2,906,072 · `marts` 2,807,030 · `fact_kommune_indicators`
  617,834.

Downstream ran happily on **stale raw data**. The incident report itself offered "checks unchanged"
as reassurance — and unchanged checks were the *symptom*, not the reassurance. The only red thing
in the system was a failed Dagster run, on a weekly job, at 02:00 on a Sunday.

**The core gap: nothing in the check output distinguishes "refreshed, and the numbers happen to be
identical" from "never refreshed at all".** Both render as green.

This is a known failure shape, not a novel one. Monitoring that cannot tell *working* from
*silently not-working* is not monitoring.

## Why the existing plumbing does not already cover it

- Every raw table has a mandatory `loaded_at timestamptz`, and `raw.ingest_runs` records start and
  finish per run (`ingest/src/lib/ingest_run.ts`). **The data to answer this exists.** Nothing
  asserts on it.
- dbt source freshness is *configured* (`loaded_at_field`) but a failed ingest does not fail the
  transform — the transform reads whatever raw holds.
- [INVESTIGATE-data-freshness-surface](./INVESTIGATE-data-freshness-surface.md) is **reader-facing**
  and explicitly puts "operator-facing observability" and "alerting when data goes stale" out of
  scope. This item is that out-of-scope half. The two should stay separate and cross-referenced;
  they may well share the underlying `max(loaded_at)` per-source model.

## 🔴 Constraint discovered 2026-09-05: nobody can observe the production instance

This changes the design, so it is stated before the questions rather than after.

The fleet **cannot reach asgard at all**. `kubectl` is absent on both tecMacDev and the ops
host; the ops host holds the asgard kubeconfig but has no client to use it; and huginn, which
runs inside the cluster, is excluded pending login. The independent tester verified Dagster on
2026-09-04 and all four checks passed — **on its own Rancher Desktop cluster**, where every
schedule is deliberately STOPPED and the newest run is 2026-08-24. That is a different instance
from the one that carries our data.

**asgard's Dagster has therefore been unverified since 2026-08-30**, and the evidence from that
date is still the newest that exists.

Nor can this be routed around through the data. Measured from tecMacDev on 2026-09-05:

| host | result |
|---|---|
| `atlas.sovereignsky.no` (docs site) | HTTP 200 |
| `api-atlas.sovereignsky.no` | NXDOMAIN |
| `api-atlas.helpers.no` | NXDOMAIN |
| `atlas.helpers.no` | NXDOMAIN |

⚠️ Unverified: whether those names resolve inside the tailnet or from the cluster. This machine
roams, so the honest claim is *not reachable from here now*, not *the API is down*. Either way,
the observability path this investigation would naturally have used is not available today.

### What that means for the design

The original sketch assumed a freshness assertion evaluated **inside the check suite**, alongside
the other 649 checks. That assumption is now suspect, because it inherits the same blind spot as
everything else: if the daemon stalls, no schedule fires, no transform runs, **and no check runs
either** — so a check that lives in the suite cannot report that the suite did not run. The
platform has the counterpart control for its half (`./uis verify dagster` check C, the daemon
heartbeat, confirmed trustworthy by the tester on 2026-09-04), but **nobody in the fleet can
currently execute it against asgard**.

So the question sharpens: **the freshness signal must be readable from somewhere that does not
depend on the pipeline having run, and does not require cluster access.** A row in Postgres
carrying `max(loaded_at)` per source satisfies the first half and is the natural substrate; what
is missing is a reader for it that works from outside the cluster. Whether that is the public API
surface, an external probe, or something pushed outward on a timer is exactly what this
investigation now has to decide — and it should not settle on a mechanism that only an agent with
cluster access can read, because at present no such agent exists.

## ✅ 2026-09-14: the surface exists, and it is readable without the pipeline having run

`marts.mart_source_freshness` (a **view**) and the `Source freshness` block in
`atlas-status.py`, reached by `uis template check atlas`. Raised by ops-dev on urb-agents #1039
after Terje asked the obvious question of the status output — *"i see that you listed the brreg
info. but what about all the other data that is ingested"*.

**What was actually wrong** was not that the check was missing. It existed —
`raw_sources_were_refreshed_recently`, written after the incident above. Its **verdict** was
unreadable: it lands in dbt's run results and in Dagster's event log, and `atlas-status.py` can
read neither (the event log is owned by the `dagster` role, which Atlas has no SELECT on). So the
operator-facing command reported a **24-hour window** instead — honest about being a window, and
structurally unable to see a weekly or monthly source go stale, because a day after they run they
drop out of it. 23 of the 29 bounded sources are weekly and 3 are monthly.

| question above | answer as built |
|---|---|
| 1. what is the assertion | `max(<loaded_at_field>)` within the bound its declared `meta.ingest_cadence` allows |
| 2. sources with no cadence | `manual` and `none`, each requiring a written `cadence_note`; **emitted as `not_bounded` rather than filtered out**, so a reader says "29 bounded, 5 silenced" instead of quietly reporting a smaller universe |
| 3. where does it run | **both, from one computation.** The view is the surface, the dbt test is the gate and selects its failures from the view. They cannot disagree. |
| 5. "did not run" ≠ "nothing found" | a missing view is `CANNOT` (exit 2), never a pass — absence must not render as green |
| 6. the weekly blind window | gone: the bound is per cadence, so a weekly source is overdue at 8 days and a monthly one at 35 |

🔵 **The 2026-09-05 constraint is partly lifted.** The design note said the signal *"must be
readable from somewhere that does not depend on the pipeline having run"*. A view satisfies that
literally — it is evaluated when queried, so it is current whether or not the transform, the suite
or the daemon ran. A table would have carried the staleness it was meant to report.

⚠️ **What is still open, and it is the smaller half.** The reader is `uis template check atlas`,
which runs *inside* the cluster and only when somebody runs it. So the original stalled-daemon
case — nothing fires, nothing checks, nobody looks — is still not self-reporting. What has changed
is that the answer is now one command away instead of absent, and the command does not need the
pipeline to have run. An external prober or a pushed heartbeat remains the open design question;
it no longer blocks knowing whether the data is fresh.

### Falsification: performed, not promised

Run against a throwaway Postgres with all 34 declared source tables created and loaded
(2026-09-14):

| case | result |
|---|---|
| all sources fresh (**known-good control**) | 29 `ok`, 5 `not_bounded`; test PASS |
| a weekly source aged to 9 days | `overdue`; test fails with 1 row |
| a **monthly** source aged to 9 days | still `ok` — the ~23-red-days-in-31 cry-wolf does not return |
| the same monthly source at 36 days | `overdue` |
| a source table emptied | `never_loaded`, not a blank age; test fails |
| the view present but holding no bounded rows | test fails with `no-bounded-sources-in-view` — it cannot pass vacuously |
| a declared source missing from the view | test fails with `absent_from_view` |
| the view absent entirely | status tool reports CANNOT (exit 2), not OK |

## Questions to resolve

1. **What is the assertion?** Probably: for each source, `max(loaded_at)` is within its expected
   cadence. Needs a per-source expected cadence, which we do not have as data today — cadence
   currently lives in schedules and manifests.
2. 🔴 **How do sources with no cadence behave?** This is the question that decides the design.
   `frr` is permanent and private by design; `redcross-branches` is parked on Terje's APIM key.
   **Both legitimately have no automation condition and no freshness policy, for different
   reasons**, and neither should ever alarm. A naive "everything must be fresh" check fires on both
   from day one, gets muted, and then protects nothing.
3. **Where does it run?** A dbt test over a freshness model, or a Dagster asset check? The dbt suite
   is where the other 649 checks live, but it runs *after* the transform — and the transform is
   exactly the thing that will happily proceed on stale data.
4. **What severity?** We already carry 17 tolerated WARNs. Adding staleness as another WARN risks
   being filed with them and ignored. ERROR-severity has the opposite risk: a source that is
   *legitimately* late fails the nightly run.
5. **"Did not run" must not look like "nothing found."** If the freshness check itself is skipped or
   errors, that must render differently from a clean pass. This is the same trap as the finding
   above, one level up.
6. **Does the weekly cadence need its own treatment?** A daily source going stale is visible within
   a day. A weekly source has a seven-day blind window, which is exactly the window we just sat in.

## Falsification the eventual fix must pass

**Reproduce 2026-08-30 deliberately**: hold `raw.ssb_*` at yesterday's `loaded_at`, run the suite,
and require it to go **red**. If it stays green, the check does not work — regardless of how
sensible it looks.

⚠️ This repo has shipped a guard that protected nothing, and a green uniqueness test once masked
the RISK-1 fan-out. **Make it fail on purpose before trusting it.**

## Related

- [PLAN-ingest-retry-budget](./PLAN-ingest-retry-budget.md) — F-A/F-C, preventing a *brief*
  throttle from costing a refresh. Does not help against a multi-hour outage.
- [INVESTIGATE-ssb-api-version-dependency](./INVESTIGATE-ssb-api-version-dependency.md) — F-B, the
  upstream that failed.
- [INVESTIGATE-data-freshness-surface](./INVESTIGATE-data-freshness-surface.md) — the reader-facing
  counterpart, deliberately out of scope here.
