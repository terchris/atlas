{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB KOSTRA 12292 (omsorgstjenester).

select
  'ssb-12292'::text   as source_id,
  region_code,
  case when region_code ~ '^[0-9]{2}[0-9]{2}$' and right(region_code, 2) <> '99'
       then region_code end as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_12292') }}
