# Plan: zero-touch ingest — nothing should need a human to notice and trigger it

Terje's standing requirement after a cluster reset exposed five manual steps in one night: install or reset Atlas and it must ingest fully automatically, with zero commands typed by a person or an agent.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog (phase 1 done, awaiting deploy + verification)

**Last Updated**: 2026-10-01

**Origin**: `rdctl reset --vm` the night of 2026-09-30/10-01. ops-dev's live audit (urb-agents
#1787, #1788, #1789, #1790) found 40 of 43 sources fine and five concrete manual steps someone
had to notice and perform. Terje (urb-agents #1793), verbatim: *"the atlas must be so that when
someone installs it they should never need to manually start something. it should just ingest
the data fully automatically."*

**Acceptance bar, Terje's framing**: install or reset the cluster, walk away, come back in under
an hour — every source in `marts.mart_meta_sources` shows `total_runs >= 1` and a
`last_ingested_at` from today, with zero commands typed by a person or an agent in between.

---

## Phase 1 — DONE: every schedule and sensor in this repo now defaults to RUNNING

### Root cause, verified in code before fixing it

None of the three `ScheduleDefinition`s or two `@run_status_sensor`s in `schedules.py` declared
`default_status`. Dagster's own default for an undeclared status is `STOPPED`. `automation.py`
relied on Dagster's **implicit** `default_automation_condition_sensor`, which also ships stopped
— its own docstring already said so plainly: *"Nothing starts itself on deploy; enabling it is a
deliberate act."* That sentence was correct and is now the thing being deliberately reversed.

🔴 **This was a previous, reasoned safety decision, not an oversight — recorded as a reversal, not
silently flipped.** The STOPPED default exists so a fresh or local instance of this code location
does not immediately fire real scrapers against Bufdir, Brreg, SSB and FHI the moment someone
points it at a database. Checked: **no dev/prod environment split exists in this module** to gate
the new default on, so it now applies everywhere this code location runs, not only the deployed
cluster. If a genuine need for a quiet local/test instance appears later, the fix is an env-gated
`default_status`, not reverting this phase.

### What changed

```
schedules.py    transform_daily, daily_validation, brreg_transform_half_hourly
                  -> default_status=DefaultScheduleStatus.RUNNING
                run_api_v1_checks_after_transform, run_dbt_checks_after_api_v1
                  -> default_status=DefaultSensorStatus.RUNNING

automation.py   replaced the implicit default_automation_condition_sensor with an EXPLICIT
                AutomationConditionSensorDefinition(target=AssetSelection.all(),
                default_status=DefaultSensorStatus.RUNNING) — the exact pattern in
                dagster's own docstring example for this class. Same name, so it is the
                same sensor identity in the UI/database, not a second thing.
```

This directly closes gap **#1** (schedules/sensors come up stopped), most of **#2** (the three
jobs that needed manual triggering — `brreg_bootstrap`, `annual_sources_refresh`,
`brreg_change_feed` — are all reached by the automation-condition sensor or the daily transform
schedule), and **#4** (the two chaining sensors that rebuild `marts.mart_meta_sources` after a raw
ingest).

### Verified, not assumed

```
known-bad (git stash, pre-fix)   all five: STOPPED
known-good (post-fix)            all six (incl. the automation sensor): RUNNING
Definitions object                loads without error — confirmed by importing atlas_data.definitions
```

No test harness exists for this package to run beyond that import check, which is this package's
own closest equivalent to `dbt parse`.

### What this does NOT fix — deploy is not done until this is true on the cluster too

🔴 **Code defaults only take effect on a FRESH Dagster instance** (an empty run-storage database).
`default_status` is explicitly documented as overridable from the UI — if the current cluster's
run-storage already has these recorded as STOPPED from a prior manual pause, this code change
alone will not flip them. **The acceptance check for this phase is a live one**: after this
deploys, either confirm the next reset starts everything RUNNING on its own, or have ops-dev/imac
explicitly re-enable the six on the current instance once, and record that the code-level default
is now what a *future* reset will restore.

---

## Phase 2 — imac's half: the install/reset hook itself

🔵 **Not mine to design.** `.uis.extend` autostart restores 5 pods; it has no concept of Dagster
schedules/sensors at all, because that is UIS tooling, not this repo. Phase 1 makes a **fresh**
Dagster instance come up correctly by itself — it does not make the install/reset **hook**
schedule-aware if the hook's job is literally "bring these 5 named things back," because the
schedules were never one of the 5.

**For imac**: confirm whether Phase 1 alone is sufficient (a fresh Dagster daemon reads
`default_status` from code on startup and self-enables) or whether `.uis.extend` additionally
needs a post-restore step that calls Dagster's GraphQL/CLI to reconcile schedule state. If the
daemon genuinely self-enables from code alone, Phase 2 may already be closed by Phase 1 and this
section becomes a verification task, not a build task.

---

## Phase 3 — redcross-branches: not a code fix, a decision already tracked as F1

**Gap #3** (`redcross_branches` / `redcross_branch_activities` cannot self-heal) is not a
scheduling problem. The ingest module reads a static local file
(`atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json`) that
is **not deployed anywhere on the cluster** — confirmed by grepping the Dockerfile, every deploy
manifest and the UIS config. No credential is checked anywhere in the code; the credential-gated
live API is explicitly deferred future work (`INVESTIGATE-ngo-supply-data-model` [Q39]).

**No third option exists that doesn't require someone's laptop**, per ops-dev's own framing:
either bundle that file into the deploy image, or finish
[F1 in `1PRIORITY.md`](1PRIORITY.md) (the credential-gated live-API path). This PLAN does not
choose between them — that choice already belongs to F1, open since 2026-08-25. Cross-referenced
here so zero-touch's acceptance bar names this gap rather than silently excluding it.

---

## Phase 4 — DONE: the real cause was transient, not any of the three hypotheses ruled out

**Gap #5**: `annual_sources_refresh` reported job-level FAILURE because `raw__bufdir_barnefattigdom`
failed, masking that the other ~36 sources in the same job succeeded.

✅ **Resolved by ops-dev pulling the actual run-pod log** — the three hypotheses this plan ruled
out (zip-filename restructuring, xlsx filter, sheet structure) were correctly ruled out; the
failure never reached any of them. It died on the FIRST network call:

```
TypeError: fetch failed
  at fetchText (bufdir-barnefattigdom/index.ts:69:15)   <- the monitor-page fetch, before
                                                            discoverZipUrl sees any HTML at all
```

**Not currently reproducible** — ops-dev hit the same URL from tecMacDev and from inside the
actual run pod, both 200, hours after the failure. A transient network blip at
`2026-09-30T14:02:23Z` (DNS, a dropped TLS handshake, or Bufdir's own server — undici's generic
wrapper does not say which) failed the whole asset because `fetchText`/`fetchZip` had **no retry
at all**.

**Fixed in PR #483**: `fetch_retry.ts`, matching the retry pattern already used (and independently
duplicated three times, never shared) in `lib/pxweb.ts`, `lib/klass.ts`, `lib/fhi.ts`. Retries
thrown network exceptions as well as 429/5xx — a naive wrapper that only retries HTTP error
statuses would have done nothing for this exact failure. 6 tests cover the retry logic directly,
including the exact exception-then-recovery shape of the real incident.

⚠️ **Consolidating the now-four-way duplication into one shared `lib/http.ts` is a worthwhile
follow-up, not done here** — touching three already-working source files is bigger and riskier
than the fix that was actually needed.

### The structural half — mostly moot now, left open for a genuinely non-transient failure

Terje's framing: *"zero-touch means this can't need a human's judgment call to not be alarming."*
A retry removes most of the practical case for this — the transient blip that triggered gap #5
would simply not have failed with the fix in place. **Still open, not addressed**: whether
`define_asset_job`'s per-asset failure reporting can surface success/failure per-source rather
than one job-level boolean, for the day a source fails for a real, non-transient reason. Not
pursued now because there is no longer a live failure motivating it.

---

## Acceptance Criteria

- [x] Phase 1: all three schedules + all three sensors (incl. the automation-condition sensor)
      default to RUNNING in code, verified against a known-bad (pre-fix) and known-good (post-fix)
      state
- [ ] Phase 1 deployed; ops-dev/imac confirm the six are RUNNING on the live cluster, either by a
      fresh reset self-enabling them or by one manual reconciliation plus confirmation that the
      *next* reset will not need one
- [ ] Phase 2: imac confirms whether `.uis.extend`/`uis deploy` needs its own change, or whether
      Phase 1 alone is sufficient
- [ ] Phase 3: no action here — tracked at F1, cross-referenced
- [x] Phase 4: the real `annual_sources_refresh` error obtained (ops-dev) and fixed — transient network failure, retry added (PR #483)
- [ ] 🔴 Deploy request names the expected state per source, per this repo's standing rule — not
      "schedules enabled," but which `raw.*` tables should show a `last_ingested_at` from the day
      of deploy, and the exact row-count floor each should clear

## Cross-references

- [1PRIORITY.md](1PRIORITY.md) — F1 (redcross-branches credential/file decision)
- urb-agents #1787, #1788, #1789, #1790, #1791, #1793 — the night's measurements this plan is
  built from
