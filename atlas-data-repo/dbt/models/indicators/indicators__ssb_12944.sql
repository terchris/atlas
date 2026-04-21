{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 12944.
-- Passthrough from raw.ssb_12944 with source_id prepended. Note: this source
-- has a period (3-year rolling) instead of a single year, and an age_group
-- dimension not present in other indicators. These carry through to marts and
-- the forthcoming indicator_values union will need to accommodate them — or
-- we build a kommune-level aggregate downstream that filters to age_group
-- '999A' (all ages).

select
  'ssb-12944'::text   as source_id,
  region_code,
  case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr,
  age_group,
  period,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_12944') }}
