{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- dim_postnummer — Norwegian postal codes resolved to a primary kommune.
-- 5 122 rows. The lookup that turns an address into a kommune_nr without
-- name-matching ambiguity, which is why Atlas holds it at all: postal codes do
-- not carry the municipal-merger ambiguity that names do.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠️ PROVENANCE, AND A GAP A CONSUMER SHOULD KNOW ABOUT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Upstream is Bring's weekly Postnummerregister — a free Windows-1252 TSV at
-- bring.no/postnummerregister-ansi.txt. Atlas fetches it with a seed-refresh
-- script and commits the result as a seed.
--
-- 🔴 IT IS THEREFORE NOT IN meta_sources, AND NO LICENCE IS RECORDED FOR IT.
-- Atlas's 42 ingested sources each declare one — 42 of them NLOD — because an
-- ingested source has a manifest with a `license` field. A seed-source has no
-- manifest, so this relation is the one published thing in Atlas whose licence
-- a consumer cannot look up. That is a gap in Atlas's records, not a statement
-- that the data is unlicensed: Bring publishes the register for free use.
--
-- ⚠️ A consumer redistributing this should check Bring's own terms rather than
-- infer NLOD from the rest of the catalogue. Flagged to Terje on urb-agents
-- #1547; stated here because the relation outlives the thread.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 ONE POSTNUMMER, ONE KOMMUNE — AND THAT IS A SIMPLIFICATION
-- ══════════════════════════════════════════════════════════════════════════
--
-- A few postnummer span more than one kommune. This table carries only the
-- PRIMARY one, so a join through it is a good default and not a ground truth:
-- resolving an address in one of those codes can attribute it to the wrong
-- municipality. Atlas does not know which rows those are — Bring's register as
-- fetched does not mark them — so the honest statement is that the column is
-- single-valued by construction, not that the mapping is unambiguous.

select
  postnummer,
  post_office,
  kommune_nr,
  sort_order
from {{ ref('dim_postnummer') }}
order by postnummer
