{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_ssb_nivaa — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- SSB NUS2000 education-level labels for table 09429.
--
-- ⚠️ SORT BY sort_order, NOT BY code. Upstream's own ordering interleaves '11'
-- (Fagskole) between '02a' and '03a', so the codes do not sort into the
-- educational sequence they represent. sort_order carries SSB's order.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_ssb_nivaa') }}
order by sort_order
