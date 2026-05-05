{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- mart_meta_dimensions — per-source × per-dimension catalogue. Backs the
-- "what does this column mean" panel on the customer frontend's per-source
-- detail page (PLAN-007 phase 4).
--
-- v1 scope (this PR):
--   Editorial pass-through over the _sources_dimensions seed. Surfaces the
--   hand-authored semantic content (`meaning`, `value_format`, `notes`) so
--   shoppers see "what each upstream dimension represents" without leaving
--   Atlas to read SSB / FHI / Bufdir docs.
--
-- v2 deferred (separate PR):
--   PLAN-007 phase 3.4 also calls for `cardinality`, `example_values`, and
--   `null_count` columns computed from raw.<source> introspection. Doing
--   that cleanly requires either (a) a Jinja loop over seed contents at
--   parse time with hardcoded column-name rules per source family
--   (Region → region_code, AAR → aar_code, MEASURE_TYPE → measure_type,
--   plus the SSB special-case Tid → year integer), or (b) a separate
--   Python extract script (analogous to extract_lineage.py) that emits a
--   `dimension_stats` seed by introspecting each raw.* table directly.
--   Both approaches are 100+ LOC. v1 ships the editorial half so the
--   frontend has something to render; the computed half lands as a
--   follow-up once the column-name mapping is settled. Open question:
--   whether to put the mapping in the manifest.yml `dimensions:` block
--   (per-source `column_name:` field) or derive it from the canonical
--   naming-conventions.md rules.
--
-- Row count = same as _sources_dimensions (currently ~216, growing with
-- the catalogue at one row per source × upstream-dimension).

select
  source_id,
  code,
  meaning,
  value_format,
  notes
from {{ ref('_sources_dimensions') }}
order by source_id, code
