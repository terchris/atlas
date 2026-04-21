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
  -- 06913 prefixes region codes with type: K_0301 (kommune), F_03 (fylke),
  -- and SSB uses "Rest" as a residual bucket that also ends up K_-prefixed in
  -- some tables. Match only K_ followed by exactly 4 digits.
  case when region_code ~ '^K_[0-9]{4}$' then substring(region_code, 3) end as kommune_nr,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_06913') }}
