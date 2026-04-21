{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 07459 (population by region, sex, and
-- single-year age). Adds sex and age columns compared to the 3-dim sources —
-- these carry through; downstream aggregates (indicator_values, kommune_indicators)
-- will roll up over sex and age when a common (region × year × contents × value)
-- view is needed.

select
  'ssb-07459'::text   as source_id,
  region_code,
  case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr,
  sex,
  age,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_07459') }}
