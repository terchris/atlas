{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 06913 (population change indicators).
-- Same shape as indicators__ssb_08764 (Region × ContentsCode × Tid).

select
  'ssb-06913'::text   as source_id,
  region_code,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_06913') }}
