"""
@asset wrappers for ingest sources that don't fit the SSB/FHI families.

See _factory.make_raw_ingest_asset. Currently:

- bufdir-barnefattigdom: zip download from Bufdir's child poverty surface.
- redcross-branches: Crawlee-based scraper of Red Cross chapter pages.
  Heavier resource profile (per UIS Dagster INVESTIGATE — headless browser
  state, ~512MiB working set). Per-asset resource override via
  `dagster-k8s/config` tag is future work, after the first materialisation
  in production reveals what's actually needed.
"""

from atlas_data.assets._factory import make_raw_ingest_assets

OTHER_SOURCES = [
    "bufdir-barnefattigdom",
    "redcross-branches",
]

assets = make_raw_ingest_assets(OTHER_SOURCES, group_name="raw_other")
