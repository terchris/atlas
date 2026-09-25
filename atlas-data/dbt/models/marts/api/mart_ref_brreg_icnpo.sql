{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_brreg_icnpo — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- 🔴 THIS IS THE ONE THAT WAS COSTING CONSUMERS MOST. A consumer can already
-- query kommune_ngo_summary and read an ICNPO code out of it, and until now had
-- no way to turn that code into a name — querying without reading.
--
-- 14 main groups + 32 subgroups = 46 rows. `parent_code` is null on a main group
-- and carries the group's code on a subgroup, so the hierarchy is walkable
-- without a second request.
select
  code,
  parent_code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_brreg_icnpo') }}
order by sort_order
