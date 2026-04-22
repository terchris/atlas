{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for FHI table 187 (Personer som bor alene).
-- Maps FHI dimension codes to Atlas canonical names. Exposes all age bands
-- and all measure types so downstream features can pick what they need.
-- Headline for the Coverage-gap explorer is ALDER='16_120' (all adults)
-- with MEASURE_TYPE='RATE' — consumers filter.

select
  'fhi-bor-alene'::text as source_id,
  geo_code              as region_code,
  case when geo_code ~ '^[0-9]{4}$' then geo_code end as kommune_nr,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  -- Parse "YYYY_YYYY" -> start year. For single-year tables the two halves
  -- match; the first is the canonical year. Multi-year averages keep period.
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  alder_code            as age_group,
  measure_type          as contents_code,
  case measure_type
    when 'RATE'   then 'Andel (prosent)'
    when 'SMR'   then 'Standardisert rate (100 = nasjonalt snitt)'
    when 'TELLER' then 'Antall personer'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'fhi_bor_alene') }}
