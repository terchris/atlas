{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_ssb_household_type — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- SSB household-type codes. ⚠️ Codes are ZERO-PADDED TEXT ('0000', '0001'), not
-- integers. A consumer casting them to int and back loses the padding and matches
-- nothing.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_ssb_household_type') }}
order by sort_order
