-- supply__frr_resource_status.sql
--
-- Status history per FRR resource — one row per (resource_id, start_tidspunkt).
-- Current status is denormalised on supply__frr_resources; this is the
-- full history.

{{ config(materialized='view', schema='private_marts', tags=['private']) }}

select
  src.id                                  as resource_id,
  (st->>'startTidspunkt')::timestamptz    as start_tidspunkt,
  st->>'statuskode'                       as statuskode,
  st->>'statuskommentar'                  as statuskommentar,
  src.loaded_at
from {{ source('private_raw', 'frr_resources') }} src,
     jsonb_array_elements(src.raw_payload->'status') as st
where (st->>'startTidspunkt') is not null
