{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['code', 'valid_from']}
    ]
  )
}}

-- dim_ssb_klass_kommune — SSB Klass classification 131's full code history,
-- typed, with the KLASS version id(s) each period falls inside. urb-agents
-- #2098/#2099 (R6).
--
-- 🔵 "WITH SAMI FORMS" NEEDS NO SEPARATE FETCH. The request's own field list
-- says "name (with Sami forms)" as if that needed special handling. It
-- doesn't: SSB's `language=sme` is not a supported value at all (confirmed
-- live, 2026-11-08: HTTP 400, "No enum constant ... Language.SME") — Klass
-- has never published a Sami-language variant of this classification.
-- What the request is really pointing at is already inside the ordinary
-- `nb` `name` field: 29 of 358 active kommuner (measured 2026-11-08) carry
-- Kartverket-style combined names like "Aarborte - Hattfjelldal" verbatim in
-- `name`, the same way kartverket_kommune's kommune_navn does. Nothing here
-- strips or re-splits that string.
--
-- 🔴 klass_version_id IS AN ARRAY, NOT A SCALAR. Neither /codes.json nor
-- /codesAt.json carries a version id on a code (checked the raw response
-- keys directly) — the only place a version id exists is a classification's
-- own /classifications/131.json, as a `versions` array with its own
-- validFrom/validTo (raw.ssb_klass_versions, populated by
-- ingest/src/sources/ssb-klass-kommuner alongside its own code fetch). A
-- code's own validity window does not line up 1:1 with a classification
-- version's window — a code that never changed can sit inside several
-- consecutive versions untouched — so the join is one-to-many by
-- construction, not an oversight.
select
  k.code,
  k.name,
  k.valid_from_in_range as valid_from,
  k.valid_to_in_range as valid_to,
  (
    select array_agg(v.version_id order by v.valid_from)
    from {{ source('raw', 'ssb_klass_versions') }} v
    where v.classification_id = '131'
      and v.valid_from < coalesce(k.valid_to_in_range, 'infinity'::date)
      and coalesce(v.valid_to, 'infinity'::date) > k.valid_from_in_range
  ) as klass_version_id,
  k.loaded_at
from {{ source('raw', 'ssb_klass_kommuner') }} k
