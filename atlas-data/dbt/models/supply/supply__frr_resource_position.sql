-- supply__frr_resource_position.sql
--
-- Position history per FRR resource — one row per (resource_id, position_at).
-- Current position is denormalised on supply__frr_resources; this is the
-- full history.

{{ config(materialized='view', schema='private_marts', tags=['private']) }}

select
  src.id                                          as resource_id,
  (pos->>'oppdatertTidspunkt')::timestamptz       as position_at,
  pos->'område'->>'fylkesnavn'                    as fylke_navn,
  pos->'område'->>'kommunenavn'                   as kommune_navn,
  k.kommune_nr,
  pos->'område'->>'politidistriktnavn'            as politidistrikt,
  (pos->'posisjon'->>'breddegrad')::float         as lat,
  (pos->'posisjon'->>'lengdegrad')::float         as lon,
  pos->>'kilde'                                   as kilde,
  src.loaded_at
from {{ source('private_raw', 'frr_resources') }} src,
     jsonb_array_elements(src.raw_payload->'posisjoner') as pos
-- Filter to active kommuner — historical pre-2020 names duplicate.
left join {{ ref('dim_kommune') }} k
  on k.kommune_name = pos->'område'->>'kommunenavn' and k.is_active
where (pos->>'oppdatertTidspunkt') is not null
