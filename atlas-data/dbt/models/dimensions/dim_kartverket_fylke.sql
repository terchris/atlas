{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['fylke_nr'], 'unique': True}
    ]
  )
}}

-- dim_kartverket_fylke — Kartverket's current county boundaries, typed,
-- with a simplified geometry alongside the full one. urb-agents #2098/#2099
-- (R4). Sibling to dim_kartverket_kommune — see that model's own header for
-- the simplification method.

select
  fylke_nr,
  fylke_navn,
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
from {{ source('raw', 'kartverket_fylke') }}
