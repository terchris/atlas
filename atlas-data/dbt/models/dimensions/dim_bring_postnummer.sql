{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['postnummer'], 'unique': True},
      {'columns': ['kommune_nr']}
    ]
  )
}}

-- dim_bring_postnummer — Posten Bring's postcode register, typed, including
-- kategori. urb-agents #2098/#2099 (R2). Sibling to seeds/dim_postnummer.csv
-- (same upstream, no kategori, no visible refresh date) — see
-- atlas-data/migrations/075_raw_bring_postnummer.sql for why both exist
-- rather than one replacing the other.
--
-- Unlike FHI's GEO dimension, Bring's own kommune_nr is already a clean
-- 4-digit code with no bydel/fylke/national mixed in — no
-- classify_region_code dance needed here, just a relationship test.

select
  postnummer,
  poststed,
  kommune_nr,
  kommune_navn,
  kategori,
  loaded_at
from {{ source('raw', 'bring_postnummer') }}
