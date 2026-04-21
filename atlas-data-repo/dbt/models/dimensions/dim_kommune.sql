{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['kommune_nr'], 'unique': True},
      {'columns': ['fylke_nr']},
      {'columns': ['is_active']}
    ]
  )
}}

-- dim_kommune — canonical kommune dimension for Atlas.
-- Source: SSB Klass classification 131 (Kommuner) with full history from 1960.
-- One row per distinct kommune_nr, deduped across validity spans.
--
-- Fylke relationship is derived from the first two digits of kommune_nr, per
-- SSB's long-standing kommune-code convention.
--
-- Historical codes (mergers, reorganisations, name changes) appear with
-- is_active = false; current codes with is_active = true. Consumers wanting
-- current-only should add `where is_active`.

with raw_ranges as (
  select
    code,
    name,
    notes,
    valid_from_in_range,
    valid_to_in_range,
    loaded_at
  from {{ source('raw', 'ssb_klass_kommuner') }}
),

latest_per_code as (
  -- Name + notes from the most recent validity span per code. When a code
  -- has multiple spans (rename, boundary change) this captures the latest
  -- known form.
  select distinct on (code)
    code,
    name,
    notes,
    loaded_at
  from raw_ranges
  order by code, valid_from_in_range desc
),

range_per_code as (
  -- Aggregate the validity span across all entries for a code.
  select
    code,
    min(valid_from_in_range) as valid_from,
    max(valid_to_in_range)   as valid_to
  from raw_ranges
  group by code
)

select
  l.code                                   as kommune_nr,
  split_part(l.name, ' - ', 1)             as kommune_name,
  case when l.name like '% - %'
       then substring(l.name from position(' - ' in l.name) + 3)
       end                                 as kommune_name_alt,
  substring(l.code, 1, 2)                  as fylke_nr,
  l.notes,
  l.loaded_at                              as updated_at,
  r.valid_from,
  r.valid_to,
  case when r.valid_to is null or r.valid_to > current_date
       then true else false end            as is_active
from latest_per_code l
join range_per_code  r using (code)
