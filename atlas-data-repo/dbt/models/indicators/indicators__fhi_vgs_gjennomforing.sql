{{ config(materialized='table', schema='marts') }}

select
  'fhi-vgs-gjennomforing'::text as source_id,
  geo_code              as region_code,
  case when geo_code ~ '^[0-9]{4}$' then geo_code end as kommune_nr,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  kjonn_code            as sex_code,
  utdann_code           as parents_education,
  innvkat_code          as immigration_category,
  measure_type          as contents_code,
  case measure_type
    when 'RATE'   then 'Andel (prosent)'
    when 'SMR'    then 'Standardisert rate (100 = snitt)'
    when 'MEIS'   then 'Tillatelsesintervall-indeks'
    when 'TELLER' then 'Antall personer'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'fhi_vgs_gjennomforing') }}
