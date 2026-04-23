{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['chapter_id']},
      {'columns': ['activity_id']},
      {'columns': ['kommune_nr']},
      {'columns': ['ngo_orgnr']},
      {'columns': ['ngo_orgnr', 'kommune_nr']},
    ]
  )
}}

-- fact_chapter_activities — one row per (chapter, activity) for every NGO.
--
-- The supply-side fact. Joins per-NGO supply__<ngo>_branch_activities to
-- dim_chapter and dim_activity to populate chapter_id and activity_id.
-- Filtered to is_service = true so that admin/governance/recruitment
-- activities don't surface here.
--
-- The Coverage-gap query (Section E of INVESTIGATE-ngo-supply-data-model)
-- joins this to dim_activity for service_category_code and to dim_chapter
-- for is_active + chapter_level + kommune_nr filters.

with all_supply_activities as (
  -- One UNION ALL clause per NGO. PLAN-002 lands Red Cross; PLAN-003 will
  -- add Folkehjelp here.
  select * from {{ ref('supply__redcross_branch_activities') }}
),

with_ids as (
  select
    sa.chapter_id,
    da.activity_id,
    sa.ngo_orgnr,
    dc.kommune_nr,
    sa.local_activity_name,
    -- Activity at this chapter's "active" status. v1: inherits the chapter's
    -- is_active flag (no per-activity dormancy modelled). When that
    -- distinction matters, add a separate column on supply__* and propagate.
    dc.is_active,
    sa.canonical_name,
    'redcross-branches'::text                       as source_id,
    sa.updated_at
  from all_supply_activities sa
  join {{ ref('dim_chapter') }} dc
    on sa.chapter_id = dc.chapter_id
  join {{ ref('dim_activity') }} da
    on da.ngo_orgnr = sa.ngo_orgnr
   and da.canonical_name = sa.canonical_name
  where sa.is_service = true
)

select * from with_ids
