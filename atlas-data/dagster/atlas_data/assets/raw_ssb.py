"""
@asset wrappers for SSB-based ingest sources (PxWeb, KLASS, crime tables).

See _factory.make_raw_ingest_asset for the underlying pattern. Each source's
TypeScript module (`atlas-data/ingest/src/sources/<source_id>/index.ts`)
already calls `recordIngestRun()` which centralises the Pipes integration —
this module just exposes one @asset per source for Dagster to schedule and
materialise.
"""

from datetime import timedelta

from dagster import AutomationCondition, FreshnessPolicy

from atlas_data.assets._factory import make_raw_ingest_assets

# SSB PxWeb sources — annual or near-annual cadence. New ones added by:
# 1. Add to atlas-data/ingest/src/sources/ssb-<id>/index.ts + manifest.yml.
# 2. Add the source-id to this list.
# 3. UIS Helm `helm upgrade` to roll the code-location pod (in production).
SSB_SOURCES = [
    "ssb-06083",
    "ssb-06913",
    "ssb-06944",
    "ssb-06947",
    "ssb-07459",
    "ssb-08764",
    "ssb-09429",
    "ssb-10826",
    "ssb-12063",
    "ssb-12131",
    "ssb-12132",
    "ssb-12292",
    "ssb-12944",
    "ssb-13995",
]

# KLASS reference tables — code-list ingest from SSB's KLASS endpoints.
SSB_KLASS_SOURCES = [
    "ssb-klass-fylker",
    "ssb-klass-kommuner",
]

# SSB crime tables — single ingest script that writes multiple raw.* tables
# (raw.ssb_08484, raw.ssb_08487, raw.ssb_09405). One @asset represents the
# ingest run; splitting into per-table @assets is future work.
SSB_CRIME_SOURCES = [
    "ssb-crime-tables",
]

assets = (
    make_raw_ingest_assets(SSB_SOURCES, group_name="raw_ssb")
    # ── Declarative-automation pilot (2026-08-24) ────────────────────────────
    # The Klass family is the pilot slice for the idiomatic Dagster shape. It
    # declares its own cadence here, on the asset, instead of being enumerated
    # into a job in schedules.py. Same monthly cadence, expressed where the
    # source is defined — which is what makes "adding a source touches zero job
    # definitions" structural rather than a convention people have to remember.
    #
    # klass_monthly still exists and still selects these assets. Both ship
    # STOPPED; enable one or the other, never both, or the source is fetched
    # twice. The comparison is the point of the pilot.
    + make_raw_ingest_assets(
        SSB_KLASS_SOURCES,
        group_name="raw_ssb_klass",
        automation_condition=AutomationCondition.on_cron("0 1 1 * *", "Europe/Oslo"),
        # What "fresh" means for this source, declared where the source is.
        # WARN at 45 days (a monthly cadence may miss one cycle), FAIL at 90
        # (by then something is actually wrong). Deliberately not tight: a
        # check that cries wolf is a check people learn to ignore.
        freshness_policy=FreshnessPolicy.time_window(
            fail_window=timedelta(days=90),
            warn_window=timedelta(days=45),
        ),
    )
    + make_raw_ingest_assets(SSB_CRIME_SOURCES, group_name="raw_ssb_crime")
)
