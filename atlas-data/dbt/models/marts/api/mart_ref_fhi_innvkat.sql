{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- ref_fhi_innvkat — published code list, a passthrough over the seed of the same name.
--
-- 🔵 A VIEW, NOT A TABLE. The seed is already a relation in the warehouse, so a
-- view is zero-copy and cannot drift from it. Materialising 9 code lists as
-- tables would copy 122 rows to no purpose and add a way for a published
-- label to disagree with the seed it came from.
--
-- 🔴 READ THIS BEFORE JOINING IT TO ANYTHING NAMED innvkat. ONE ROW: code '0',
-- 'totalt'. That is correct, and it is not the list for the source whose name
-- matches it.
--
-- This decodes INNVKAT **as it appears in FHI table 360** (fhi_vgs_gjennomforing),
-- where the dimension is collapsed and always '0'. A not_null + relationships
-- test on indicators__fhi_vgs_gjennomforing.immigration_category enforces that, so
-- CI fails if any other code ever arrives there.
--
-- ⚠️ IT DOES NOT DECODE indicators__fhi_innvkat. That relation comes from FHI
-- table 932, whose `immigrant_category` holds '2' (innvandrere, 1st-gen), '3'
-- (norskfødte med innvandrerforeldre, 2nd-gen) and '23' (the two combined — a SUM,
-- so excluding it is required before adding categories up). This list decodes none
-- of those three, and joining it to that column returns nothing.
--
-- 🔵 Those three codes ARE published — in `meta_dimensions`. This exact request
-- returns them, verified against the live API on 2026-09-25:
--
--   /meta_dimensions?source_id=eq.fhi-innvkat&code=eq.INNVKAT
--
-- ⚠️ the column is `code`, not `dimension_code`; asking for the latter gets a
-- Postgres 42703 rather than an empty result.
--
-- Stated here because the two names differ by nothing a consumer would notice.
select
  code,
  label_no,
  label_en,
  sort_order
from {{ ref('ref_fhi_innvkat') }}
order by sort_order
