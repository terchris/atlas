{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Udir's Nasjonale prøver (national test) scale-score results,
-- uncertainty margin, and participant count. One row per (region_code, grade, subject, year,
-- measure). Atlas's third Udir source, and its first direct learning-outcome signal.
--
-- kommune_nr via region_code_to_kommune_nr/classify_region_code, same as every other
-- kommune-grain source. Verified live 2026-10-03: this report's EnhetID hierarchy carries the
-- Svalbard pseudo-kommune (2100, same tree-depth finding as udir-gsi/
-- udir-elevundersokelsen-mobbing) and "Utlandet, uspesifisert" (2599, Norwegian schools abroad —
-- a sentinel udir-elevundersokelsen-mobbing also found, resolving via classify_region_code's
-- existing svalbard and unspecified_within_fylke branches respectively, no macro change needed.

select
  'udir-nasjonale-prover'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  grade,
  subject,
  year,
  (
    'udir_nasjonale_prover__' || subject || '__' ||
    case measure
      when 'Skalapoeng' then 'skalapoeng'
      when 'Usikkerhet' then 'usikkerhet'
      when 'Antall elever deltatt' then 'deltatt'
    end
  )::text as contents_code,
  measure::text as contents_label,
  value,
  loaded_at as updated_at
from {{ source('raw', 'udir_nasjonale_prover') }}
