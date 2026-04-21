{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 08764.
-- Passthrough from raw.ssb_08764 with source_id prepended. Every future
-- per-source model follows this same shape so indicator_values can union them.

select
  'ssb-08764'::text   as source_id,
  region_code,
  case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_08764') }}
