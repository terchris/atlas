"""
Schedules for the Atlas pipeline.

Cadence is derived from what the upstreams actually publish, not from a blanket
nightly. Every source declares a `periodicity` in its manifest.yml, and across
Atlas's 41 sources that is: 37 × P1Y (annual) and 4 × irregular. Fetching an
annual SSB or FHI table every night would be ~15,000 pointless requests a year
against public-sector APIs Atlas depends on staying welcome at.

⚠️ NO in-code concurrency limits here, deliberately.

The run-pod concurrency cap is **4**, and it lives in the UIS Helm chart values,
not in this file. Per the UIS maintainer's verdict on Atlas's requirement doc:
capacity policy for a shared Postgres — which PostgREST, Atlas and Dagster's own
metadata all sit on — should not live inside one tenant, because then the
platform cannot change it without an Atlas rebuild. If you are about to add a
`max_concurrent_runs` or a job-level limit here, that is the reason not to.

Schedules ship **stopped** (Dagster's default). Turning them on in production is
a go-live decision for Terje, not a side effect of deploying the code location.
"""

from dagster import (
    AssetSelection,
    ScheduleDefinition,
    define_asset_job,
)

from atlas_data.assets import api_v1, raw_fhi, raw_other, raw_ssb
from atlas_data.assets.dbt import atlas_dbt_models

# All ingest sources are Norwegian public-sector data and the operators are in
# Norway; schedule times are stated in the timezone people will reason about
# them in, so "02:00" means 02:00 locally in both halves of the year.
TIMEZONE = "Europe/Oslo"

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
    """AssetSelection over raw/<source_id> keys, matching the factory's naming."""
    return AssetSelection.assets(
        *[["raw", sid.replace("-", "_")] for sid in source_ids]
    )


# ── Jobs ─────────────────────────────────────────────────────────────────────

annual_sources_job = define_asset_job(
    name="annual_sources_refresh",
    selection=_asset_selection(_ANNUAL_SOURCE_IDS),
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
    description=(
        "Crawlee headless-browser scrape of Red Cross chapter pages. Weekly, on "
        "its own schedule and offset from the annual wave: it is the heaviest "
        "asset (~512MiB working set) and it is scraping someone else's website, "
        "so it should not be competing for the 4 run-pod slots with 37 API "
        "fetches."
    ),
)

transform_job = define_asset_job(
    name="transform_and_publish",
    selection=(
        AssetSelection.assets(atlas_dbt_models)
        | AssetSelection.assets(api_v1.api_v1_surface)
    ),
    description=(
        "dbt models + the api_v1 public surface. Daily, even though the raw "
        "sources refresh weekly: this run is also Atlas's in-pipeline "
        "data-quality gate (644 dbt tests as asset checks) and the step that "
        "republishes api_v1 and reloads PostgREST's schema cache. A daily green "
        "run is the signal that the public API is still serving what it should; "
        "waiting a week to find out is too long."
    ),
)

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
]
