{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Bufdir Barnevern kommunemonitor.
-- Sibling of indicators__bufdir_barnefattigdom.sql — no category_unit (Barnevern's
-- workbooks carry no Enhet column), and category_format uses "andel" (not "prosent").

select
  'bufdir-barnevern'::text as source_id,
  indicator_api_id,
  indicator_slug,
  indicator_group_slug,
  indicator_name,
  indicator_title,
  link_text,
  region_code,
  -- NOT `region_code ~ '^[0-9]{4}$'` — that calls Svalbard (region_code 2111
  -- confirmed live in this source's own data, 394 rows, all-null values) a
  -- kommune. See macros/classify_region_code.sql (urb-agents #700).
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  -- Same Svalbard problem one level up: this source's own ZIP also carries a
  -- bare '21' row (land/fylke-level Svalbard rollup, all-null values,
  -- confirmed live 2026-10-01 alongside the 4-digit '2111'). classify_region_code's
  -- 'fylke' branch is a bare `^\d{2}$` catch-all with no Svalbard/Jan Mayen/
  -- shelf exclusion (unlike its kommune branch), so it can't be reused here
  -- without widening the fix to every model that calls it — out of scope for
  -- this source. Excluding '21' explicitly, narrowly, for what this source's
  -- real data actually contains, not pre-emptively guarding codes that don't
  -- appear here.
  case
    when region_code ~ '^[0-9]{2}$' and region_code != '21' then region_code
  end as fylke_nr,
  category_format,
  year,
  ('bv_' || indicator_slug || '__' || category_format)::text as contents_code,
  (indicator_title || ' (' || category_format || ')')::text as contents_label,
  value,
  values_json,
  loaded_at as updated_at
from {{ source('raw', 'bufdir_barnevern') }}
