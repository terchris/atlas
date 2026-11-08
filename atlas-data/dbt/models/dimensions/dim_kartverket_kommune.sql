{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['kommune_nr'], 'unique': True}
    ]
  )
}}

-- dim_kartverket_kommune — Kartverket's current municipality boundaries,
-- typed, with a simplified geometry alongside the full one. urb-agents
-- #2098/#2099 (R4).
--
-- SIMPLIFICATION METHOD — same reasoning as dim_kartverket_postnummeromrade
-- (R3): ST_SimplifyPreserveTopology's tolerance is in the geometry's own
-- units, degrees for EPSG:4258, not metres. Reproject to EPSG:25833 (metres)
-- before simplifying at 50m (atlas-scraper's own stated tolerance), then
-- reproject back to 4258 for publication. Same uncharacterised distortion
-- caveat outside UTM zone 33 applies here too.
--
-- No union needed here, unlike postnummeromrade — this table is already one
-- row per kommune; the geometry is simplified directly, not aggregated
-- first.

select
  kommune_nr,
  kommune_navn,
  names,
  gyldig_fra,
  gyldig_til,
  geometry as geometry_full,
  ST_Transform(
    ST_SimplifyPreserveTopology(
      ST_Transform(geometry, 25833),
      50
    ),
    4258
  ) as geometry_simplified
from {{ source('raw', 'kartverket_kommune') }}
