{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_kartverket_fylke — Kartverket's current county boundaries, full and
-- simplified, as GeoJSON. urb-agents #2098/#2099 (R4). Sibling to
-- mart_kartverket_kommune — see that mart's own header for the names-array
-- and api_v1-vs-bulk-boundary reasoning. 15 rows.

select
  fylke_nr,
  fylke_navn,
  names,
  gyldig_fra,
  gyldig_til,
  ST_AsGeoJSON(geometry_full)::json as geometry,
  ST_AsGeoJSON(geometry_simplified)::json as geometry_simplified
from {{ ref('dim_kartverket_fylke') }}
