{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Udir GSI (Grunnskolens informasjonssystem —
-- pupil counts, individually-tailored-instruction counts, Norwegian-
-- reinforcement counts, school counts). One row per (region_code, year, measure).
--
-- kommune_nr via region_code_to_kommune_nr/classify_region_code, same as
-- every other kommune-grain source — NOT a bare passthrough of region_code,
-- despite raw.udir_gsi needing no crosswalk to get a real SSB-format code.
-- Verified live 2026-10-02: 2100 (Svalbard) and 2111 sit at the exact same
-- hierarchy depth as genuine kommuner in Udir's own API, because GSI
-- reports a school there — matching the `21\d{2}` Svalbard pattern this
-- macro already handles. Treating "same tree depth" as "is a kommune"
-- would have been the exact bug `classify_region_code` was built to fix
-- (urb-agents #700), just rediscovered from a new source.

select
  'udir-gsi'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  year,
  measure,
  case measure
    when 'Antall elever' then 'udir_gsi__elever'
    when 'Antall elever med individuelt tilrettelagt opplæring/spesialundervisning' then 'udir_gsi__spesialundervisning'
    when 'Antall elever med forsterket opplæring i norsk' then 'udir_gsi__forsterket_norsk'
    when 'Antall skoler' then 'udir_gsi__skoler'
  end::text as contents_code,
  measure::text as contents_label,
  value,
  loaded_at as updated_at
from {{ source('raw', 'udir_gsi') }}
