{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- indicators__udir_nasjonale_prover — the per-source indicator relation for
-- `udir-nasjonale-prover`, published verbatim from its own upstream rather than folded into a
-- cross-source mart.
--
-- 🔴 stability:source. THE COLUMN SET HERE FOLLOWS UDIR-NASJONALE-PROVER, NOT ATLAS.
-- If the publisher adds, renames or drops a dimension, this relation changes
-- with it. That is the deliberate trade for getting the source's real grain —
-- and it is exactly the property `api_v1`'s curated relations are designed NOT
-- to have. Read `meta_endpoints` for the tag, and prefer a `stability:curated`
-- relation if you need a shape Atlas promises to hold still.
--
-- 🔵 Codes are codes. Decode them through `meta_dimensions` filtered to
-- source_id=udir-nasjonale-prover.
--
-- 🔵 A VIEW, not a copy — the indicator model is already a table in marts.

select *
from {{ ref('indicators__udir_nasjonale_prover') }}
