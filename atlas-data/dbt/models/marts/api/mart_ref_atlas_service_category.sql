{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_atlas_service_category — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- ⚠️ ATLAS'S OWN VOCABULARY, NOT AN UPSTREAM STANDARD — the only list here that
-- is Atlas's editorial judgement rather than somebody else's published standard.
-- It exists because no Norwegian authority publishes a cross-NGO service
-- taxonomy, and cross-organisation questions need one. A consumer should weigh
-- it accordingly: the other eight lists are citable to their publisher, this one
-- is citable to Atlas.
--
-- 🔴 GREW FROM 22 TO 38 ROWS 2026-10-06 (INVESTIGATE-ngo-activity-taxonomy.md).
-- Same seed, same mart, same published shape — every existing consumer (the
-- INNER JOINs in mart_activity_catalog.sql and mart_kommune_local_chapters.sql,
-- the relationships test on dim_activity.service_category_code) keeps working
-- unchanged against the richer vocabulary. All 22 original codes are unchanged;
-- 16 are new. search_terms_no/need_terms_no/volunteer_terms_no are real,
-- validated Google Keyword Planner evidence — what people actually search
-- for — not Atlas's own guess at a label.
select
  code,
  family_code,
  label_no,
  label_en,
  description,
  description_no,
  sort_order,
  search_terms_no,
  need_terms_no,
  volunteer_terms_no,
  terms_en,
  label_no_evidence,
  en_measured,
  search_entry,
  previous_label_no
from {{ ref('ref_atlas_service_category') }}
order by sort_order
