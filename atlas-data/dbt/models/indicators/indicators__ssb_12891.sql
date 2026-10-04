{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB's surname statistics. One row per
-- (surname, year). Companion to indicators__ssb_10501 (first names) — same
-- shape, same national-only resolution, same reference-list purpose.
--
-- ⚠️ NOT AN EXHAUSTIVE SURNAME LIST. SSB's own table note: only surnames used
-- by 200 or more persons at year-end appear as a row. Unlike the equivalent
-- caveat on first names, this threshold is not an arbitrary
-- disclosure-avoidance cutoff — it is the exact threshold Norwegian naming
-- law uses to protect rarer surnames from being freely adopted by others. See
-- schema.yml's column descriptions, and
-- atlas-data/ingest/src/sources/ssb-12891/README.md, for the full caveat.
--
-- No `sex` column: surnames carry no gender prefix in SSB's Etternavn
-- dimension (unlike ssb-10501's Fornavn codes).

select
  'ssb-12891'::text as source_id,
  name_label as surname,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_12891') }}
