{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_un_sdg — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- The 17 UN Sustainable Development Goals. Hand-curated and pinned — the goals
-- do not change. The 169 sub-targets are deliberately not here; they would be a
-- separate list and nothing in Atlas references them yet.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_un_sdg') }}
order by sort_order
