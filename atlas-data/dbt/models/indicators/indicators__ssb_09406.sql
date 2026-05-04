{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- SSB 09406 — investigated offence counts + clearance percentage (national).
select
  'ssb-crime-tables'::text as source_id,
  null::text            as kommune_nr,
  null::text            as fylke_nr,
  year,
  (lovbrudd_krim_code || '__' || contents_code)::text as contents_code,
  (lovbrudd_krim_label || ' — ' || contents_label)::text as contents_label,
  value,
  status,
  loaded_at             as updated_at
from {{ source('raw', 'ssb_09406') }}
