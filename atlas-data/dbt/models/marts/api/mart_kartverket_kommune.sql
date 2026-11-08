{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_kartverket_kommune — Kartverket's current municipality boundaries,
-- full and simplified, as GeoJSON. urb-agents #2098/#2099 (R4).
--
-- Same api_v1-vs-bulk-boundary reasoning as mart_kartverket_postnummeromrade
-- (R3) — see generate_api_v1.py's root document REFERENCE section. 357
-- point-lookupable rows, not a bulk national file.
--
-- names is published as-is (jsonb array of {navn, rekkefolge, sprak}) rather
-- than flattened — PostgREST serves jsonb natively and a consumer wanting
-- "the Norwegian name" or "the Sami name" filters the array client-side;
-- flattening here would have to invent a column per language that may not
-- exist for most kommuner.

select
  kommune_nr,
  kommune_navn,
  names,
  gyldig_fra,
  gyldig_til,
  ST_AsGeoJSON(geometry_full)::json as geometry,
  ST_AsGeoJSON(geometry_simplified)::json as geometry_simplified
from {{ ref('dim_kartverket_kommune') }}
