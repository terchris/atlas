{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_ngo_chapter_registry_match — published, 2026-10-06 (PLAN-atlas-as-provider phase 2,
-- Terje's instruction: "there was 11 ngos with data... publish what we have, we will improve on
-- it later").
--
-- 🔴 READ THIS BEFORE USING THIS RELATION. REGISTRY-ONLY, NOT SITE-VERIFIED.
--
-- These are the 9 federated NGOs' chapters, found by name-pattern matching against Brreg's own
-- organisation register (dim_brreg_enhet) — not by reading each NGO's own published chapter
-- list. `confidence` is real and carried through unhidden: it tops out at `medium` here (`high`
-- only for the NGO's own national row, chapter_orgnr = ngo_orgnr). A `medium`-confidence row is a
-- strong name match, not a confirmed one — no NGO's own website has been crawled yet to
-- corroborate it. See int_ngo_chapter_registry_match.sql for the full matching method and the two
-- real Postgres-regex/NULL-handling bugs found building it.
--
-- A later PLAN (int_ngo_chapter_reconciled, not started) joins this against each NGO's own site
-- crawl and can raise confidence to `high`. Until then, treat a `low`/`medium` row as "the
-- registry's best guess", not as "Atlas confirmed this is a real, currently-operating chapter."
--
-- A VIEW, not a copy: the model it wraps is already a relation in marts.

select * from {{ ref('int_ngo_chapter_registry_match') }}
