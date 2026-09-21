{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- The part of a published quantity that belongs to no municipality.
--
-- 🔴 ATLAS HAD NO CONVENTION FOR THIS AND THE TWO SURFACES THAT MET IT CHOSE
-- OPPOSITE WRONG ANSWERS.
--
--     sentinels    SSB's 9999 'Uoppgitt' is IN a per-kommune relation and
--                  corrupts any sum over it
--     the 10% gap  7 488 active voluntary units with no kommune_nr are OUT of
--                  a per-kommune relation and vanish silently
--
-- One smuggles the remainder in as a row; the other discards it. A consumer
-- summing either gets a number that is wrong in a direction it cannot see.
-- Three sentinels of the same family were found on three surfaces by three
-- separate routes before anyone named the pattern (urb-agents #700, #1250,
-- #1265).
--
-- ✅ THE POSITION, AND TERJE AUTHORISED IT ON 2026-09-21: the VALUE belongs,
-- the ROW does not. A per-kommune relation carries only kommuner. The
-- remainder gets its own named surface — this one — so that reconciling to a
-- national total is a deliberate act with a name, instead of an accident of
-- whether a sentinel happened to survive a filter.
--
-- ⚠️ WHAT THIS IS NOT. It does not remove the 9999 rows from dim_kommune or
-- coverage_gap_barnefattigdom. That is a BREAKING change to a published
-- contract — `?is_active=eq.true` would return 357 instead of 358 with no
-- warning — and it is deliberately not bundled with an additive one. Adding a
-- relation nobody uses is ignorable; deleting rows breaks a consumer who never
-- read the thread. `is_sentinel` remains the stopgap it was shipped as, and
-- this view does not make the trap gone either.
--
-- 🔵 A ZERO ROW IS A RESULT. Where the remainder is genuinely nothing, this
-- emits 0 rather than omitting the row — "we checked, none" and "nobody
-- checked" are different answers and a missing row cannot tell them apart.

with voluntary as (
  -- The brreg gap. Counted from the register rather than from the rollups,
  -- because the rollups are exactly what drops these rows.
  select
    count(*) filter (where kommune_nr is null)::numeric as unattributed,
    count(*)::numeric                                   as total
  from {{ ref('dim_brreg_enhet') }}
  where registrert_i_frivillighetsregisteret
    and is_active
),

barnefattigdom_year as (
  select max(year) as year
  from {{ ref('fact_kommune_indicators') }}
  where source_id = 'ssb-08764' and contents_code = 'Personer'
),

barnefattigdom as (
  -- The sentinel side. `kommune_is_active` does NOT exclude 9999 — that is the
  -- defect this surface exists to make visible rather than to hide.
  select
    y.year,
    coalesce(sum(f.value) filter (where f.kommune_nr = '9999'), 0)::numeric as unattributed,
    coalesce(sum(f.value), 0)::numeric                                      as total
  from {{ ref('fact_kommune_indicators') }} f
  join barnefattigdom_year y on f.year = y.year
  where f.source_id = 'ssb-08764'
    and f.contents_code = 'Personer'
    and f.kommune_is_active
  group by y.year
)

select
  'kommune_ngo_totals'::text            as relation,
  'active_count'::text                  as measure,
  'no_kommune_nr'::text                 as reason,
  'brreg-frivillige'::text              as source_id,
  null::int                             as year,
  v.unattributed::int                   as unattributed_value,
  v.total::int                          as total_value,
  round(100 * v.unattributed / nullif(v.total, 0), 1) as unattributed_share_pct
from voluntary v

union all

select
  'coverage_gap_barnefattigdom'::text,
  'personer'::text,
  'sentinel_9999'::text,
  'ssb-08764'::text,
  b.year,
  b.unattributed::int,
  b.total::int,
  round(100 * b.unattributed / nullif(b.total, 0), 1)
from barnefattigdom b

order by relation, measure
