{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for Husbanken bostøtte (housing allowance —
-- application, decision, payout and rejection counts, plus the paid kroner
-- amount). One row per (region_code, year, measure).
--
-- kommune_nr via region_code_to_kommune_nr/classify_region_code, same as
-- every other kommune-grain source — NOT a bare passthrough of region_code,
-- matching the exact lesson udir-gsi learned. Verified live 2026-10-02:
-- Svalbard's pseudo-codes (2100, 2111) are present among Husbanken's own
-- KommuneNr values, always as real zero values — Husbanken genuinely
-- administers no Svalbard bostøtte cases, it is not a crosswalk gap.
--
-- Also verified live 2026-10-02: Husbanken's KommuneNr carries Oslo's 15
-- bydeler (plus one discontinued pre-2004 one) as 4-digit codes 0311-0326,
-- a second, incompatible numbering from FHI's 6-digit bydel convention.
-- classify_region_code now recognises both; see that macro's own comment.

select
  'husbanken-bostotte'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  year,
  measure,
  case measure
    when 'soknad' then 'husbanken_bostotte__soknad'
    when 'vedtak' then 'husbanken_bostotte__vedtak'
    when 'utbetaling' then 'husbanken_bostotte__utbetaling'
    when 'avslag' then 'husbanken_bostotte__avslag'
    when 'belop' then 'husbanken_bostotte__belop'
  end::text as contents_code,
  measure::text as contents_label,
  value,
  loaded_at as updated_at
from {{ source('raw', 'husbanken_bostotte') }}
