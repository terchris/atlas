{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Bufdir Barnefattigdom kommunemonitor.
-- Renames upstream fields to Atlas canonical vocabulary (naming-conventions.md).

select
  'bufdir-barnefattigdom'::text as source_id,
  indicator_api_id,
  indicator_slug,
  indicator_group_slug,
  indicator_name,
  indicator_title,
  link_text,
  region_code,
  case
    when region_code ~ '^[0-9]{4}$' then region_code
  end as kommune_nr,
  case
    when region_code ~ '^[0-9]{2}$' then region_code
  end as fylke_nr,
  category_unit,
  category_format,
  year,
  ('bf_' || indicator_slug || '__' || category_unit || '__' || category_format)::text as contents_code,
  (indicator_title || ' — ' || category_unit || ' (' || category_format || ')')::text as contents_label,
  value,
  values_json,
  loaded_at as updated_at
from {{ source('raw', 'bufdir_barnefattigdom') }}
