{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['chapter_id']},
      {'columns': ['kommune_nr']},
    ]
  )
}}

-- chapter_kommune_coverage — which kommuner each regional chapter serves.
--
-- Link table between dim_chapter (regional rows) and dim_kommune. Local-level
-- chapters do NOT need rows here — their kommune_nr lives on dim_chapter
-- directly. National-level chapters don't get coverage rows either (they
-- conceptually cover all kommuner; represent absence via NULL kommune_nr on
-- dim_chapter).
--
-- source semantics:
--   'declared' — the NGO publishes the region's coverage explicitly.
--                Authoritative. No sources produce this yet in v1.
--   'inferred' — rolled up from child chapters' kommune_nr values. May
--                under-report (a region could cover kommuner with no
--                lokallag).
--
-- Built by UNIONing per-NGO supply__<ngo>_chapter_kommune_coverage staging
-- models. PLAN-001 multi-ngo-supply-model-extensions lands the first one
-- (Red Cross inferred rollup); future per-NGO PLANs add their own UNION ALL
-- clauses here.

with all_coverage as (
  select * from {{ ref('supply__redcross_chapter_kommune_coverage') }}
  -- Future: union all select * from supply__folkehjelp_chapter_kommune_coverage
)
select * from all_coverage
