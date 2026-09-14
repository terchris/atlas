"""
Schedules for the Atlas pipeline.

Cadence is derived from what the upstreams actually publish, not from a blanket
nightly. Every source declares a `periodicity` in its manifest.yml, and across
Atlas's 41 sources that is: 37 × P1Y (annual) and 4 × irregular. Fetching an
annual SSB or FHI table every night would be ~15,000 pointless requests a year
against public-sector APIs Atlas depends on staying welcome at.

## Concurrency — corrected after test round 3

This file used to say "no in-code concurrency limits, deliberately", on the
grounds that the platform's cap of 4 was the bound and capacity policy should not
live in a tenant. **The first half of that was wrong.** The imac tester measured
what actually happens:

- `max_concurrent_runs: 4` bounds concurrent **runs**, i.e. run pods.
- `annual_sources_refresh` is **one run** → one pod → 38 steps as *subprocesses
  inside it*, bounded by the multiprocess executor's `max_concurrent`, which
  defaults to the pod's CPU count.

So the platform cap never engages for a fan-out job, and nothing bounded the
number of simultaneous writers against the shared Postgres. The protection Atlas
was relying on was not the one that applies.

The maintainer's principle still holds — the platform must be able to retune
without an Atlas rebuild — so the bound is set here but read from
**`ATLAS_MAX_CONCURRENT_INGESTS`** (default 4, matching the platform's run cap in
spirit). Ops can change it on the code location without a new image.

Schedules ship **stopped** (Dagster's default). Turning them on in production is
a go-live decision for Terje, not a side effect of deploying the code location.
"""

import os

from dagster import (
    AssetSelection,
    DagsterRunStatus,
    RunRequest,
    RunStatusSensorContext,
    ScheduleDefinition,
    define_asset_job,
    multiprocess_executor,
    run_status_sensor,
)

from atlas_data import cadence
from atlas_data.assets import (
    api_v1,
    dbt,
    migrations,
    raw_brreg,
    raw_fhi,
    raw_other,
    raw_seeds,
    raw_ssb,
)
from atlas_data.assets.dbt import atlas_dbt_models

# All ingest sources are Norwegian public-sector data and the operators are in
# Norway; schedule times are stated in the timezone people will reason about
# them in, so "02:00" means 02:00 locally in both halves of the year.
TIMEZONE = "Europe/Oslo"


def _ingest_executor():
    """
    Bounds simultaneous steps inside a single run — of EVERY job, not just ingest.

    ⚠️ THE NAME UNDERSTATES THE SCOPE, and the name is mine. This is passed to
    `Definitions(executor=...)`, so it is the code location's global executor:
    `api_v1_checks`, `transform_checks`, `transform_and_publish` and the ingest
    asset job all run their steps through it. A platform operator retuning what
    reads as "ingest concurrency" changes the memory footprint of the checks jobs
    too. Renaming it is a breaking change to a declared env var, so the name
    stays and this paragraph exists instead.

    Without this, a 38-asset job opens as many concurrent Postgres writers as the
    run pod has CPUs — and every Atlas ingest writes to the *shared* instance that
    also carries PostgREST and Dagster's own run metadata. It also means 38
    simultaneous fetches against public-sector APIs, which is not how Atlas wants
    to treat SSB and FHI.

    Read from the environment so the platform can retune it without an Atlas
    rebuild — os.getenv with a default, never os.environ[...].
    """
    # 🔴 THIS NUMBER AND THE RUN POD'S MEMORY REQUEST ARE COUPLED, AND NOTHING
    # ENFORCES THE COUPLING.
    #
    # `multiprocess_executor` runs each step in its own SUBPROCESS, so the pod's
    # footprint is the parent plus up to `max_concurrent` STEPS at once —
    # additive, not shared, and each subprocess re-imports this code location.
    #
    # ⚠️ CORRECTED: an earlier version of this note said "four ingests at once".
    # It is four steps of ANY job, because this is the global executor (see the
    # docstring). That matters for the ceiling: `api_v1_checks` peaked at 887 MiB
    # (urb-agents #1013) — higher than the ingest job and higher than the 728-test
    # `transform_checks` — while its own queries are all `count(*)` and metadata
    # reads that hold nothing client-side. A job whose WORK is trivial peaking
    # highest is what a per-subprocess baseline looks like, not a per-query cost.
    #
    # 🔵 Hypothesis, not measurement: the driver is `max_concurrent` copies of the
    # interpreter plus dagster plus the dbt manifest, not anything the checks do.
    # Cheap test if anyone wants it: run `api_v1_checks` at max_concurrent=1 and
    # compare the peak. Ruled out locally already — the manifest is 2.9 MB and
    # +14 MiB parsed, `api_v1_generated.sql` is 40 KB, so neither is the 887.
    #
    # ⚠️ So that peak is a property of THIS SETTING, not of any one asset.
    # Raising this to 8 roughly doubles the concurrent half of the footprint and
    # silently invalidates whatever the pod was sized for; lowering it shrinks the
    # pod and lengthens the run.
    #
    # 🔵 Which also means a per-asset `dagster-k8s/config` override is the WRONG
    # lever for this peak. The pod is sized for the RUN, and the run is "up to
    # four of these at once". Sizing one asset does not bound a pod that may be
    # running four others beside it.
    #
    # 🔴 AND IT IS COUPLED TO RUN DURATION, WHICH IS COUPLED TO THE STACKING
    # HAZARD. This is the coupling that actually decides the setting.
    #
    # Measured (imac, urb-agents #1015): api_v1_checks at max_concurrent=1 peaked
    # at 372 MiB against 887 at 4 — the per-subprocess reading holds, roughly
    # 199 MiB parent plus ~172 MiB per additional concurrent step. ⚠️ But the same
    # run went 34.1 s -> 73.0 s. Halving memory roughly doubles duration.
    #
    # 🔴 `brreg_transform` runs every 30 minutes and was ~140 s; in the
    # low-concurrency window it was 247 s. A run that exceeds its interval does
    # not skip — it STACKS, and two runs then race on delete+insert against
    # dim_brreg_enhet. That is filed and unfixed:
    # website/docs/ai-developer/plans/backlog/INVESTIGATE-transform-run-stacking.md
    #
    # ⚠️ So lowering this to save memory spends margin against a known,
    # unfixed concurrency hazard to buy headroom that `1Gi` already provides.
    # The memory is covered; the margin is not replaceable.
    #
    # 🔵 RAISING it is the direction that needs the measurement, not lowering:
    # it shortens runs and widens the stacking margin, and invalidates the pod
    # sizing in the direction that OOMs rather than the direction that wastes.
    #
    # ⚠️ Whoever changes this must say what the run pod's memory request became.
    # The request lives in UIS, not here — which is exactly why the coupling is
    # easy to break: the two numbers are in different repositories owned by
    # different agents, and neither file mentions the other. This comment is the
    # only place they are named together.
    raw = os.getenv("ATLAS_MAX_CONCURRENT_INGESTS", "4")
    try:
        max_concurrent = max(1, int(raw))
    except ValueError:
        # A malformed value must not take the code location down at import.
        max_concurrent = 4
    return multiprocess_executor.configured({"max_concurrent": max_concurrent})

# ── Source groupings ─────────────────────────────────────────────────────────
#
# frr is deliberately absent. It reads atlas-private-data-repo/, which is not
# present on any public deployment, so a scheduled run would materialise zero
# rows on a timer forever — pure noise in the run history. It stays manual, and
# is run locally by whoever has the private data.

_ANNUAL_SOURCE_IDS = [
    *raw_ssb.SSB_SOURCES,
    *raw_ssb.SSB_CRIME_SOURCES,
    *raw_fhi.FHI_SOURCES,
    "bufdir-barnefattigdom",
]

_KLASS_SOURCE_IDS = list(raw_ssb.SSB_KLASS_SOURCES)


def _asset_selection(source_ids: list[str]) -> AssetSelection:
    """
    AssetSelection over raw/<source_id> keys, matching the factory's naming.

    Always includes the migrations asset. A scheduled refresh must be able to
    build its own database from nothing — the round-2 test hit exactly this,
    ingesting into a fresh cluster where raw.ingest_runs did not exist yet.
    Migrations are idempotent, so including them costs a no-op on every run.
    """
    return AssetSelection.assets(
        migrations.raw_migrations,
        *[["raw", sid.replace("-", "_")] for sid in source_ids],
    )


# ── Jobs ─────────────────────────────────────────────────────────────────────

annual_sources_job = define_asset_job(
    name="annual_sources_refresh",
    selection=_asset_selection(_ANNUAL_SOURCE_IDS),
    executor_def=_ingest_executor(),
    description=(
        "The 37 sources whose manifest declares periodicity P1Y. Polled weekly "
        "rather than annually: publication dates drift by weeks and nobody wants "
        "to discover a new release eleven months late. Weekly means a new "
        "release is picked up within 7 days for ~37 requests a week, which is "
        "nothing to SSB or FHI. The ingests upsert, so a poll that finds "
        "nothing new is a no-op."
    ),
)

klass_job = define_asset_job(
    name="klass_refresh",
    selection=_asset_selection(_KLASS_SOURCE_IDS),
    executor_def=_ingest_executor(),
    description=(
        "SSB Klass classifications (kommuner, fylker). Declared irregular; in "
        "practice they change at year boundaries when kommuner merge or split. "
        "Monthly is ample. These feed dim_kommune, which most marts join to, so "
        "they are kept on their own schedule rather than buried in the weekly "
        "wave — a bad Klass refresh is a wide blast radius and worth being able "
        "to point at."
    ),
)

seed_sources_job = define_asset_job(
    name="seed_sources_refresh",
    selection=_asset_selection(raw_seeds.SEED_SOURCES),
    executor_def=_ingest_executor(),
    description=(
        "Reference seeds — currently brreg-enheter, the Brønnøysund unit "
        "register that gives every NGO a stable orgnr. Monthly: a register of "
        "legal entities does not justify a weekly poll on Atlas's behalf.\n\n"
        "This job exists because these assets had an automation condition and "
        "belonged to no named job, so they ran on their cron and were invisible "
        "to anyone loading Atlas by hand. imac hit exactly that on urb-agents "
        "#507: running the three obvious jobs left brreg_enheter empty, "
        "ref_brreg_icnpo transforming an empty input, and "
        "raw_sources_were_refreshed_recently red. A source reachable only via "
        "__ASSET_JOB is a source nobody will think to run."
    ),
)

brreg_bootstrap_job = define_asset_job(
    name="brreg_bootstrap",
    selection=_asset_selection(raw_brreg.BRREG_BULK_SOURCES),
    executor_def=_ingest_executor(),
    description=(
        "The complete Enhetsregisteret — ~1.17M Norwegian organisations from "
        "Brreg's daily bulk file into raw.brreg_enheter_snapshot. Run this ONCE "
        "on a fresh install.\n\n"
        "It has no schedule and its asset has no automation condition, and that "
        "is the design rather than an omission: re-running a bulk load against a "
        "populated database is the one genuinely destructive operation in this "
        "pipeline, so nothing self-triggers it. The loader upserts and never "
        "truncates, so a re-run is safe — but 'safe if the code is correct' is "
        "not a reason to let a daemon do it unattended.\n\n"
        "Keeping the register current afterwards is the change feed's job "
        "(PLAN-002), which reads /oppdateringer/enheter and touches only what "
        "moved. A bulk file cannot express a deletion at all: absence from a "
        "1.17M-record file is indistinguishable from a truncated download.\n\n"
        "This job exists so the source is reachable by name. A source reachable "
        "only via __ASSET_JOB is a source nobody will think to run — that is the "
        "lesson from urb-agents #507, where running the three obvious jobs left "
        "brreg_enheter empty."
    ),
)

brreg_feed_job = define_asset_job(
    name="brreg_change_feed",
    selection=_asset_selection(raw_brreg.BRREG_DAILY_SOURCES),
    executor_def=_ingest_executor(),
    description=(
        "Brreg's change feed, walked forward daily from a durable watermark in "
        "raw.brreg_feed_watermark. ~3,300 changes a day.\n\n"
        "This is the only way deletions reach Atlas. A bulk file cannot express "
        "one — absence from a 1.17M-record file is indistinguishable from a "
        "truncated download — so Sletting and Fjernet arrive here or not at "
        "all.\n\n"
        "04:00 is deliberate: transform_and_publish runs at 05:00, so the day's "
        "register changes reach marts the same morning. Any later delays every "
        "change by a full day.\n\n"
        "Safe to automate, unlike the bootstrap it complements: it appends to "
        "raw.brreg_oppdateringer and raw.brreg_enheter_versions and never writes "
        "to the 1.17M-row snapshot, so a bug here cannot damage the expensive "
        "table. It also refuses to run without a watermark rather than starting "
        "at id 1, which would walk 16.4M historical changes.\n\n"
        "Frivillighetsregisteret rides along on the same schedule. It has no "
        "change feed and no bulk download of its own, so a full re-walk is the "
        "only option — ~727 requests, a few minutes, upserting. It supplies "
        "icnpoKategorier and nothing else does; NGO membership already comes "
        "from the Enhetsregister snapshot."
    ),
)

redcross_branches_job = define_asset_job(
    name="redcross_branches_refresh",
    selection=_asset_selection(["redcross-branches"]),
    executor_def=_ingest_executor(),
    description=(
        "Crawlee headless-browser scrape of Red Cross chapter pages. Weekly, on "
        "its own schedule and offset from the annual wave: it is the heaviest "
        "asset (~512MiB working set) and it is scraping someone else's website, "
        "so it should not be competing for the 4 run-pod slots with 37 API "
        "fetches."
    ),
)

# ── The transform split ──────────────────────────────────────────────────────
#
# transform_and_publish used to carry the dbt build, all the dbt checks and the
# api_v1 publish in one run: a 711-event plan, 90.5% of it checks. Dagster
# constructs that plan over gRPC BEFORE the run pod exists, and it did not finish
# inside start_timeout_seconds — the run died having created no pod, which is how
# integration criteria 10-12 stayed blocked for a round.
#
# Excluding the checks takes the build's plan from 711 to 67 (measured, not ~65). The checks then run
# as their own job, and MUST run after the publish: `dbt run` rebuilds
# marts.mart_* by swapping in new tables and dropping the old ones CASCADE, which
# destroys the dependent api_v1.* views. rowcount_matches_marts compares the two,
# so before the publish re-creates them it is comparing against nothing.
#
# Both selections are pattern-based — "the dbt assets", "their checks" — never
# enumerated lists, so a new source's models join automatically.
_TRANSFORM_ASSETS = AssetSelection.assets(atlas_dbt_models) | AssetSelection.assets(
    api_v1.api_v1_surface
)

transform_job = define_asset_job(
    name="transform_and_publish",
    selection=_TRANSFORM_ASSETS.without_checks(),
    description=(
        "dbt models + the api_v1 public surface, WITHOUT their checks — see the "
        "note above. Daily, even though the raw "
        "sources refresh weekly: this run is also Atlas's in-pipeline "
        "data-quality gate (813 dbt tests, 728 of them asset checks) and the step that "
        "republishes api_v1 and reloads PostgREST's schema cache. A daily green "
        "run is the signal that the public API is still serving what it should; "
        "waiting a week to find out is too long."
    ),
)

# The checks are split in two, and the reason is semantic rather than tactical.
#
# The api_v1 check is a PUBLISH GATE: "does the public API surface match the
# marts it wraps?" It answers a question about the thing external consumers see,
# it belongs immediately after the publish, and it is 3 events (measured; this
# line said "one event" until 2026-09-13).
#
# The dbt tests are DATA QUALITY: "is the data itself sound?" Different
# question, different audience, and — being hundreds of events — a materially different
# risk of hitting the same start-timeout that caused this split. Keeping them
# apart means a publish-gate failure is never hidden behind, or blocked by, the
# bulk test suite.
# ── The Brreg-only transform ─────────────────────────────────────────────────
#
# 🔴 THE PREREQUISITE, NOT THE OPTIMISATION (ops, urb-agents #766).
#
# Keeping the register current means rebuilding its dimension often. Doing that
# through `transform_and_publish` would rebuild the whole dbt project each time,
# and most of that project is SSB, FHI and Bufdir models that refresh weekly and
# monthly. Measured on asgard: the transform's three runs were 16 s, 117 s and
# 524 s.
#
# ⚠️ And the deciding number is duty cycle, not pod count — which is where my own
# analysis was wrong. Against a 524 s run:
#
#     */30    29% duty     fine
#     */15    58% duty     working more than half the time
#     */5    175% duty     🔴 cannot finish before the next tick — runs queue,
#                          the concurrency cap binds, and LAG GROWS
#
# ops's framing: "freshness is bounded by how long the work takes, not by how
# often you ask for it." A cadence that outruns the work makes the API staler,
# not fresher. Splitting the job does not merely remove waste — it moves that
# table in our favour, which is why both tor-agent and ops made this job a
# condition of raising the cron at all.
#
# 🔴 WHY api_v1 IS NOT IN THIS SELECTION, AND WHEN THAT STOPS BEING TRUE.
#
# marts.mart_brreg_enhet is a VIEW over marts.dim_brreg_enhet, and api_v1's
# wrapper is a view over that — so refreshing the dimension is visible through
# the public API immediately, with no publish step. Including api_v1 here would
# re-apply all 14 wrapper views and reload PostgREST's schema cache every half
# hour for no gain.
#
# ⚠️ The day any model between the dimension and the API becomes a TABLE, that
# stops being true and this job must gain the publish. Nothing enforces it, so
# it is written here and beside the materialisation in mart_brreg_enhet.sql.
#
# The check chain is safe: run_api_v1_checks_after_transform is scoped with
# monitored_jobs=[transform_job], so this job does not drag the 784-test suite
# along behind it every cycle. Verified before adding the job, not after.
brreg_transform_job = define_asset_job(
    name="brreg_transform",
    selection=AssetSelection.assets(*dbt.dbt_model_asset_keys("dim_brreg_enhet")),
    description=(
        "Reconciles the Brreg register into marts.dim_brreg_enhet and nothing "
        "else — the incremental rebuild of one model, plus its deletion check.\n\n"
        "Exists so the register can track a feed that changes 3.8 times a minute "
        "without rebuilding SSB, FHI and Bufdir models that change once a year. "
        "Both tor-agent and ops made it a precondition of raising the Brreg cron "
        "(urb-agents #766); ops: raising the cron without it 'buys freshness at "
        "1.57 h/day of pure waste — and it would work, which is what makes it "
        "tempting'.\n\n"
        "Checks are deliberately INCLUDED here, unlike transform_and_publish. "
        "That job excludes them because 784 tests made its gRPC plan too large to "
        "construct inside the start timeout; this selection is one model and one "
        "check, and that check is the guard on the exact thing this job does — "
        "tombstoned organisations leaving the dimension."
    ),
)

# 🔴 HOW TO COUNT THIS, AND IN WHICH UNIT — because the question has four
# plausible answers and the most authoritative-looking one is the most wrong
# (urb-agents #817, #842).
#
#   1     GraphQL executionPlanOrError        ops in the plan
#   675   ASSET_CHECK_EVALUATION_PLANNED      asset checks planned   <- the unit 711 is in
#   728   dbt tests with one parent           repo tests
#   813   dbt tests                           repo assertions
#
# ⚠️ GraphQL's `executionPlanOrError` returns **1**: the dbt tests all execute
# inside a single op, so the API literally named "execution plan" collapses the
# thing 711 counts. It would be a confidently delivered wrong answer.
#
# ⚠️ And 728 is an upper bound, not the plan size — it overcounts by 53. A repo
# count of tests is not a count of planned checks; only the run knows which are
# selected and materialised.
#
# ✅ THE FREE, CORRECT METHOD: read `ASSET_CHECK_EVALUATION_PLANNED` from a run
# that has ALREADY COMPLETED — the plan declaring what it contained, rather than
# a construction that collapses it. No launch, no risk, about four minutes.
#
# The repo-side number is still worth having as a leading indicator, since it
# moves the moment a test is added rather than at the next run:
#
#   python3 -c "import json;n=json.load(open('../dbt/target/manifest.json'))['nodes'];
#   t=[x for x in n.values() if x['resource_type']=='test'];
#   print(len(t), sum(1 for x in t if len(x['depends_on']['nodes'])==1))"
#
# 🔴 Treat this as a MONITOR, not as hygiene on a stale figure. The margin to 711
# is 36 and shrinking: the comment said 644 while the plan was 675, so thirty-one
# checks arrived without anyone noticing.
#
# ⚠️ `_API_V1_CHECKS` selects checks on the api_v1_surface asset, which is NOT a
# dbt asset — so the dbt checks all land in transform_checks and the subtraction
# below removes a different population rather than a slice of the 675.
# 🔴 THE REMEDY HAD NO WAY TO BE RUN. `operational.troubleshooting` tells an
# operator to "materialise the api_v1 asset — it needs no dbt build, so it is far
# cheaper than transform_and_publish and is the whole of what an upgrade needs",
# and imac found that sentence unreachable from a host (urb-agents #947):
#
#     uis dagster run api_v1  ->  No job named 'api_v1'
#
# ⚠️ `uis dagster run` takes JOBS. The asset existed, the advice was right, and the
# only thing an operator could actually launch was `transform_and_publish` — the
# expensive option the advice steers them away from.
#
# 🔵 That is imac's H2 one layer out: a remedy an operator cannot reach from where
# they are. The fix is not more documentation, it is a job with a name.
#
# ⚠️ Deliberately NOT scheduled. It exists to be run by hand after an upgrade, or
# after a failed transform leaves api_v1 views missing. The scheduled path already
# publishes as part of transform_and_publish.
api_v1_publish_job = define_asset_job(
    name="publish_api_v1",
    selection=AssetSelection.assets(api_v1.api_v1_surface),
    description=(
        "Re-create the api_v1 views, re-apply their column COMMENTs and reload "
        "PostgREST's schema cache. No dbt build: this is the cheap half of a "
        "publish, and the whole of what an upgrade needs when only the served "
        "documentation has changed. Measured at 38.7 s against "
        "transform_and_publish's 184.7 s."
    ),
)

_API_V1_CHECKS = AssetSelection.checks_for_assets(api_v1.api_v1_surface)

api_v1_checks_job = define_asset_job(
    name="api_v1_checks",
    selection=_API_V1_CHECKS,
    description=(
        "The api_v1 publish gate — does the published surface match the marts it "
        "wraps. Runs immediately after the publish, on its own, because it is the "
        "check that says whether the public API is serving what it should."
    ),
)

transform_checks_job = define_asset_job(
    name="transform_checks",
    selection=AssetSelection.all_asset_checks() - _API_V1_CHECKS,
    description=(
        "The dbt data-quality suite — every dbt test as a Dagster asset check. "
        "Split out of transform_and_publish because the checks were 90.5% of a "
        "711-event plan the run pod could not start. 🔴 THE SPLIT IS LOAD-BEARING "
        "TODAY, not a past tidy-up: measured on 2026-09-13, this job plans 675 "
        "asset checks, transform_and_publish 67 and api_v1_checks 3 — so "
        "recombining them gives 742, past the 711 that produced the original "
        "failure. It is the only reason the job starts. This line said '~644 "
        "events' and read as 67 events of headroom; the real margin is 36 and has "
        "been shrinking since the sentence was written. Bounding it durably is "
        "the subject of INVESTIGATE-transform-job-decomposition. Triggered by the "
        "build succeeding rather than by a clock, since a fixed offset would "
        "encode a guess about how long the build takes."
    ),
)


@run_status_sensor(
    run_status=DagsterRunStatus.SUCCESS,
    monitored_jobs=[transform_job],
    request_job=api_v1_checks_job,
    name="run_api_v1_checks_after_transform",
    description=(
        "Runs the publish gate once the build and api_v1 publish have succeeded. "
        "The ordering is load-bearing, not cosmetic: `dbt run` drops the api_v1 "
        "views by CASCADE when it swaps the marts tables, so they only exist "
        "again after the publish. Run the check before that and it compares "
        "against views that are not there."
    ),
)
def run_api_v1_checks_after_transform(context: RunStatusSensorContext):
    return RunRequest(run_key=None)


@run_status_sensor(
    run_status=DagsterRunStatus.SUCCESS,
    monitored_jobs=[api_v1_checks_job],
    request_job=transform_checks_job,
    name="run_dbt_checks_after_api_v1",
    description=(
        "Runs the dbt data-quality suite after the publish gate has passed. "
        "Chained rather than parallel so the cheap, high-signal check reports "
        "first — if the public surface is wrong, that should not be waiting "
        "behind 644 dbt tests."
    ),
)
def run_dbt_checks_after_api_v1(context: RunStatusSensorContext):
    return RunRequest(run_key=None)


# ── Schedules ────────────────────────────────────────────────────────────────
#
# Times are staggered so the waves do not collide under the platform's 4-slot
# cap: sources land first, the transform runs afterwards with room to spare.

transform_schedule = ScheduleDefinition(
    name="transform_daily",
    job=transform_job,
    cron_schedule="0 5 * * *",  # 05:00 daily — after Sunday's ingest window
    execution_timezone=TIMEZONE,
)

# ── What happened to the ingest schedules ────────────────────────────────────
#
# annual_sources_weekly / klass_monthly / redcross_branches_weekly are gone.
# Their cadence now lives on the assets themselves as automation conditions
# (see cadence.py), which is what makes "adding a source touches zero job
# definitions" structural instead of a convention — there is no membership list
# left to forget to edit.
#
# The JOBS are deliberately kept. They are no longer triggered by a clock, but
# they remain the way a human or the integration tester runs a family on demand
# ("materialise klass_refresh"), and they are the fallback if declarative
# automation misbehaves. A job nobody schedules costs nothing; losing the
# ability to run one by hand costs a debugging session.
#
# transform_daily stays a schedule: the transform side was not part of this
# migration.
brreg_transform_schedule = ScheduleDefinition(
    name="brreg_transform_half_hourly",
    job=brreg_transform_job,
    cron_schedule=cadence.BRREG_TRANSFORM_CRON,
    execution_timezone=cadence.TIMEZONE,
    description=(
        "Reconciles the register into marts.dim_brreg_enhet, ten minutes after "
        "each feed poll. The offset is load-bearing: firing alongside the feed "
        "would reconcile data the feed had not written yet, every cycle, leaving "
        "the dimension permanently one cycle behind a feed that is current."
    ),
)

schedules = [
    transform_schedule,
    brreg_transform_schedule,
]

jobs = [
    annual_sources_job,
    klass_job,
    seed_sources_job,
    brreg_bootstrap_job,
    brreg_feed_job,
    brreg_transform_job,
    redcross_branches_job,
    transform_job,
    api_v1_checks_job,
    api_v1_publish_job,
    transform_checks_job,
]

sensors = [run_api_v1_checks_after_transform, run_dbt_checks_after_api_v1]
