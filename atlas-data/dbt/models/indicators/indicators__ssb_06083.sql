{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 06083 (families by type).
-- Extra family_type column; fact-layer filters to a chosen headline value.
-- Joined to ref_ssb_family_type for human-readable labels.

select
  'ssb-06083'::text   as source_id,
  src.region_code,
  case when src.region_code ~ '^[0-9]{2}[0-9]{2}$' and right(src.region_code, 2) <> '99'
       then src.region_code end as kommune_nr,
  case when src.region_code ~ '^[0-9]{2}$' then src.region_code end as fylke_nr,
  src.family_type,
  ref.label_no        as family_type_label_no,
  ref.label_en        as family_type_label_en,
  src.year,
  src.contents_code,
  src.contents_label,
  src.value,
  src.status,
  src.loaded_at       as updated_at
from {{ source('raw', 'ssb_06083') }} src
left join {{ ref('ref_ssb_family_type') }} ref
  on src.family_type = ref.code
