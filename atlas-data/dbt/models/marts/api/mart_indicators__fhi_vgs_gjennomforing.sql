{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- indicators__fhi_vgs_gjennomforing — the per-source indicator relation for `fhi-vgs-gjennomforing`, published
-- verbatim from its own upstream rather than folded into a cross-source mart.
--
-- 🔵 WHY THIS EXISTS ALONGSIDE indicator_latest_values AND indicator_summary.
-- Those two are Atlas's cross-source views: they answer "what is the latest
-- figure per kommune" and "what does this measure cover", and to do that they
-- impose one shape on every source. This relation is the other half — the
-- source's OWN shape, with the dimensions upstream actually publishes. A
-- question that needs a breakdown the cross-source views flatten away (a sex,
-- an age band, a socioeconomic split) can only be answered here.
--
-- 🔴 stability:source. THE COLUMN SET HERE FOLLOWS FHI-VGS-GJENNOMFORING, NOT ATLAS.
-- If the publisher adds, renames or drops a dimension, this relation changes
-- with it. That is the deliberate trade for getting the source's real grain —
-- and it is exactly the property `api_v1`'s curated relations are designed NOT
-- to have. Read `meta_endpoints` for the tag, and prefer a `stability:curated`
-- relation if you need a shape Atlas promises to hold still.
--
-- 🔵 Codes are codes. Decode them through `meta_dimensions` filtered to
-- source_id=fhi-vgs-gjennomforing, and through the published ref_* lists where one exists.
--
-- 🔵 A VIEW, not a copy — the indicator model is already a table in marts.

select *
from {{ ref('indicators__fhi_vgs_gjennomforing') }}
