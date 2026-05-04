{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- SSB 08487 — reported offences by place of offence (kommune and higher aggregates);
-- two-year rolling averages.
select
  'ssb-crime-tables'::text as source_id,
  case
    when region_code ~ '^[0-9]{4}$'
      and region_code <> '0000'
      and right(region_code, 2) <> '99'
      then region_code
  end as kommune_nr,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  cast(split_part(replace(period_interval_code, '–', '-'), '-', 2) as integer) as year,
  (
    region_code || '__' || lovbrudd_krim_code || '__'
    || contents_code || '__' || replace(period_interval_code, ' ', '')
  )::text as contents_code,
  (
    region_label || ' — ' || lovbrudd_krim_label || ' — ' || contents_label
    || ' (' || period_interval_label || ')'
  )::text as contents_label,
  value,
  status,
  loaded_at               as updated_at
from {{ source('raw', 'ssb_08487') }}
