{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 12944.
-- Passthrough from raw.ssb_12944 with source_id prepended. Note: this source
-- has a period (3-year rolling, hyphen-separated) instead of a single year,
-- and an age_group dimension not present in other indicators. Both are kept
-- as text for fidelity; parsed integer min/max columns provide a sortable
-- numeric counterpart. age_group '999A' (all ages) yields NULL min/max.

select
  region_code,
  'ssb-12944'::text   as source_id,
  case when region_code ~ '^[0-9]{4}$' then region_code end as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  age_group,
  {{ age_range_min('age_group', '-') }} as age_group_min,
  {{ age_range_max('age_group', '-') }} as age_group_max,
  period,
  {{ period_start_year('period') }} as period_start_year,
  {{ period_end_year('period') }}   as period_end_year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_12944') }}
