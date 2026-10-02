{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 12451 (Bostedskommune- og kjønnsfordelt
-- sykefravær, legemeldt). Quarterly sick-leave percentage and lost workdays
-- per kommune of residence.
--
-- The canonical macros, not a bare four-digit regex. This ingest passes an
-- EXPLICIT `Region: "*"` filter (unlike ssb-12944's no-filter default,
-- which only reaches SSB's restricted default selection) — confirmed live
-- 2026-10-02 that the full 937-code dimension lands in raw, including every
-- sentinel shape classify_region_code already handles: XX99 (unspecified
-- within fylke, 18 historical+current fylke codes), 9999 (unspecified
-- national), 21xx (Svalbard, 6 codes), 22xx (Jan Mayen), 23xx (continental
-- shelf). Verified by querying raw.ssb_12451 directly, not assumed from the
-- table's metadata alone.
--
-- ⚠️ ONE CODE SHAPE classify_region_code HAS NEVER SEEN: `0716u` ("Våle
-- (-2001)"). SSB appends a letter suffix when a numeric kommune code was
-- later reused for a different kommune (0716 is Re, 2002-2019) — its own
-- disambiguation for a genuine historical-code collision, not a sentinel
-- in the Svalbard/shelf sense. Correctly falls through every digit-based
-- branch to 'unknown' rather than being silently matched as a kommune —
-- exactly the macro's own stated purpose for that branch. One row out of
-- 196,770; not worth a dedicated branch for a single discontinued code.

select
  'ssb-12451'::text as source_id,
  region_code,
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  period,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at as updated_at
from {{ source('raw', 'ssb_12451') }}
