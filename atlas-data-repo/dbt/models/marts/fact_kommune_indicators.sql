{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['kommune_nr', 'source_id']},
      {'columns': ['kommune_nr', 'year']},
      {'columns': ['source_id', 'contents_code']}
    ]
  )
}}

-- fact_kommune_indicators — Atlas's first cross-source mart.
--
-- Long-format union of every per-source indicator filtered to kommune level,
-- joined to dim_kommune and dim_fylke for geographic context. One row per
-- (source_id, kommune_nr, year, contents_code).
--
-- Inclusion criteria:
--   - Row-level filter: kommune_nr IS NOT NULL (kommune-resolved rows only)
--   - Must join to an active kommune in dim_kommune (drops historical codes
--     with zero values — they'd pollute the fact with merged-away kommuner)
--
-- Sources excluded for now (different shape; will need source-specific marts):
--   - ssb-07459: has sex + single-year age dimensions; no natural roll-up to
--     one row per (kommune, year, contents)
--   - ssb-12944: has age_group + period (not year); the period text needs a
--     deliberate mapping to year before inclusion
--
-- When those sources are integrated, either extend this mart with new columns
-- or (better) build a source-specific mart that aggregates them.

with ssb_08764 as (
  select
    source_id,
    kommune_nr,
    year,
    contents_code,
    contents_label,
    value,
    status,
    updated_at
  from {{ ref('indicators__ssb_08764') }}
  where kommune_nr is not null
),

ssb_06913 as (
  select
    source_id,
    kommune_nr,
    year,
    contents_code,
    contents_label,
    value,
    status,
    updated_at
  from {{ ref('indicators__ssb_06913') }}
  where kommune_nr is not null
),

all_indicators as (
  select * from ssb_08764
  union all
  select * from ssb_06913
)

select
  i.source_id,
  i.kommune_nr,
  k.kommune_name,
  k.fylke_nr,
  f.fylke_name,
  i.year,
  i.contents_code,
  i.contents_label,
  i.value,
  i.status,
  k.is_active         as kommune_is_active,
  i.updated_at
from all_indicators i
join {{ ref('dim_kommune') }} k using (kommune_nr)
left join {{ ref('dim_fylke')   }} f using (fylke_nr)
