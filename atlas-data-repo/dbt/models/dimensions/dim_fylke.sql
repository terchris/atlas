{{
  config(
    materialized='table',
    schema='marts',
    indexes=[{'columns': ['fylke_nr'], 'unique': True}]
  )
}}

-- dim_fylke — canonical fylke dimension for Atlas.
-- Source: SSB Klass classification 104 (Fylker), snapshot at ingest time.
-- Keeps 16 codes: 15 real fylker + the residual '99 Uoppgitt'. Consumers
-- filtering to real-only should add `where fylke_nr <> '99'`.

select
  code                                                    as fylke_nr,
  split_part(name, ' - ', 1)                              as fylke_name,
  case when name like '% - %'
       then substring(name from position(' - ' in name) + 3)
       end                                                as fylke_name_alt,
  notes,
  loaded_at                                               as updated_at,
  valid_from,
  valid_to,
  case when valid_to is null or valid_to > current_date
       then true else false end                           as is_active
from {{ source('raw', 'ssb_klass_fylker') }}
