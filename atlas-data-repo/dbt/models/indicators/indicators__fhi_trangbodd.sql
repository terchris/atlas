{{ config(materialized='table', schema='marts') }}

-- Per-source indicator passthrough for FHI 794 (Trangbodd).
-- Preserves age/education/housing-status dims so consumers can filter;
-- fact_kommune_indicators takes the headline slice (bodd='trangt',
-- alder='0_120', utdann='0') below.

select
  'fhi-trangbodd'::text as source_id,
  geo_code              as region_code,
  case when geo_code ~ '^[0-9]{4}$' then geo_code end as kommune_nr,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  alder_code            as age_group,
  utdann_code           as education_level,
  bodd_code             as housing_status,
  measure_type          as contents_code,
  case measure_type
    when 'RATE'   then 'Andel (prosent)'
    when 'SMR'    then 'Standardisert rate (100 = snitt)'
    when 'TELLER' then 'Antall personer'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'fhi_trangbodd') }}
