{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_fhi_utdann — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- FHI UTDANN (education-level) labels.
--
-- ⚠️ In fhi_vgs_gjennomforing this dimension is the PARENTS' education, not the
-- pupil's — the table breaks completion down by parental education. The indicator
-- relation aliases it `parents_education` for that reason; this list decodes it.
--
-- ⚠️ label_en is empty for every row. FHI publishes these labels in Norwegian
-- only, and Atlas does not translate upstream values.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_fhi_utdann') }}
order by sort_order
