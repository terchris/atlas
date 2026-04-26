{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['activity_id'], 'unique': True},
      {'columns': ['ngo_orgnr']},
      {'columns': ['service_category_code']},
    ]
  )
}}

-- dim_activity — catalog of services each NGO offers, conformed across NGOs.
-- One row per (NGO, NGO-canonical activity name).
--
-- Carries service_category_code directly (per Q22 of the investigation —
-- replaces the originally proposed crosswalk_activity_to_category table).
-- Cross-NGO Coverage-gap queries pivot on service_category_code; per-NGO
-- reporting pivots on canonical_name (see Section F of the investigation).
--
-- Source: SELECT DISTINCT from per-NGO supply__<ngo>_branch_activities staging
-- models, filtered to is_service = true. PLAN-002 lands the first staging
-- model (Red Cross). PLAN-003 will add Folkehjelp; this model gains a UNION
-- ALL clause then.
--
-- activity_id derivation: '<ngo_slug>-' || slugify(canonical_name).
-- slugify: lowercase, replace Norwegian æ/ø/å with ae/o/a, replace any
-- non-[a-z0-9-] with '-'. Inline via translate() + regexp_replace().

with redcross_distinct as (
  select distinct
    ngo_orgnr,
    canonical_name
  from {{ ref('supply__redcross_branch_activities') }}
  where is_service = true
),

with_id as (
  select
    'redcross-' || regexp_replace(
      translate(lower(canonical_name), 'æøåäöü ', 'eoaaou-'),
      '[^a-z0-9-]+', '', 'g'
    )                                                       as activity_id,
    ngo_orgnr,
    canonical_name,
    -- Re-look-up the service_category_code from the staging model rather than
    -- repeat the giant CASE here. Each (ngo_orgnr, canonical_name) maps to
    -- exactly one service_category_code in the staging layer.
    (select min(service_category_code)
       from {{ ref('supply__redcross_branch_activities') }} sa
      where sa.ngo_orgnr = redcross_distinct.ngo_orgnr
        and sa.canonical_name = redcross_distinct.canonical_name)
                                                            as service_category_code,
    true                                                    as is_active
  from redcross_distinct
)

select * from with_id
