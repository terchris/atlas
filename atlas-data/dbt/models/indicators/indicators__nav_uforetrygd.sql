{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for NAV PST302 (uføretrygd — disability benefit
-- recipients, count and share of population 18-67, per kommune, monthly).
-- Atlas's first monthly-cadence indicator model — a plain `month` column,
-- no dim_period (none exists; see PLAN-004-nav-uforetrygd.md).
--
-- Single-table source — no indicator_slug/name/title/group_slug columns the
-- way the Bufdir sources carry (those span many workbooks per source; this
-- source is exactly one table).

select
  'nav-uforetrygd'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  case
    when region_code ~ '^[0-9]{2}$' then region_code
  end as fylke_nr,
  category_format,
  year,
  month,
  ('nav_uforetrygd__' || category_format)::text as contents_code,
  ('Uføretrygd (' || category_format || ')')::text as contents_label,
  value,
  values_json,
  loaded_at as updated_at
from {{ source('raw', 'nav_uforetrygd') }}
