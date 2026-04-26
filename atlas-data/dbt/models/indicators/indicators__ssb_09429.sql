{{ config(materialized='table', schema='marts') }}

-- Per-source indicator model for SSB 09429 (educational attainment by
-- region, sex, and education level). Joined to ref_ssb_nivaa for
-- human-readable Nivaa labels alongside the raw NUS2000 code.

select
  'ssb-09429'::text   as source_id,
  src.region_code,
  case when src.region_code ~ '^[0-9]{2}[0-9]{2}$' and right(src.region_code, 2) <> '99'
       then src.region_code end as kommune_nr,
  case when src.region_code ~ '^[0-9]{2}$' then src.region_code end as fylke_nr,
  src.education_level,
  ref.label_no        as education_level_label_no,
  ref.label_en        as education_level_label_en,
  {{ decode_sex('src.sex') }} as sex,
  src.year, src.contents_code, src.contents_label, src.value, src.status,
  src.loaded_at       as updated_at
from {{ source('raw', 'ssb_09429') }} src
left join {{ ref('ref_ssb_nivaa') }} ref
  on src.education_level = ref.code
