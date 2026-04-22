{{ config(materialized='table', schema='marts') }}

-- Per-source indicator model for FHI 360 (Gjennomføring i videregående
-- skole). FHI's KJONN code is decoded to canonical sex; UTDANN here is
-- parents' education (the table breaks completion by parental education),
-- aliased as parents_education and joined to ref_fhi_utdann. INNVKAT
-- (immigration category) is joined to ref_fhi_innvkat — currently a
-- single-row seed but future-proofed.

select
  'fhi-vgs-gjennomforing'::text as source_id,
  src.geo_code                  as region_code,
  case when src.geo_code ~ '^[0-9]{4}$' then src.geo_code end as kommune_nr,
  case when src.geo_code ~ '^[0-9]{2}$' then src.geo_code end as fylke_nr,
  (split_part(src.aar_code, '_', 1))::int as year,
  src.aar_code                  as period,
  {{ period_start_year('src.aar_code') }} as period_start_year,
  {{ period_end_year('src.aar_code') }}   as period_end_year,
  {{ decode_sex('src.kjonn_code') }} as sex,
  src.utdann_code               as parents_education,
  ref_utdann.label_no           as parents_education_label_no,
  src.innvkat_code              as immigration_category,
  ref_innvkat.label_no          as immigration_category_label_no,
  src.measure_type              as contents_code,
  case src.measure_type
    when 'RATE'   then 'Andel (prosent)'
    when 'SMR'    then 'Standardisert rate (100 = snitt)'
    when 'MEIS'   then 'Tillatelsesintervall-indeks'
    when 'TELLER' then 'Antall personer'
    else src.measure_type
  end                           as contents_label,
  src.value,
  src.status,
  src.loaded_at                 as updated_at
from {{ source('raw', 'fhi_vgs_gjennomforing') }} src
left join {{ ref('ref_fhi_utdann') }} ref_utdann
  on src.utdann_code = ref_utdann.code
left join {{ ref('ref_fhi_innvkat') }} ref_innvkat
  on src.innvkat_code = ref_innvkat.code
