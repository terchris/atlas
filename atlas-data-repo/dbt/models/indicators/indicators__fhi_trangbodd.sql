{{ config(materialized='table', schema='marts') }}

-- Per-source indicator passthrough for FHI 794 (Trangbodd).
-- Preserves age/education/housing-status dims so consumers can filter;
-- fact_kommune_indicators takes the headline slice (housing_status='trangt',
-- age_group='0_120', parents_education='0') below.
--
-- FHI UTDANN here is the *parents'* education level (the table breaks
-- children's overcrowding by parental education). Aliased as
-- parents_education to avoid confusion with the subject's own level.
-- Joined to ref_fhi_utdann for Norwegian labels.

select
  'fhi-trangbodd'::text as source_id,
  src.geo_code              as region_code,
  case when src.geo_code ~ '^[0-9]{4}$' then src.geo_code end as kommune_nr,
  case when src.geo_code ~ '^[0-9]{2}$' then src.geo_code end as fylke_nr,
  (split_part(src.aar_code, '_', 1))::int as year,
  src.aar_code              as period,
  {{ period_start_year('src.aar_code') }} as period_start_year,
  {{ period_end_year('src.aar_code') }}   as period_end_year,
  src.alder_code            as age_group,
  {{ age_range_min('src.alder_code', '_') }} as age_group_min,
  {{ age_range_max('src.alder_code', '_') }} as age_group_max,
  src.utdann_code           as parents_education,
  ref_utdann.label_no       as parents_education_label_no,
  src.bodd_code             as housing_status,
  src.measure_type          as contents_code,
  case src.measure_type
    when 'RATE'   then 'Andel (prosent)'
    when 'SMR'    then 'Standardisert rate (100 = snitt)'
    when 'TELLER' then 'Antall personer'
    else src.measure_type
  end                       as contents_label,
  src.value,
  src.status,
  src.loaded_at             as updated_at
from {{ source('raw', 'fhi_trangbodd') }} src
left join {{ ref('ref_fhi_utdann') }} ref_utdann
  on src.utdann_code = ref_utdann.code
