-- supply__frr_resource_phone.sql
--
-- Phone numbers per FRR resource — one row per (resource_id, telefonnummer).
-- PII redaction in place per docs/stack/private-marts-shapes.md "Redaction
-- conventions": kategori = 'privat' rows have telefonnummer replaced with a
-- hashed sentinel (PK uniqueness preserved, original irrecoverable),
-- is_redacted = true. Other categories pass through.

{{ config(materialized='view', schema='private_marts', tags=['private']) }}

select
  src.id                                       as resource_id,
  tel->>'retningsnummer'                       as retningsnummer,
  case
    when tel->>'kategori' = 'privat'
    then 'ANONYMISERT-' || left(encode(sha256((tel->>'telefonnummer')::bytea), 'hex'), 12)
    else tel->>'telefonnummer'
  end                                          as telefonnummer,
  tel->>'beskrivelse'                          as beskrivelse,
  tel->>'kategori'                             as kategori,
  (tel->>'erUtalarmeringsnummer')::boolean     as er_utalarmeringsnummer,
  (tel->>'kategori' = 'privat')                as is_redacted,
  src.loaded_at
from {{ source('private_raw', 'frr_resources') }} src,
     jsonb_array_elements(src.raw_payload->'telefonnumre') as tel
where (tel->>'telefonnummer') is not null
