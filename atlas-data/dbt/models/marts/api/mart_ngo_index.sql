{#
  The NGO index: one row per organisation Atlas treats as an NGO.

  🔴 PLAN-003 phase 4.1 — the population is DERIVED, the editorial fields are CURATED.

  Until 2026-09-13 this read `from dim_ngo` and returned exactly the eleven
  federations someone had typed into `seeds/dim_ngo.csv`. It now draws its
  population from `dim_brreg_enhet` filtered to
  `registrert_i_frivillighetsregisteret` — ~72,798 organisations, reconciled from
  Brreg every half hour — and left-joins the curated seed for the fields no
  register carries.

  ⚠️ Option A was to widen `dim_ngo` itself. ops-dev took B (urb-agents #815) so
  the curated dimension keeps its contract: `unique(slug)` over names that are
  NOT unique in Brreg, and the closed `accepted_values` vocabularies for `tier`
  and `primary_focus`, neither of which has an `unknown` member. B also keeps the
  six inbound `relationships` tests pointing at `dim_ngo.orgnr` meaning what they
  were written to mean — "a chapter belongs to a CURATED NGO", not "to any
  voluntary organisation".

  🔴 THE POPULATION IS A UNION, NOT A FILTER. Every `dim_ngo` row is included
  whether or not the register currently flags it voluntary. A curated NGO that
  Brreg has not flagged — or that is mid-reconciliation — must not silently leave
  a published view, and 4.3's gate is precisely that the eleven survive. Deriving
  by filter alone would make that gate depend on the register agreeing with the
  seed on any given half hour.

  ⚠️ WHAT A DERIVED ROW DOES NOT HAVE. `slug`, `website_url`, `tier`,
  `chapter_data_shape`, `has_chapters`, `primary_focus` and `icnpo_code_*` are
  editorial and are NULL for the ~72,787 rows nobody has curated. Their `not_null`
  tests were removed in the same change — a test asserting a column that is null
  by design is not protecting anything. `unique(slug)` stays: dbt's unique test
  ignores NULLs, so it still catches a real collision among the curated.

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

  🔵 Register-sourced attributes are deliberately NOT copied here. A consumer
  wanting kommune, ICNPO category or bankruptcy status joins `api_v1.brreg_enhet`
  on `orgnr`. Two endpoints with two purposes — one editorial, one exhaustive —
  rather than one that is neither.
#}

with population as (

  -- Union, not filter: see the header. `union` de-duplicates, and both branches
  -- project a single column, so an orgnr in both appears once.
  select organisasjonsnummer as orgnr
  from {{ ref('dim_brreg_enhet') }}
  where registrert_i_frivillighetsregisteret

  union

  select orgnr
  from {{ ref('dim_ngo') }}

),

chapters as (
  select ngo_orgnr, count(*) as chapter_count
  from {{ ref('dim_chapter') }}
  where is_active
  group by ngo_orgnr
)

select
  p.orgnr,
  n.slug,
  -- ⚠️ Curated name FIRST, register name as the fallback — not the other way
  -- round. Both are Brreg legal names, but taking the register's would change
  -- the published `name` of the eleven on the day this ships, and 4.3 verifies
  -- they come through unchanged. Derived rows have only one source anyway.
  coalesce(n.name, b.navn)           as name,
  n.brand_name,
  n.website_url,
  n.tier,
  n.chapter_data_shape,
  n.has_chapters,
  n.primary_focus,
  n.icnpo_code_1,
  n.icnpo_code_2,
  n.icnpo_code_3,
  coalesce(c.chapter_count, 0)::int  as chapter_count,
  coalesce(c.chapter_count, 0) > 0   as has_supply,
  -- 🔴 THE DISCRIMINATOR, AND WHY IT IS NOT `has_supply`.
  --
  -- ops-dev's note on #815 said `has_supply = true` already separates the
  -- curated eleven, so no new column is needed. That is true today and true by
  -- coincidence: all eleven declare `has_chapters: true` in the seed, so all
  -- eleven are expected to carry chapters. But `has_supply` is computed from
  -- `dim_chapter` — it answers "does Atlas HOLD chapter data for this
  -- organisation", which is an ingest outcome, not "is this organisation
  -- curated", which is an editorial fact. The first NGO curated before its
  -- chapters are ingested makes them disagree, and a consumer filtering on
  -- `has_supply` silently loses it.
  --
  -- Two questions that happen to share an answer are still two questions. This
  -- one is answered from the seed's membership directly and cannot drift.
  (n.orgnr is not null)             as is_curated
from population p
left join {{ ref('dim_brreg_enhet') }} b on b.organisasjonsnummer = p.orgnr
left join {{ ref('dim_ngo') }} n          on n.orgnr              = p.orgnr
left join chapters c                      on c.ngo_orgnr          = p.orgnr
order by coalesce(n.name, b.navn)
