{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_region_kind — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- What kind of region a region_code denotes — the decoder for the `region_kind`
-- column that several indicator relations already expose.
--
-- `code_pattern` is the regex Atlas classifies by, published so a consumer can
-- see the rule rather than reverse-engineer it from examples. `is_kommune` is the
-- one boolean most consumers actually want: it marks the kinds that are real
-- municipalities, which is NOT the same question as "does this code look like a
-- kommune_nr".
select
  region_kind,
  code_pattern,
  is_kommune,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_region_kind') }}
order by sort_order
