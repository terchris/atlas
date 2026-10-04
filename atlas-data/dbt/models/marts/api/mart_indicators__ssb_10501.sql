{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- indicators__ssb_10501 — the per-source indicator relation for `ssb-10501`
-- (first names), published verbatim from its own upstream rather than folded
-- into a cross-source mart.
--
-- 🔴 stability:source. THE COLUMN SET HERE FOLLOWS SSB 10501, NOT ATLAS.
--
-- 🔴 NOT AN EXHAUSTIVE NAME LIST. Only first names used by 200+ persons in
-- Norway at year-end appear here at all. Read `meta_sources` for the full
-- coverage caveat before using this as a lookup for "every Norwegian first
-- name" — it is a reference list, not a census.
--
-- 🔵 A VIEW, not a copy — the indicator model is already a table in marts.

select *
from {{ ref('indicators__ssb_10501') }}
