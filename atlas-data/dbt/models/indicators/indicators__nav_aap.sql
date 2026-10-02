{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for NAV AAP155 (arbeidsavklaringspenger — work-
-- assessment allowance — recipients, count and share of the population, per
-- kommune, monthly). Atlas's second monthly-cadence indicator model.
--
-- Single-table source — no indicator_slug/name/title/group_slug columns the
-- way the Bufdir sources carry (those span many workbooks per source; this
-- source is exactly one table).
--
-- No fylke_nr column, unlike nav-uforetrygd: this table has no fylke-level
-- rows at all (confirmed live 2026-10-02, PLAN-012 Phase 1.3) — region_code
-- is always a 4-digit kommune or the literal "Ukjent", never a 2-digit
-- fylke code, so a region_code ~ '^[0-9]{2}$' branch would never fire here.

select
  'nav-aap'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  category_format,
  year,
  month,
  ('nav_aap__' || category_format)::text as contents_code,
  ('Arbeidsavklaringspenger (' || category_format || ')')::text as contents_label,
  value,
  values_json,
  loaded_at as updated_at
from {{ source('raw', 'nav_aap') }}
