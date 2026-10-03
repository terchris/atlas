{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Udir's "Fravær i grunnskole" — median/average days and hours of
-- documented absence, plus participant count, for 10th-grade pupils only. One row per
-- (region_code, year, measure). Atlas's fourth Udir source.
--
-- kommune_nr via region_code_to_kommune_nr/classify_region_code, same as every other
-- kommune-grain source. Verified live 2026-10-03: this report's EnhetID hierarchy carries the
-- Svalbard pseudo-kommune (2100, same tree-depth finding as udir-gsi/udir-nasjonale-prover) and
-- "Utlandet, uspesifisert" (2599, Norwegian schools abroad, carrying real data every year) —
-- both resolve via classify_region_code's existing svalbard and unspecified_within_fylke
-- branches respectively, no macro change needed.

select
  'udir-fravar'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  year,
  (
    'udir_fravar__' ||
    case measure
      when 'Median dager' then 'median_dager'
      when 'Median timer' then 'median_timer'
      when 'Snitt dager' then 'snitt_dager'
      when 'Snitt timer' then 'snitt_timer'
      when 'Antall elever' then 'antall_elever'
    end
  )::text as contents_code,
  measure::text as contents_label,
  value,
  loaded_at as updated_at
from {{ source('raw', 'udir_fravar') }}
