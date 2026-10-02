{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for NAV HL060 (helt ledige — fully unemployed —
-- count and share of the labour force, per kommune, monthly). Atlas's fourth
-- NAV-adjacent source, third monthly-cadence indicator model.
--
-- Single-table source — no indicator_slug/name/title/group_slug columns the
-- way the Bufdir sources carry (those span many workbooks per source; this
-- source is exactly one table).
--
-- No fylke_nr column, unlike nav-uforetrygd: this table has no fylke-level
-- rows at all (bare fylke header rows and "I alt <name>" rollups are
-- excluded by the ingest, not summed) — confirmed live 2026-10-02,
-- PLAN-014 Phase 1.3. region_code is always a 4-digit kommune (including
-- the Svalbard pseudo-kommune 2100) or the literal "Ukjent", never a
-- 2-digit fylke code.

select
  'nav-helt-ledige'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  category_format,
  year,
  month,
  ('nav_helt_ledige__' || category_format)::text as contents_code,
  ('Helt ledige (' || category_format || ')')::text as contents_label,
  value,
  values_json,
  loaded_at as updated_at
from {{ source('raw', 'nav_helt_ledige') }}
