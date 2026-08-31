# INVESTIGATE: A source can silently stop refreshing and every signal stays green

## Status: Backlog

**Question**: On 2026-08-30, 15 of 41 sources did not refresh — and the check suite returned
exactly the same numbers as the night before. What signal should have gone red, where should it
live, and how do we build it without alarming on the sources that have no cadence *by design*?

**Last Updated**: 2026-08-30

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
