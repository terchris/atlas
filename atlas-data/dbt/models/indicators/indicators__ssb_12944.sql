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
  -- 🔴 THE CANONICAL MACRO, NOT A BARE FOUR-DIGIT REGEX. Measured against
  -- SSB's own Region dimension for table 12944 on 2026-09-22: of the 936
  -- codes matching ^[0-9]{4}$, THIRTY-THREE are not kommuner —
  --
  --     20  "Uoppgitt kommune <fylke>"  (0199, 0299, 0399 …)
  --      6  Svalbard        4  Kontinentalsokkelen
  --      2  Jan Mayen       1  9999 Uoppgitt
  --
  -- Publishing those as municipalities is exactly what urb-agents #700
  -- forbids — represent, do not cover — and it is the same defect that made
  -- ssb-06913 deliver nothing for its whole life. Found before serving this
  -- source rather than after (urb-agents #1383).
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
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
