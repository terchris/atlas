{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- indicators__ssb_12891 — the per-source indicator relation for `ssb-12891`
-- (surnames used by 200+ persons), published verbatim from its own upstream
-- rather than folded into a cross-source mart. Companion to
-- mart_indicators__ssb_10501 (first names).
--
-- 🔴 stability:source. THE COLUMN SET HERE FOLLOWS SSB 12891, NOT ATLAS.
--
-- 🔴 NOT AN EXHAUSTIVE SURNAME LIST. Only surnames used by 200+ persons
-- appear here at all — the exact threshold Norwegian naming law uses to
-- protect rarer surnames. Read `meta_sources` for the full coverage caveat
-- before using this as a lookup for "every Norwegian surname".
--
-- 🔵 A VIEW, not a copy — the indicator model is already a table in marts.

select *
from {{ ref('indicators__ssb_12891') }}
