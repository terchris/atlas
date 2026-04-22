{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 06944 (household income by household
-- type). Preserves household_type dimension; consumers can filter to 0000
-- (all households) for a headline view. Joined to ref_ssb_household_type
-- for human-readable labels.

select
  'ssb-06944'::text   as source_id,
  src.region_code,
  -- Exclude SSB's XX99 rest-of-fylke aggregate codes; they're 4-digit but
  -- not real kommuner (e.g. 0199 = "Rest Østfold", aggregation bucket).
  case when src.region_code ~ '^[0-9]{2}[0-9]{2}$' and right(src.region_code, 2) <> '99'
       then src.region_code end                       as kommune_nr,
  -- Special SSB fylke codes (21 Svalbard, 22 Jan Mayen, 23 cont. shelf,
  -- 25, 26, 88) aren't in Klass 104 — let the warn-severity relationship
  -- test catch them without blocking CI.
  case when src.region_code ~ '^[0-9]{2}$' then src.region_code end as fylke_nr,
  src.household_type,
  ref.label_no        as household_type_label_no,
  ref.label_en        as household_type_label_en,
  src.year,
  src.contents_code,
  src.contents_label,
  src.value,
  src.status,
  src.loaded_at       as updated_at
from {{ source('raw', 'ssb_06944') }} src
left join {{ ref('ref_ssb_household_type') }} ref
  on src.household_type = ref.code
