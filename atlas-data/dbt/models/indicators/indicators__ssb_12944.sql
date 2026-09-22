{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- Per-source indicator model for SSB 12944.
-- Passthrough from raw.ssb_12944 with source_id prepended. Note: this source
-- has a period (3-year rolling, hyphen-separated) instead of a single year,
-- and an age_group dimension not present in other indicators. Both are kept
-- as text for fidelity; parsed integer min/max columns provide a sortable
-- numeric counterpart. age_group '999A' (all ages) yields NULL min/max.

select
  region_code,
  'ssb-12944'::text   as source_id,
  -- 🔴 THE CANONICAL MACRO, NOT A BARE FOUR-DIGIT REGEX. What this source
  -- actually receives, measured by RUNNING the ingest on 2026-09-22:
  --
  --     358 regions = 357 kommuner + 9999 "Uoppgitt"
  --     358 x 6 Alder x 2 ContentsCode = 4 296 cells, and the fact keeps
  --     357 x 12 = 4 284 — exactly one region dropped
  --
  -- ⚠️ ONE non-kommune code arrives, not thirty-three. This comment used to
  -- say "of the 936 codes matching ^[0-9]{4}$, THIRTY-THREE are not kommuner"
  -- and listed them. That count is REAL but it describes SSB's full Region
  -- DIMENSION for table 12944 — and this ingest never asks for it.
  -- fetchPxTableData() passes NO filters, so SSB returns its default
  -- selection: 358 regions. Twenty "Uoppgitt kommune <fylke>" codes, the
  -- Svalbard range, Jan Mayen and the shelf sectors are all absent from what
  -- we fetch. A measurement of the dimension was reported as a property of
  -- the data.
  --
  -- 🔵 THE MACRO IS STILL LOAD-BEARING, and 9999 is the reason. It matches
  -- ^[0-9]{4}$, so a bare regex WOULD have published it as a municipality —
  -- and 9999 is precisely the code classify_region_code needed its own branch
  -- for, because dim_kommune carries it with is_active = true. One bad row
  -- group, not thirty-three, and it is the one the sentinel work exists for.
  --
  -- Publishing it as a municipality is what urb-agents #700 forbids —
  -- represent, do not cover — and it is the same defect that made ssb-06913
  -- deliver nothing for its whole life. Found before serving this source
  -- rather than after (urb-agents #1383).
  --
  -- ⚠️ If the ingest ever gains an explicit Region filter, re-measure: the
  -- other thirty-two become reachable the moment we ask for them.
  {{ region_code_to_kommune_nr('region_code') }} as kommune_nr,
  {{ classify_region_code('region_code') }} as region_kind,
  case when region_code ~ '^[0-9]{2}$' then region_code end as fylke_nr,
  age_group,
  {{ age_range_min('age_group', '-') }} as age_group_min,
  {{ age_range_max('age_group', '-') }} as age_group_max,
  period,
  {{ period_start_year('period') }} as period_start_year,
  {{ period_end_year('period') }}   as period_end_year,
  contents_code,
  contents_label,
  value,
  status,
  loaded_at           as updated_at
from {{ source('raw', 'ssb_12944') }}
