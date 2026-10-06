{{ config(materialized='view', schema='marts') }}

-- supply__redcross_branch_activities — staging passthrough for the per-chapter
-- activity rows from raw.redcross_branch_activities.
--
-- 🔴 RETIRED THE HARDCODED CASE, 2026-10-06 (INVESTIGATE-ngo-activity-taxonomy.md,
-- PLAN-atlas-as-provider phase 3). service_category_code and is_service now
-- come from ref_atlas_activity_crosswalk (ngo = 'redcross'), not a hand-maintained
-- list — adding NGO #12 or recategorising an activity is a seed row, not code.
--
-- ⚠️ EXACT-NAME JOIN, VERIFIED NOT ASSUMED: every one of the old CASE's 51
-- distinct global_activity_name values is present in the crosswalk's redcross
-- rows (checked directly, zero missing) and no name has more than one
-- is_primary = 'true' row (zero fan-out risk). The crosswalk also carries ~200
-- more granular, chapter-level activity names that never appear as a
-- global_activity_name in this source at all — those rows are real and
-- queryable in ref_atlas_activity_crosswalk, they just never match here.
--
-- ⚠️ 7 ACTIVITIES RECLASSIFIED against the old CASE (per the investigation's
-- own "what changes" table, checked against this file before the change):
-- Visitor (elderly_visiting -> prison_reintegration), EVA and Døråpner (not a
-- service -> crisis_shelter / meeting_place, now real services), Habil
-- (family_support -> work_inclusion), Turgruppe (youth_activity_groups ->
-- physical_activity), Møteplasser and Akuttovernatting for bostedsløse
-- tilreisende (-> meeting_place / emergency_shelter).
--
-- is_service is constant across every crosswalk row for a given name
-- (verified: zero names have both 'true' and 'false' rows), so a plain join
-- on name carries it correctly regardless of is_primary.

with src as (
  select * from {{ source('raw', 'redcross_branch_activities') }}
),

crosswalk as (
  select * from {{ ref('ref_atlas_activity_crosswalk') }}
  where ngo = 'redcross'
),

primary_category as (
  select name, service_category_code
  from crosswalk
  where is_primary = 'true'
),

service_flag as (
  select distinct name, is_service
  from crosswalk
),

categorised as (
  select
    'redcross-' || src.branch_id  as chapter_id,
    '864139442'::text             as ngo_orgnr,
    src.global_activity_name      as canonical_name,
    src.local_activity_name,
    pc.service_category_code,
    -- `else true`, matching the old CASE's own default for an activity name
    -- the crosswalk has never seen (a future global_activity_name arriving
    -- before the crosswalk is updated for it).
    coalesce(sf.is_service = 'true', true) as is_service,
    src.loaded_at                 as updated_at
  from src
  left join primary_category pc on pc.name = src.global_activity_name
  left join service_flag sf     on sf.name = src.global_activity_name
)

select * from categorised
