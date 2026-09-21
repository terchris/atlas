{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- Population by kommune, year and age band — the denominator layer.
--
-- 🔴 A CONSUMER WROTE A README APOLOGY BECAUSE THIS DID NOT EXIST, AND THE DATA
-- WAS BEING REFRESHED NIGHTLY THE WHOLE TIME.
--
-- ssb-07459 (210 728 rows) has been ingested, current and stored for months.
-- `GET /ssb-07459` returns 404 because nothing downstream of raw ever read it,
-- so the consumer built its Omsorg view around care USERS instead of elderly
-- RESIDENTS and documented, in its own README, that this flatters a kommune
-- with a high threshold for granting services (ops-dev, urb-agents #1281).
--
-- ⚠️ It was reported to us as "one publish fixes it". It does not: there was no
-- mart to publish. ssb-07459 carries sex and SINGLE-YEAR age, which is why it
-- was excluded from fact_kommune_indicators — that fact's grain is
-- (source, kommune, year, contents_code) and there is no natural roll-up to it.
-- The exclusion note said "a 67+ total is a defensible one and nobody has
-- chosen it". This model does not choose it.
--
-- ✅ WHY BANDS RATHER THAN A THRESHOLD. Picking 67+ would be an editorial claim
-- dressed as arithmetic — the same thing the consumer refused to do when it
-- excluded the crime series from its need index. Publishing the bands leaves
-- the claim with whoever makes it, and costs nothing: the bands are the
-- denominator for old-age capacity, child poverty and working-age dependency
-- alike.
--
-- ⚠️ SIX BANDS SUM TO THE TOTAL. TWO DO NOT — THEY ARE ROLL-UPS OF THE SIX.
--
--     sum to befolkning_total:  0_5 · 6_15 · 16_17 · 18_66 · 67_79 · 80_plus
--     roll-ups, DO NOT ADD:     0_17 (= 0_5 + 6_15 + 16_17)
--                               67_plus (= 67_79 + 80_plus)
--
-- They are here because PostgREST has aggregates disabled — `?select=sum()`
-- returns PGRST123 — so a consumer wanting "children" or "elderly" would
-- otherwise fetch the bands and add them client-side. That is the defect fixed
-- in kommune_ngo_totals (#1265), not repeated here.
--
-- 🔴 SEX IS FILTERED, NOT SUMMED. SSB's Kjonn dimension codes '0' as ALL, and
-- decode_sex maps it to 'all' — so summing every sex row would double the
-- population of every kommune in Norway. This selects male and female
-- explicitly. It is the same shape of defect as the `personer` description that
-- overstated child poverty ninefold (#1250), caught before shipping this time
-- rather than by a consumer.

with banded as (
  select
    p.kommune_nr,
    p.year,
    -- The six disjoint bands. age_min rather than age_int: age_int is NULL for
    -- the open-ended '105+' bucket, which would silently drop those people.
    sum(p.value) filter (where p.age_min between  0 and   5) as alder_0_5,
    sum(p.value) filter (where p.age_min between  6 and  15) as alder_6_15,
    sum(p.value) filter (where p.age_min between 16 and  17) as alder_16_17,
    sum(p.value) filter (where p.age_min between 18 and  66) as alder_18_66,
    sum(p.value) filter (where p.age_min between 67 and  79) as alder_67_79,
    sum(p.value) filter (where p.age_min >= 80)              as alder_80_plus,
    sum(p.value)                                             as befolkning_total
  from {{ ref('indicators__ssb_07459') }} p
  where p.kommune_nr is not null
    and p.sex in ('male', 'female')
  group by p.kommune_nr, p.year
)

select
  b.kommune_nr,
  k.kommune_name,
  k.fylke_nr,
  f.fylke_name,
  b.year,
  coalesce(b.alder_0_5,     0)::int as alder_0_5,
  coalesce(b.alder_6_15,    0)::int as alder_6_15,
  coalesce(b.alder_16_17,   0)::int as alder_16_17,
  coalesce(b.alder_18_66,   0)::int as alder_18_66,
  coalesce(b.alder_67_79,   0)::int as alder_67_79,
  coalesce(b.alder_80_plus, 0)::int as alder_80_plus,
  (coalesce(b.alder_0_5, 0) + coalesce(b.alder_6_15, 0)
     + coalesce(b.alder_16_17, 0))::int                as alder_0_17,
  (coalesce(b.alder_67_79, 0) + coalesce(b.alder_80_plus, 0))::int as alder_67_plus,
  coalesce(b.befolkning_total, 0)::int as befolkning_total
from banded b
join {{ ref('dim_kommune') }} k
  on k.kommune_nr = b.kommune_nr
 and k.is_active
-- LEFT, not inner: dim_kommune holds Svalbard-style 21xx codes whose fylke_nr
-- has no row in dim_fylke, and fact_kommune_indicators already documents that.
-- An inner join here would drop those kommuner from the denominator entirely,
-- which is a worse failure than a null fylke_name.
left join {{ ref('dim_fylke') }} f
  on f.fylke_nr = k.fylke_nr
order by b.kommune_nr, b.year
