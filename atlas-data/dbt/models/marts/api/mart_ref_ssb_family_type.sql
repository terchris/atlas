{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_ssb_family_type — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- SSB family-type codes. ⚠️ Family type and household type are different
-- classifications with overlapping-looking codes — see ref_ssb_household_type and
-- do not join one to the other.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_ssb_family_type') }}
order by sort_order
