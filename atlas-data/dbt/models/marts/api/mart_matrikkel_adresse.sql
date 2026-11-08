{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_matrikkel_adresse — Kartverket's national address file, published.
-- urb-agents #2098/#2099 (R5).
--
-- VIEW, not table — a straight projection of marts.dim_kartverket_matrikkel_adresse,
-- which already carries the computed geometry and parsed timestamp. No
-- further computation here, matching mart_kartverket_postnummeromrade's own
-- reasoning (R3).
--
-- geometry is PostgREST-served as GeoJSON text via ST_AsGeoJSON, same as
-- every other geometry-carrying mart in this repo — PostgREST has no useful
-- way to serve a raw PostGIS `geometry` binary value over HTTP.
select
  adresse_id,
  kommune_nr,
  adressetype,
  adressenavn,
  nummer,
  bokstav,
  gardsnummer,
  bruksnummer,
  postnummer,
  poststed,
  ST_AsGeoJSON(geometry)::json as point,
  oppdateringsdato
from {{ ref('dim_kartverket_matrikkel_adresse') }}
