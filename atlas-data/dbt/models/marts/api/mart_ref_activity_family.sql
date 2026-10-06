{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_activity_family — published code list, a passthrough over the seed of the same name.
-- Added 2026-10-06, INVESTIGATE-ngo-activity-taxonomy.md.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. 10 rows.
--
-- ⚠️ ATLAS'S OWN GROUPING, NOT AN UPSTREAM STANDARD — same status as
-- ref_atlas_service_category, which this decodes family_code for.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_activity_family') }}
order by sort_order
