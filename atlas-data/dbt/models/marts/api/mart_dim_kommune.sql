{{
  config(
    materialized='table',
    schema='marts'
  )
}}

-- 🔴 THE TABLE api_v1 HAS BEEN PROMISING SINCE IT WAS WRITTEN.
--
-- Fourteen references in models/marts/api/schema.yml point at dim_kommune —
-- five column descriptions say "FK to dim_kommune" and the rest are
-- `relationships: to: ref('dim_kommune')` tests — and it was not published.
-- A consumer building on the API found it the hard way (urb-agents #1250,
-- finding 4) and called publishing it "the single highest-leverage small
-- addition on this list — every consumer is currently rebuilding it, and each
-- of us is rebuilding it slightly differently."
--
-- ⚠️ What it was reduced to without this: brreg_enhet carries kommune_nr and
-- no kommune_name, so labelling a municipality meant fetching an unrelated
-- indicator view and building a lookup from it. Its canonical kommune list was
-- "whatever ssb-13995 / KOSFolkemengdeia0000 returns" — an SSB
-- social-assistance table doing duty as the municipality registry, and one
-- (source_id, contents_code) pair away from breaking.
--
-- 🔵 fylke_name is joined here rather than left to the consumer, because
-- deriving it is the same lookup every one of them was already improvising.
-- LEFT JOIN: dim_fylke does not carry the pseudo-codes (Svalbard 21xx), and a
-- kommune with an unknown fylke must still appear.
--
-- ⚠️ DELIBERATELY NOT INCLUDED, so nobody reads their absence as an oversight:
--
--   population     time-varying, so it belongs to a (kommune, year) fact and
--                  not to a dimension. Putting one year's figure in a
--                  dimension is how a per-capita chart silently uses the
--                  wrong denominator. Available today as ssb-13995 /
--                  KOSFolkemengdeia0000 via indicator_latest_values.
--   centroid_lat   Atlas does not ingest geography. Kartverket serves it and
--   centroid_lon   we would be republishing a copy that goes stale. Asked for
--                  in finding 9 and it needs a source decision, not a column.
--
-- Historical codes are included with is_active = false, because a consumer
-- joining old data needs them to resolve. Filter `?is_active=is.true` for
-- today's 357.

select
  k.kommune_nr,
  k.kommune_name,
  -- ⚠️ kommune_name_alt IS the Sámi variant where there is one — dim_kommune
  -- splits it out of upstream's "Name - Nama" string. There is no separate
  -- kommune_name_sami column: dimensions/schema.yml documents one and the
  -- model has never emitted it, which is how this wrapper came to reference it
  -- and be rejected by Postgres (urb-agents #1255).
  k.kommune_name_alt,
  k.fylke_nr,
  f.fylke_name,
  k.is_active,
  k.valid_from,
  k.valid_to,
  k.notes,
  -- 🔴 is_active MEANS "THIS CODE IS CURRENT", NOT "THIS IS A MUNICIPALITY",
  -- and a consumer cannot tell those apart without this column.
  --
  -- `?is_active=eq.true` returns 358, not 357: SSB's 9999 'Uoppgitt' bucket is
  -- a current code and not a place. Measured by ops-dev on the live API
  -- (urb-agents #1265). The consumer that found it had its own sentinel filter
  -- and was unaffected — it flagged it for the NEXT consumer.
  --
  -- ⚠️ THIRD SENTINEL IN THE SAME FAMILY, THREE SURFACES, NO SHARED
  -- CONVENTION: 9999 here, 9999 in coverage_gap_barnefattigdom, and 0 in
  -- KOSvedtakaar0000. Each was discovered separately by someone reading rows.
  -- This is the first one to be nameable in a filter rather than tribal
  -- knowledge; whether the other two follow is #700.
  --
  -- 🔵 Appended rather than inserted: api_v1.dim_kommune is CREATE OR REPLACE
  -- VIEW ... SELECT *, which accepts new columns only at the end.
  k.is_sentinel
from {{ ref('dim_kommune') }} k
left join {{ ref('dim_fylke') }} f on f.fylke_nr = k.fylke_nr
order by k.kommune_nr
