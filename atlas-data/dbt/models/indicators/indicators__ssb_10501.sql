{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB's first-name statistics. One row per
-- (first name, year). Atlas's first reference-list source added for a
-- text-scrubbing use case rather than as a kommune-level demographic
-- indicator — it carries no geography at all because SSB publishes this
-- table at national resolution only.
--
-- ⚠️ NOT AN EXHAUSTIVE NAME LIST. SSB's own table note: only first names used
-- by 200 or more persons in Norway at year-end appear as a row, in any year.
-- A name with fewer bearers never appears here. See schema.yml's column
-- descriptions, and atlas-data/ingest/src/sources/ssb-10501/README.md, for
-- the full caveat.
--
-- `sex` is derived here from `name_code`'s leading digit (SSB's own
-- convention: 1=girl name, 2=boy name, embedded in the composite code rather
-- than carried as a separate dimension) — not via the shared `decode_sex`
-- macro, because that macro decodes a STANDALONE SSB sex code value
-- ("0"/"1"/"2"), and this is a single leading character of a composite
-- per-name code. The two encodings share a vocabulary ("male"/"female") but
-- not a representation, so reusing the macro would be a false shortcut.

select
  'ssb-10501'::text as source_id,
  name_label as first_name,
  case
    when left(name_code, 1) = '1' then 'female'
    when left(name_code, 1) = '2' then 'male'
  end as sex,
  year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_10501') }}
