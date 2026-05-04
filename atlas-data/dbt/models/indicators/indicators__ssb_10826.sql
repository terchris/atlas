{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 10826 (population by bydel/city-total
-- region, sex, and single-year age). Region codes are alphanumeric in this
-- table, so the model derives parent kommune and bydel slots without assuming
-- every Region value is a joinable active bydel.

select
  'ssb-10826'::text as source_id,
  region_code,
  region_label,
  case
    when region_code ~ '^[0-9]{6}[a-z]*$' then left(region_code, 4)
  end as kommune_nr,
  case
    when region_code ~ '^[0-9]{6}[a-z]*$'
      and substring(region_code from 5 for 2) <> '00'
      and substring(region_code from 5 for 2) <> '99'
    then substring(region_code from 1 for 6)
  end as bydel_code,
  case
    when region_code ~ '^[0-9]{6}[a-z]*$'
      and substring(region_code from 5 for 2) <> '00'
      and substring(region_code from 5 for 2) <> '99'
    then regexp_replace(region_label, '\s+\([^)]*\)$', '')
  end as bydel_name,
  {{ decode_sex('sex') }} as sex,
  age,
  case when age ~ '^[0-9]+$' then age::int end as age_int,
  case
    when age ~ '^[0-9]+$' then age::int
    when age ~ '^[0-9]+\+$' then regexp_replace(age, '\+$', '')::int
  end as age_min,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_10826') }}
