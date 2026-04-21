{{ config(materialized='table', schema='marts') }}

select
  'ssb-09429'::text   as source_id,
  region_code,
  case when region_code ~ '^[0-9]{2}[0-9]{2}$' and right(region_code, 2) <> '99'
       then region_code end as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  education_level,
  case sex when '1' then 'male' when '2' then 'female' when '0' then 'all' end as sex,
  year, contents_code, contents_label, value, status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_09429') }}
