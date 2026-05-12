"""
@asset wrappers for FHI (Folkehelseinstituttet) ingest sources.

See _factory.make_raw_ingest_asset. FHI's public-health indicators come
from a mix of dashboards, PxWeb-like endpoints, and scraped tables. Cadence
varies by indicator (some annual, some quarterly, some sporadic).
"""

from atlas_data.assets._factory import make_raw_ingest_assets

FHI_SOURCES = [
    "fhi-alkohol",
    "fhi-befolkning",
    "fhi-befolkningsvekst",
    "fhi-bor-alene",
    "fhi-depresjon",
    "fhi-fortrolig-venn",
    "fhi-hasj",
    "fhi-innvandrere",
    "fhi-innvkat",
    "fhi-kpr-1aar",
    "fhi-livskvalitet",
    "fhi-mediebruk-some",
    "fhi-mediebruk-spill",
    "fhi-mediebruk-underhold",
    "fhi-mobbing",
    "fhi-neet",
    "fhi-prognose",
    "fhi-selvmord",
    "fhi-smertestillende",
    "fhi-trangbodd",
    "fhi-vgs-gjennomforing",
]

assets = make_raw_ingest_assets(FHI_SOURCES, group_name="raw_fhi")
