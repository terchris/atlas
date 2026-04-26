{{ config(materialized='view', schema='marts') }}

-- supply__redcross_chapter_kommune_coverage — inferred coverage for Red Cross
-- distrikter. For each regional chapter, emit one row per kommune_nr served
-- by one or more of its local-level children. source = 'inferred' (per
-- INVESTIGATE-multi-ngo-supply-model-extensions §C.3).
--
-- Includes inactive local chapters deliberately: a distrikt that historically
-- covered kommune X via a now-inactive local still legitimately maps to that
-- kommune for historical queries. See INVESTIGATE §C.6 + PLAN-001 Implementation
-- Notes for when to revisit.

with regional as (
  select chapter_id
  from {{ ref('dim_chapter') }}
  where ngo_orgnr = '864139442'
    and chapter_level = 'regional'
),
child_coverage as (
  select
    c.parent_chapter_id as chapter_id,
    c.kommune_nr,
    max(c.updated_at)   as updated_at
  from {{ ref('dim_chapter') }} c
  where c.parent_chapter_id is not null
    and c.kommune_nr is not null
    and c.chapter_level = 'local'
  group by c.parent_chapter_id, c.kommune_nr
)
select
  cc.chapter_id,
  cc.kommune_nr,
  'inferred'::text as source,
  cc.updated_at
from child_coverage cc
join regional r on r.chapter_id = cc.chapter_id
