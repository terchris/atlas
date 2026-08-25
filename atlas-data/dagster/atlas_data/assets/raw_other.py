"""
@asset wrappers for ingest sources that don't fit the SSB/FHI families.

See _factory.make_raw_ingest_asset. Currently:

- bufdir-barnefattigdom: zip download from Bufdir's child poverty surface.
- redcross-branches: Crawlee-based scraper of Red Cross chapter pages.
  Heavier resource profile (per UIS Dagster INVESTIGATE — headless browser
  state, ~512MiB working set). Per-asset resource override via
  `dagster-k8s/config` tag is future work, after the first materialisation
  in production reveals what's actually needed.
- frr: Felles Ressursregister, read from the gitignored
  atlas-private-data-repo/. That directory is deliberately NOT in the
  polyglot image, so **on a public deployment this asset materialises zero
  rows and that is correct, not a bug** — see
  dbt/models/private_marts/sources.yml for the contract ("on public
  deployments the table exists but is empty"). No private NGO data reaches
  the shared cluster. The ingest guards the missing directory and logs
  `frr.private_data_root_absent` so an empty run is distinguishable from a
  mounted-but-empty one.
"""

from atlas_data.assets._factory import make_raw_ingest_assets
from atlas_data import cadence

OTHER_SOURCES = [
    "bufdir-barnefattigdom",
    "frr",
    "redcross-branches",
]

# frr is absent from these lists on purpose — it has no cadence and no freshness
# policy. See cadence.UNSCHEDULED_SOURCES for why.
assets = [
    *make_raw_ingest_assets(
        ["bufdir-barnefattigdom"],
        group_name="raw_other",
        automation_condition=cadence.weekly_polled(),
        freshness_policy=cadence.WEEKLY_FRESHNESS,
    ),
    # No condition, no freshness policy: frr (private by design) and
    # redcross-branches (parked pending its credential). Neither may
    # self-trigger; both stay runnable by hand. See cadence.UNSCHEDULED_SOURCES
    # for why the two omissions are different omissions.
    *make_raw_ingest_assets(
        sorted(cadence.UNSCHEDULED_SOURCES),
        group_name="raw_other",
    ),
]
