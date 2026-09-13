{#
  The NGO index: one row per curated NGO, with supply decorations.

  🔵 WIDENING THIS TO THE WHOLE VOLUNTARY SECTOR WAS CONSIDERED AND DECLINED.
  PLAN-003 phase 4.1, settled 2026-09-13 (urb-agents #815). Read this before
  proposing it again — the population is available and the reason not to use it
  here is not inertia.

  `api_v1.brreg_enhet` already publishes all ~1.17M organisations with
  `registrert_i_frivillighetsregisteret`, `icnpo_kategori`, `kommune_nr` and
  `is_active`. So "which voluntary organisations are active in kommune X" is one
  filtered request today, and pointing THIS view at the same ~72,798 rows adds no
  capability: it moves mechanical rows into the endpoint whose entire
  distinguishing feature is the editorial columns they would be null in. Two
  surfaces with two purposes — one editorial, one exhaustive — rather than one
  that is neither.

  ⚠️ ICNPO is the measurement behind that, not a preference: 46 categories
  (`ref_brreg_icnpo`) over ~72,798 organisations is ~1,580 per category at the
  mean. A fine instrument for "which sector", a blunt one for "works on child
  poverty". The population problem is solved mechanically; the classification
  problem stays editorial, and this view is the editorial surface.

  🔴 IF SOMEONE DOES WIDEN IT LATER, TWO THINGS ARE ALREADY KNOWN AND BOTH BITE
  SILENTLY.

  ① `has_supply` IS NOT THE CURATED/DERIVED DISCRIMINATOR, though it looks like
  one. It is `chapter_count > 0`, computed from `dim_chapter` — it answers "does
  Atlas HOLD chapter data for this organisation", an ingest outcome. The question
  a widened view needs answered is "has anyone WRITTEN THIS ORGANISATION UP", an
  editorial fact. They agree today only by coincidence: all eleven curated NGOs
  declare `has_chapters: true`, so all eleven are expected to carry chapters. The
  first NGO curated before its chapters are ingested makes them disagree, and a
  consumer filtering on `has_supply` loses it without an error. Two questions that
  share an answer today are still two questions — a widened view needs an explicit
  `is_curated`, derived from `dim_ngo` membership, which cannot drift.

  ② A SECOND CLOCK APPEARS THE MOMENT THIS VIEW DEPENDS ON `dim_brreg_enhet`.
  That dimension is rebuilt half-hourly by `brreg_transform_job`, whose selection
  is that one model and nothing downstream of it. This mart is built at 05:00 by
  `transform_daily`. So a derived population here would lag the register it is
  derived from by up to 24 hours — an organisation registered at 06:00 appearing
  in `api_v1.brreg_enhet` within the hour and here the next morning. Fixable in a
  line by widening the half-hourly job's selection, but it is a cadence decision
  with its own cost and it must be taken deliberately. A derived view silently
  behind its source is exactly the failure `reconciled_at` was added to
  `dim_brreg_enhet` to expose.

  🔵 Widening `dim_ngo` itself — rather than this view — remains available to
  Terje as a product decision. It is not pending and nobody is waiting on it. Its
  cost is recorded in PLAN-003 phase 4: nine dbt tests, including `unique(slug)`
  over Brreg names that are not unique, and two closed `accepted_values`
  vocabularies with no `unknown` member.
#}

select
  n.orgnr,
  n.slug,
  n.name,
  n.brand_name,
  n.website_url,
  n.tier,
  n.chapter_data_shape,
  n.has_chapters,
  n.primary_focus,
  n.icnpo_code_1,
  n.icnpo_code_2,
  n.icnpo_code_3,
  coalesce(c.chapter_count, 0)::int as chapter_count,
  coalesce(c.chapter_count, 0) > 0   as has_supply
from {{ ref('dim_ngo') }} n
left join (
  select ngo_orgnr, count(*) as chapter_count
  from {{ ref('dim_chapter') }}
  where is_active
  group by ngo_orgnr
) c on c.ngo_orgnr = n.orgnr
order by n.name
