{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- dim_chapter — Atlas's canonical local-chapter dimension. Today every row is Røde Kors's; the shape is Atlas's and is meant to hold other NGOs' chapters unchanged.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 READ THIS BEFORE USING THIS RELATION. IT IS NOT LIKE THE REST OF ATLAS.
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. A STATIC DUMP, NOT A LIVE FEED. The upstream is a one-off export taken on
--    2026-04-21: `raw.redcross_branches` is 392 rows from it and
--    `raw.redcross_branch_activities` about 2 400 from the same file (stated in
--    migration 022, not inferred). Nothing refreshes it. ⚠️ A consumer must not
--    read a figure here as current — it describes Norges Røde Kors as of April
--    2026 and will not move on its own.
--
-- 2. 🔴 IT IS SERVING ZERO ROWS TODAY, AND THAT IS EXPECTED. The dump has never
--    been loaded: the `redcross-branches` ingest is held on a credential, so
--    `raw` is empty and every relation below it is empty too. Measured on the
--    live API 2026-09-25: activity_catalog, distrikt_summary and
--    kommune_local_chapters all return `Content-Range: */0`. THIS IS NOT A
--    BROKEN ENDPOINT and not a failed deploy — it is a source that has not
--    arrived. When the hold lifts the rows appear here with no further change.
--
-- 3. ⚠️ ATLAS HOLDS NO REPUBLICATION LICENCE FOR THIS DATA. Most of Atlas is
--    Norwegian public data under NLOD, which anyone may redistribute. This is
--    not: it is Norges Røde Kors's own operational record of its branches and
--    what they do. It is published on the OWNER'S STATED WISH — "the consumer
--    must be able to query all datasets" — and a wish is not a licence. A
--    consumer redistributing it is not covered by NLOD and should ask Røde
--    Kors.
--
--    🔵 Provenance of that instruction, recorded deliberately: it reached
--    Atlas RELAYED THROUGH THE DEMO CONSUMER rather than directly from Røde
--    Kors. Anyone reading this later should weigh it as such. The decision to
--    publish was Terje's, on urb-agents #1402/#1547, with that provenance in
--    front of him.
--
-- 🔵 And publication is a one-way door: served data is cached and indexed
--    regardless of any later retraction. That was weighed before shipping, not
--    after.
-- ══════════════════════════════════════════════════════════════════════════

-- 🔵 A VIEW, not a copy: the model it wraps is already a relation in marts.

select *
from {{ ref('dim_chapter') }}
