{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Udir's Elevundersøkelsen bullying
-- ("mobbing") indicator and its three underlying questions. One row per
-- (region_code, grade, year, measure).
--
-- kommune_nr via region_code_to_kommune_nr/classify_region_code, same as
-- every other kommune-grain source. Verified live 2026-10-03: this report's
-- own EnhetID hierarchy carries the Svalbard pseudo-kommune (2100, same
-- tree-depth finding as udir-gsi) and a genuinely new sentinel not present
-- in udir-gsi — 2599 ("Utlandet, uspesifisert", Norwegian schools abroad) —
-- resolving via classify_region_code's existing svalbard and
-- unspecified_within_fylke branches respectively, no macro change needed.
--
-- Unlike udir-gsi, raw.udir_elevundersokelsen_mobbing already carries a
-- stable measure code from the API itself (e.g. EUIndeks_1398) — no
-- case-when label mapping needed; contents_code is a direct, prefixed
-- passthrough.

select
  'udir-elevundersokelsen-mobbing'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  grade,
  year,
  ('udir_elevundersokelsen_mobbing__' || measure)::text as contents_code,
  measure_label::text as contents_label,
  value,
  loaded_at as updated_at
from {{ source('raw', 'udir_elevundersokelsen_mobbing') }}
