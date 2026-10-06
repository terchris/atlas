{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- mart_ngo_chapter_subunits — published, 2026-10-06 (PLAN-atlas-as-provider phase 2, same
-- instruction as mart_ngo_chapter_registry_match — see that model's header).
--
-- The local units of the two UNITARY NGOs (Frelsesarmeen, Kirkens Bymisjon), found as Brreg
-- underenheter of their own national enhet. Unlike mart_ngo_chapter_registry_match's name-pattern
-- approach, `confidence` is always `high` here by construction — Brreg's own `overordnetEnhet`
-- field is a declared structural link, not a fuzzy name match, so there is no tier to publish.
--
-- ⚠️ Still registry-only in a different sense: reads the underenheter BOOTSTRAP SNAPSHOT only
-- (no incremental reconciliation model exists yet — see int_ngo_chapter_subunits.sql's own header
-- for the known gap), and `unit_name`'s area-splitting is simplified to a literal "AVD" suffix
-- extraction, not the full spec rule. Neither gap affects `confidence` — both are about
-- freshness/completeness, not about whether a given row's parent link is real.
--
-- A VIEW, not a copy: the model it wraps is already a relation in marts.

select * from {{ ref('int_ngo_chapter_subunits') }}
