"""
@asset wrappers for ingest sources that don't fit the SSB/FHI families.

See _factory.make_raw_ingest_asset. Currently:

- bufdir-barnefattigdom: zip download from Bufdir's child poverty surface.
- redcross-branches: Crawlee-based scraper of Red Cross chapter pages.
  Heavier resource profile (per UIS Dagster INVESTIGATE — headless browser
  state, ~512MiB working set).

  ⚠️ This used to say a per-asset `dagster-k8s/config` override was "future
  work, after the first materialisation in production reveals what's actually
  needed". The materialisations have happened (imac, urb-agents #1011) and they
  revealed that the override is the wrong instrument: the ingest run pod peaked
  at 590 MiB and 551 MiB, and that figure belongs to `ATLAS_MAX_CONCURRENT_INGESTS`
  — up to four ingests in their own subprocesses at once — rather than to any
  single asset. See the note on `_ingest_executor` in schedules.py.

  🔵 A per-asset override would still be the right tool for an asset that is an
  outlier ON ITS OWN. This one is not measured to be: `redcross-branches` is in
  UNSCHEDULED_SOURCES and did not run in any of those samples, so its ~512MiB is
  still an estimate from the investigation and not an observation.
"""

from atlas_data.assets._factory import make_raw_ingest_assets
from atlas_data import cadence

OTHER_SOURCES = [
    "bufdir-barnefattigdom",
    "redcross-branches",
]

# redcross-branches is absent from the scheduled list on purpose — it has no
# cadence and no freshness policy. See cadence.UNSCHEDULED_SOURCES for why.
assets = [
    *make_raw_ingest_assets(
        ["bufdir-barnefattigdom"],
        group_name="raw_other",
        automation_condition=cadence.weekly_polled(),
        freshness_policy=cadence.WEEKLY_FRESHNESS,
    ),
    # No condition, no freshness policy: redcross-branches is parked pending
    # its credential. It may not self-trigger and stays runnable by hand.
    # See cadence.UNSCHEDULED_SOURCES.
    *make_raw_ingest_assets(
        sorted(cadence.UNSCHEDULED_SOURCES),
        group_name="raw_other",
    ),
]
