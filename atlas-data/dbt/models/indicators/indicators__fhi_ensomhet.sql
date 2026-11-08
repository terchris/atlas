{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for FHI table 348 (Ensomhet_Ungdata_KH).
-- Maps FHI dimension codes to Atlas canonical names. Only MEASURE_TYPE=SMR
-- exists for this table — never a raw percentage, never a count. See
-- atlas-data/ingest/src/sources/fhi-ensomhet/README.md.
--
-- kommune_nr comes through region_code_to_kommune_nr (macros/classify_region_code.sql),
-- not a bare four-digit regex — that bare pattern is a documented defect in
-- six older sibling models (check-kommune-marts-exclude-sentinels.sh's EXEMPT
-- list), not a pattern to copy into a new one.

select
  'fhi-ensomhet'::text as source_id,
  geo_code              as region_code,
  {{ region_code_to_kommune_nr('geo_code') }} as kommune_nr,
  {{ classify_region_code('geo_code') }} as region_kind,
  case when geo_code ~ '^[0-9]{2}$' then geo_code end as fylke_nr,
  (split_part(aar_code, '_', 1))::int as year,
  aar_code              as period,
  {{ period_start_year('aar_code') }} as period_start_year,
  {{ period_end_year('aar_code') }}   as period_end_year,
  kjonn_code            as sex,
  alder_code            as age_group,
  niva_plaget_code      as severity_threshold,
  soes_code             as socioeconomic_group,
  measure_type          as contents_code,
  case measure_type
    when 'SMR' then 'Standardisert rate (100 = nasjonalt snitt)'
    else measure_type
  end                   as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'fhi_ensomhet') }}
