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
-- Sources included here pick a sensible kommune-level headline slice when the
-- source has extra dimensions:
--   - ssb-06944: filter to household_type='0000' (all households)
--   - fhi-bor-alene: filter to age_group='16_120' (adults 16+)
--
-- Sources still excluded (different shape; will need source-specific marts):
--   - ssb-07459: has sex + single-year age; no natural 1-row-per-contents roll-up
--   - ssb-12944: period (not year) and age_group; needs a deliberate mapping

with ssb_08764 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_08764') }}
  where kommune_nr is not null
),

ssb_06913 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06913') }}
  where kommune_nr is not null
),

ssb_06944 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06944') }}
  where kommune_nr is not null
    and household_type = '0000'   -- all households; headline
),

fhi_bor_alene as (
  select
    source_id, kommune_nr, year, contents_code,
    contents_label, value, status, updated_at
  from {{ ref('indicators__fhi_bor_alene') }}
  where kommune_nr is not null
    and age_group = '16_120'       -- all adults 16+; headline
),

ssb_13995 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_13995') }}
  where kommune_nr is not null
),

ssb_06947 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06947') }}
  where kommune_nr is not null
),

ssb_06083 as (
  -- Pick all family types; consumers filter. Family_type column dropped
  -- for the fact's narrower shape — gets one row per (region, year,
  -- family_type × contents).
  select
    source_id, kommune_nr, year,
    (contents_code || '_' || family_type) as contents_code,
    coalesce(contents_label, '') || ' (' || family_type || ')' as contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06083') }}
  where kommune_nr is not null
),

ssb_12292 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12292') }}
  where kommune_nr is not null
),

ssb_12063 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12063') }}
  where kommune_nr is not null
),

ssb_12131 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12131') }}
  where kommune_nr is not null
),

ssb_12132 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12132') }}
  where kommune_nr is not null
),

ssb_09429 as (
  -- Filter to sex='all' + generic education level so every kommune has a
  -- single headline row per (region, year, contents_code). Consumers who
  -- want the fine-grained breakdown read indicators__ssb_09429 directly.
  select
    source_id, kommune_nr, year,
    (contents_code || '_' || education_level) as contents_code,
    coalesce(contents_label, '') || ' (nivå ' || education_level || ')' as contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_09429') }}
  where kommune_nr is not null and sex = 'all'
),

all_indicators as (
  select * from ssb_08764
  union all
  select * from ssb_06913
  union all
  select * from ssb_06944
  union all
  select * from fhi_bor_alene
  union all
  select * from ssb_13995
  union all
  select * from ssb_06947
  union all
  select * from ssb_06083
  union all
  select * from ssb_12292
  union all
  select * from ssb_12063
  union all
  select * from ssb_12131
  union all
  select * from ssb_12132
  union all
  select * from ssb_09429
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
