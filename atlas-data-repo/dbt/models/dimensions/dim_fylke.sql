{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['fylke_nr'], 'unique': True},
      {'columns': ['is_active']}
    ]
  )
}}

-- dim_fylke — canonical fylke dimension. History-aware, one row per distinct
-- fylke_nr. Historical codes (pre-2020 01-20 numbering, intermediate Viken
-- 30, etc.) appear with is_active=false.

with raw_ranges as (
  select code, name, notes, valid_from_in_range, valid_to_in_range, loaded_at
  from {{ source('raw', 'ssb_klass_fylker') }}
),

latest_per_code as (
  select distinct on (code)
    code, name, notes, loaded_at
  from raw_ranges
  order by code, valid_from_in_range desc
),

range_per_code as (
  select
    code,
    min(valid_from_in_range) as valid_from,
    max(valid_to_in_range)   as valid_to
  from raw_ranges
  group by code
)

select
  l.code                                   as fylke_nr,
  split_part(l.name, ' - ', 1)             as fylke_name,
  case when l.name like '% - %'
       then substring(l.name from position(' - ' in l.name) + 3)
       end                                 as fylke_name_alt,
  l.notes,
  l.loaded_at                              as updated_at,
  r.valid_from,
  r.valid_to,
  case when r.valid_to is null or r.valid_to > current_date
       then true else false end            as is_active
from latest_per_code l
join range_per_code  r using (code)
