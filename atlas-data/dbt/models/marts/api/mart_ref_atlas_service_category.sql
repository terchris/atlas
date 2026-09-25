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
select
  code,
  label_no,
  label_en,
  description,
  sort_order
from {{ ref('ref_atlas_service_category') }}
order by sort_order
