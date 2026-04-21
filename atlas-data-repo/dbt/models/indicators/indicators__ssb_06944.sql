{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 06944 (household income by household
-- type). Preserves household_type dimension; consumers can filter to 0000
-- (all households) for a headline view.

select
  'ssb-06944'::text   as source_id,
  region_code,
  -- Exclude SSB's XX99 rest-of-fylke aggregate codes; they're 4-digit but
  -- not real kommuner (e.g. 0199 = "Rest Østfold", aggregation bucket).
  case when region_code ~ '^[0-9]{2}[0-9]{2}$' and right(region_code, 2) <> '99'
       then region_code end                           as kommune_nr,
  -- Special SSB fylke codes (21 Svalbard, 22 Jan Mayen, 23 cont. shelf,
  -- 25, 26, 88) aren't in Klass 104 — let the warn-severity relationship
  -- test catch them without blocking CI.
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  household_type,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_06944') }}
