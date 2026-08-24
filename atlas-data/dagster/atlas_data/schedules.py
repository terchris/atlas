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

from atlas_data.assets import api_v1, migrations, raw_fhi, raw_other, raw_ssb
from atlas_data.assets.dbt import atlas_dbt_models

# All ingest sources are Norwegian public-sector data and the operators are in
# Norway; schedule times are stated in the timezone people will reason about
# them in, so "02:00" means 02:00 locally in both halves of the year.
TIMEZONE = "Europe/Oslo"


def _ingest_executor():
    """
    Bounds simultaneous ingest steps inside a single run.

    Without this, a 38-asset job opens as many concurrent Postgres writers as the
    run pod has CPUs — and every Atlas ingest writes to the *shared* instance that
    also carries PostgREST and Dagster's own run metadata. It also means 38
    simultaneous fetches against public-sector APIs, which is not how Atlas wants
    to treat SSB and FHI.

    Read from the environment so the platform can retune it without an Atlas
    rebuild — os.getenv with a default, never os.environ[...].
    """
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
# transform_and_publish used to carry the dbt build, all 644 dbt checks and the
# api_v1 publish in one run: a 711-event plan, 90.5% of it checks. Dagster
# constructs that plan over gRPC BEFORE the run pod exists, and it did not finish
# inside start_timeout_seconds — the run died having created no pod, which is how
# integration criteria 10-12 stayed blocked for a round.
#
# Excluding the checks takes the build's plan from 711 to ~65. The checks then run
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
        "data-quality gate (644 dbt tests as asset checks) and the step that "
        "republishes api_v1 and reloads PostgREST's schema cache. A daily green "
        "run is the signal that the public API is still serving what it should; "
        "waiting a week to find out is too long."
    ),
)

# The checks are split in two, and the reason is semantic rather than tactical.
#
# The api_v1 check is a PUBLISH GATE: "does the public API surface match the
# marts it wraps?" It answers a question about the thing external consumers see,
# it belongs immediately after the publish, and it is one event.
#
# The 644 dbt tests are DATA QUALITY: "is the data itself sound?" Different
# question, different audience, and — being 644 events — a materially different
# risk of hitting the same start-timeout that caused this split. Keeping them
# apart means a publish-gate failure is never hidden behind, or blocked by, the
# bulk test suite.
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
        "711-event plan the run pod could not start. ⚠️ This job is still ~644 "
        "events and carries the same startability risk; bounding it durably is "
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

annual_sources_schedule = ScheduleDefinition(
    name="annual_sources_weekly",
    job=annual_sources_job,
    cron_schedule="0 2 * * 0",  # Sunday 02:00
    execution_timezone=TIMEZONE,
)

klass_schedule = ScheduleDefinition(
    name="klass_monthly",
    job=klass_job,
    cron_schedule="0 1 1 * *",  # 1st of the month, 01:00 — before the weekly wave
    execution_timezone=TIMEZONE,
)

redcross_branches_schedule = ScheduleDefinition(
    name="redcross_branches_weekly",
    job=redcross_branches_job,
    cron_schedule="30 3 * * 0",  # Sunday 03:30 — after the annual wave has drained
    execution_timezone=TIMEZONE,
)

transform_schedule = ScheduleDefinition(
    name="transform_daily",
    job=transform_job,
    cron_schedule="0 5 * * *",  # 05:00 daily — after Sunday's ingest window
    execution_timezone=TIMEZONE,
)

schedules = [
    annual_sources_schedule,
    klass_schedule,
    redcross_branches_schedule,
    transform_schedule,
]

jobs = [
    annual_sources_job,
    klass_job,
    redcross_branches_job,
    transform_job,
    api_v1_checks_job,
    transform_checks_job,
]

sensors = [run_api_v1_checks_after_transform, run_dbt_checks_after_api_v1]
