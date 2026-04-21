{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['kommune_nr'], 'unique': True},
      {'columns': ['fylke_nr']}
    ]
  )
}}

-- dim_kommune — canonical kommune dimension for Atlas.
-- Source: SSB Klass classification 131 (Kommuner), snapshotted at ingest time.
-- All marts-level indicators that reference a kommune FK into this table via
-- kommune_nr.
--
-- Fylke relationship is derived from the first two digits of kommune_nr, per
-- SSB's long-standing kommune-code convention — no separate lookup needed.
-- dim_fylke (forthcoming) will relate via the same 2-digit key.

select
  code                                    as kommune_nr,
  split_part(name, ' - ', 1)              as kommune_name,
  case when name like '% - %'
       then split_part(name, ' - ', 2)
       end                                as kommune_name_sami,
  substring(code, 1, 2)                   as fylke_nr,
  notes,
  loaded_at                               as updated_at,
  -- Snapshot from Klass codesAt: validity fields are always null in the
  -- source. Carry the structure through so the dim stays history-compatible
  -- once we extend the ingest to /codes.json.
  valid_from,
  valid_to,
  case when valid_to is null or valid_to > current_date
       then true
       else false
       end                                as is_active
from {{ source('raw', 'ssb_klass_kommuner') }}
