{#
  Per-NGO supply counts: chapters by level, kommuner reached, activities.

  🔴 PLAN-003 phase 4.1 — same derived population as `mart_ngo_index`, same union
  for the same reason. See that model's header for why B was taken over A and why
  the curated rows are unioned in rather than filtered for.

  ⚠️ EVERY DERIVED ROW IS ALL ZEROS, AND THAT IS THE HONEST ANSWER. Atlas holds
  chapter and activity data for the curated eleven only, so the ~72,787 rows this
  change adds report `chapter_count = 0` across the board. That is not padding:
  the question this view answers is "how much supply does Atlas know about for
  this organisation", and for an organisation nobody has ingested the answer is
  none. A consumer wanting only organisations with supply filters
  `chapter_count > 0`; one wanting the curated set joins `ngo_index.is_curated`.

  ⚠️ TWO CLOCKS, AND THIS CHANGE CREATED THE SECOND ONE. `dim_brreg_enhet` is
  rebuilt half-hourly by `brreg_transform_job` (`BRREG_TRANSFORM_CRON`,
  :10/:40), whose selection is that one model and nothing downstream of it.
  These two marts are built by `transform_daily` at 05:00. So from today the
  published NGO population lags the register it is derived from by **up to 24
  hours** — a voluntary organisation registered at 06:00 appears in
  `api_v1.brreg_enhet` within the hour and in `api_v1.ngo_index` the next
  morning.

  🔵 Left that way deliberately rather than by omission: a day is an appropriate
  latency for an NGO index, and widening the half-hourly job's selection is a
  cadence decision with its own cost. Written down because a derived view
  silently behind its source is exactly the failure `reconciled_at` was added to
  `dim_brreg_enhet` to make visible, and it would be absurd to reintroduce it one
  layer up without saying so. Raised with ops-dev on urb-agents #815.

  🔴 The `relationships` test on `orgnr` moved from `dim_ngo` to
  `dim_brreg_enhet` in this change. Left against `dim_ngo` it would have failed
  on every derived row — and repointing it is not weakening it: it still asserts
  that every organisation in a published view is one Atlas actually reconciled
  from Brreg, which is the property worth holding.
#}

with population as (

  select organisasjonsnummer as orgnr
  from {{ ref('dim_brreg_enhet') }}
  where registrert_i_frivillighetsregisteret

  union

  select orgnr
  from {{ ref('dim_ngo') }}

),

chapter_stats as (
  select
    ngo_orgnr                                                              as orgnr,
    count(*)::int                                                          as chapter_count,
    count(*) filter (where chapter_level = 'national')::int                as national_count,
    count(*) filter (where chapter_level = 'regional')::int                as regional_count,
    count(*) filter (where chapter_level = 'local')::int                   as local_count,
    count(distinct kommune_nr)
      filter (where kommune_nr is not null and is_active)::int             as kommune_count
  from {{ ref('dim_chapter') }}
  group by ngo_orgnr
),
activity_stats as (
  select ngo_orgnr as orgnr, count(*)::int as activity_count
  from {{ ref('dim_activity') }}
  group by ngo_orgnr
)
select
  p.orgnr,
  coalesce(cs.chapter_count, 0)        as chapter_count,
  coalesce(cs.national_count, 0)       as national_count,
  coalesce(cs.regional_count, 0)       as regional_count,
  coalesce(cs.local_count, 0)          as local_count,
  coalesce(a.activity_count, 0)        as activity_count,
  coalesce(cs.kommune_count, 0)        as kommune_count
from population p
left join chapter_stats  cs on cs.orgnr = p.orgnr
left join activity_stats a  on a.orgnr  = p.orgnr
order by p.orgnr
