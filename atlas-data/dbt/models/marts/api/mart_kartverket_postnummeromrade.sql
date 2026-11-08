{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_kartverket_postnummeromrade — Kartverket's postcode-area polygons,
-- full and simplified, published as GeoJSON. urb-agents #2098/#2099 (R3).
--
-- geometry and geometry_simplified are PostgREST-served as GeoJSON text via
-- ST_AsGeoJSON — PostgREST has no useful way to serve a raw PostGIS
-- `geometry` binary value over HTTP; a client wants GeoJSON, not WKB.
--
-- VIEW, not table — a straight projection of marts.dim_kartverket_postnummeromrade,
-- which already carries the computed union/simplification. ~3,382 rows;
-- materializing would be a second copy of the same polygons for no
-- computation saved — the expensive work (ST_Union, ST_SimplifyPreserveTopology)
-- already happened once, in the dimension.

select
  postnummer,
  poststed,
  kommune_nr,
  oppdateringsdato,
  ST_AsGeoJSON(geometry_full)::json as geometry,
  ST_AsGeoJSON(geometry_simplified)::json as geometry_simplified
from {{ ref('dim_kartverket_postnummeromrade') }}
