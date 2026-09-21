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
       then true else false end            as is_active,
  -- 🔴 THIS DIMENSION KEEPS EVERY CODE SSB PUBLISHES, INCLUDING 9999.
  --
  -- Klass 131 contains 'Uoppgitt' and Atlas does not synthesise it. Dropping it
  -- here would mean Atlas's kommune list no longer matches SSB's kommune list,
  -- and a consumer reconciling the two would find a code missing — which is the
  -- one promise this repo exists to keep. So the row stays and gains a flag,
  -- and the ANALYTICAL marts downstream exclude it (urb-agents #1301, Terje's
  -- decision 2026-09-21: option B).
  --
  -- 🔵 The rule: the dimension MIRRORS the source; the marts are Atlas's own
  -- constructs and Atlas defines their grain. "One row per municipality" is a
  -- grain statement, not curation of somebody else's data.
  --
  -- Derived from classify_region_code so there is one definition of "is a
  -- municipality" in the project — the same one that stopped Svalbard being
  -- called a kommune. mart_dim_kommune used to recompute it as
  -- `kommune_nr = '9999'`; it now reads this.
  ({{ classify_region_code('l.code') }}) <> 'kommune' as is_sentinel
from latest_per_code l
join range_per_code  r using (code)
