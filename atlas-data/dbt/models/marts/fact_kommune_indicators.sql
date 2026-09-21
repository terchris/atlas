{{
  config(
    materialized='table',
    schema='marts',
    indexes=[
      {'columns': ['kommune_nr', 'source_id']},
      {'columns': ['kommune_nr', 'year']},
      {'columns': ['source_id', 'contents_code']}
    ]
  )
}}

-- fact_kommune_indicators — Atlas's first cross-source mart.
--
-- Long-format union of every per-source indicator filtered to kommune level,
-- joined to dim_kommune and dim_fylke for geographic context. One row per
-- (source_id, kommune_nr, year, contents_code).
--
-- Inclusion criteria:
--   - Row-level filter: kommune_nr IS NOT NULL (kommune-resolved rows only)
--   - Must join to an active kommune in dim_kommune (drops historical codes
--     with zero values — they'd pollute the fact with merged-away kommuner)
--
-- Sources included here pick a sensible kommune-level headline slice when the
-- source has extra dimensions:
--   - ssb-06944: filter to household_type='0000' (all households)
--   - fhi-bor-alene: filter to age_group='16_120' (adults 16+)
--
-- Sources still excluded. ⚠️ ALL OF THEM, because a partial list reads as a
-- complete one — an audit found 7 built indicator models absent from this
-- union and could only explain 5 of them from what was written here
-- (urb-agents #1257). A consumer meanwhile built a workaround for data it
-- concluded Atlas did not hold.
--
--   - ssb-07459: has sex + single-year age; no natural 1-row-per-contents
--     roll-up. A 67+ total is a defensible one and nobody has chosen it.
--   - ssb-12944: period (not year) and age_group; needs a deliberate mapping
--   - ssb-08484 / 09405 / 09406: national tables with no kommune dimension —
--     stated below at the crime CTE, by table number rather than model name,
--     which is why an audit looking for model names missed it
--   - ssb-10826: bydel-level, with alphanumeric region codes. The only
--     sub-municipal geography Atlas holds, and it does not fit a kommune
--     fact at all — it needs its own mart, not a union
--   - bufdir-barnefattigdom: 🔴 THE ONE WITH NO REASON. It already produces
--     exactly this shape, including a synthesised contents_code, and it is
--     the headline child-poverty indicator most directorates cite — the
--     subject of Atlas's own flagship collection. It is not unioned and
--     nothing says why.
--
--     ⚠️ Not unioned here because Bufdir RENUMBERS indicators (there is an
--     alias table for the 9 -> 9a/9b split), so the same
--     (kommune, year, contents_code) could appear twice and silently inflate
--     every published indicator surface. The grain test on this model — which
--     has been here since it was written, though I briefly claimed otherwise —
--     makes that a caught failure instead. Union it once that test has been
--     seen green on the cluster with bufdir included.

with ssb_08764 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    -- 🔴 THIS LINE WAS MISSING AND IT BROKE THE BUILD AT MODEL 85. Every other
    -- branch of all_indicators gained window_years; this one did not, so the
    -- UNION had 8 columns against 18 others' 9. ⚠️ My per-CTE script matched
    -- `\n<name> as (` and this is the FIRST cte, written `with ssb_08764 as (`,
    -- so it was invisible to the loop AND to the count that reported "31 CTEs
    -- given window_years, needing a hand: none" (urb-agents #1328).
    -- The catalogue says Tid is a 4-digit year, so 1 is the right value.
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_08764') }}
  where kommune_nr is not null
),

ssb_06913 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_06913') }}
  where kommune_nr is not null
),

ssb_06944 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_06944') }}
  where kommune_nr is not null
    and household_type = '0000'   -- all households; headline
),

fhi_bor_alene as (
  select
    source_id, kommune_nr, year, contents_code,
    contents_label, value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_bor_alene') }}
  where kommune_nr is not null
    and age_group = '16_120'       -- all adults 16+; headline
),

ssb_13995 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_13995') }}
  where kommune_nr is not null
),

ssb_06947 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_06947') }}
  where kommune_nr is not null
),

ssb_06083 as (
  -- Pick all family types; consumers filter. Family_type column dropped
  -- for the fact's narrower shape — gets one row per (region, year,
  -- family_type × contents). Synthetic contents_label uses the Norwegian
  -- label from ref_ssb_family_type (joined upstream in indicators__ssb_06083).
  select
    source_id, kommune_nr, year,
    (contents_code || '_' || family_type) as contents_code,
    coalesce(contents_label, '') || ' (' || family_type_label_no || ')' as contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_06083') }}
  where kommune_nr is not null
),

ssb_12292 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_12292') }}
  where kommune_nr is not null
),

ssb_12063 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_12063') }}
  where kommune_nr is not null
),

ssb_12131 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_12131') }}
  where kommune_nr is not null
),

ssb_12132 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_12132') }}
  where kommune_nr is not null
),

fhi_mobbing as (
  -- Headline: both grades combined (TRINN='7' then '10'), RATE only.
  -- Downstream can filter per grade via indicators__fhi_mobbing.
  select
    source_id, kommune_nr, year,
    (contents_code || '_grade' || grade) as contents_code,
    coalesce(contents_label, '') || ' (' || grade || '. trinn)' as contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_mobbing') }}
  where kommune_nr is not null
    and contents_code = 'RATE'
),

fhi_vgs as (
  -- Headline: sex='all', parents_education='0' (all), immigration_category='0'
  -- (all), RATE only. Detailed slices still available in
  -- indicators__fhi_vgs_gjennomforing.
  select
    source_id, kommune_nr, year,
    contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_vgs_gjennomforing') }}
  where kommune_nr is not null
    and sex = 'all'
    and parents_education = '0'
    and immigration_category = '0'
    and contents_code = 'RATE'
),

fhi_trangbodd as (
  -- Headline slice: overcrowded-housing share for all ages × all parental
  -- education levels. Detailed breakdowns live in indicators__fhi_trangbodd.
  select
    source_id, kommune_nr, year,
    contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_trangbodd') }}
  where kommune_nr is not null
    and age_group = '0_120'
    and parents_education = '0'
    and housing_status = 'trangt'
),

ssb_09429 as (
  -- Filter to sex='all' + generic education level so every kommune has a
  -- single headline row per (region, year, contents_code). Consumers who
  -- want the fine-grained breakdown read indicators__ssb_09429 directly.
  -- Synthetic contents_label uses the Norwegian Nivaa label.
  select
    source_id, kommune_nr, year,
    (contents_code || '_' || education_level) as contents_code,
    coalesce(contents_label, '') || ' (' || education_level_label_no || ')' as contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_09429') }}
  where kommune_nr is not null and sex = 'all'
),

ssb_crime_tables_08487 as (
  -- SSB 08487 only: reported offences by gjerningssted (kommune). National
  -- tables 08484 / 09405 / 09406 have no kommune dimension and stay in their
  -- indicator models until a national fact pattern exists.
  select
    source_id, kommune_nr, year,
    contents_code, contents_label,
    value, status, updated_at,
    1::int as window_years  {# no period columns: point-in-time #}
  from {{ ref('indicators__ssb_08487') }}
  where kommune_nr is not null
),

-- 🔴 THE NINE UNGDATA SOURCES, AND WHAT IS HELD FIXED TO GET THEM TO THIS GRAIN.
--
-- Each is a survey table with sex × socioeconomic status × a degenerate topic
-- slice × two measure types. The fact's grain is
-- (source, kommune, year, contents_code), so the headline slice is:
--
--     sex = 'all'                    both sexes, as fhi_bor_alene and fhi_vgs do
--     socioeconomic_status = '0'     combined. Only fhi-depresjon HAS a
--                                    breakdown (1/2/3); the other eight carry
--                                    '0' alone, so the filter is a no-op there
--                                    and load-bearing for depresjon.
--     contents_code = 'MEIS'         FHI's smoothed estimate — the interpretable
--                                    number. SMR is a ratio against the national
--                                    average and belongs to a comparison, not to
--                                    a per-kommune value.
--
-- ⚠️ SMR is NOT discarded: every slice stays in indicators__fhi_*, which is
-- where a consumer goes for sex or SES breakdowns. This union is the headline.
--
-- ⚠️ AND THESE VALUES ARE NOT COUNTS. Ungdata is sampled, so there is no TELLER
-- and no RATE upstream. A consumer multiplying one of these by a population
-- gets nothing meaningful — the shape of the `personer` defect, and the reason
-- every one of the nine says so in its own description.

fhi_alkohol as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_alkohol') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_depresjon as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_depresjon') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_fortrolig_venn as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_fortrolig_venn') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_hasj as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_hasj') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_livskvalitet as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_livskvalitet') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_some as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_mediebruk_some') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_spill as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_mediebruk_spill') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_underhold as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_mediebruk_underhold') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_smertestillende as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_smertestillende') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

-- 🔴 THE REMAINING SEVEN FHI SOURCES. Terje's standing rule, 2026-09-21: if a
-- dataset is ingested it must be served. These had been pulled weekly for
-- months and modelled nowhere.
--
-- ⚠️ EACH NEEDED ITS OWN HEADLINE-SLICE DECISION and I told Terje they were
-- "the same pattern, no decisions needed". That was wrong: the nine Ungdata
-- tables were uniform, these are not. Every filter below is a choice, the
-- reason is next to it, and every other slice stays in indicators__fhi_*.
--
-- 🔵 fhi-innvandrere is NOT here, deliberately. Its headline needs the LANDBAK
-- aggregate code, and the manifest says "codes are not human-readable on their
-- own — verify against FHI's dimension reference". Guessing it would publish a
-- population figure for the wrong origin group. The model is built and the
-- source is served through marts; the fact entry waits for one lookup.

fhi_neet as (
  -- the canonical NEET span, all parental-education levels, the percent rate.
  -- 14 age bands overlap; the manifest says "pick a single non-overlapping
  -- partition downstream" and 15_29 is the one the indicator is named for.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_neet') }}
  where kommune_nr is not null
    and age_band = '15_29'
    and education_level = '0'
    and contents_code = 'RATE'
),

fhi_befolkning as (
  -- everyone, both sexes, the count. 35 age bands overlap here — 0_120 is the
  -- universal one and the only safe headline.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_befolkning') }}
  where kommune_nr is not null
    and sex = 'all'
    and age_band = '0_120'
    and contents_code = 'TELLER'
),

fhi_befolkningsvekst as (
  -- both measures kept: TELLER is the absolute change in residents, RATE the
  -- percent. Neither is derivable from the other without the base, so both
  -- become contents_code values rather than one being chosen.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_befolkningsvekst') }}
  where kommune_nr is not null
    and sex = 'all'
    and age_band = '0_120'
),

fhi_innvkat as (
  -- immigrant_category '23' is 1st-gen PLUS 2nd-gen combined.
  -- ⚠️ It is the SUM of '2' and '3', so including all three would double-count;
  -- the manifest says so and this filter is why.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_innvkat') }}
  where kommune_nr is not null
    and age_band = '0_120'
    and immigrant_category = '23'
    and country_background = '0'
    and contents_code = 'TELLER'
),

fhi_kpr_1aar as (
  -- chapter P combined — psychological symptoms AND diagnoses, the aggregate
  -- group. ⚠️ Excluded from disjoint sums by the manifest's own note, which is
  -- exactly why it is the right single headline.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_kpr_1aar') }}
  where kommune_nr is not null
    and age_band = '0_74'
    and icpc2_group = 'P01_P29ogP70_P99'
    and contents_code = 'RATE'
),

fhi_selvmord as (
  -- all ages, both sexes, MEIS — the only measure this table carries. Five-year
  -- rolling windows, so `year` is the first year of the window.
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_selvmord') }}
  where kommune_nr is not null
    and sex = 'all'
    and age_band = '0_120'
    and contents_code = 'MEIS'
),

fhi_prognose as (
  -- 🔴 TWO TIME AXES, FOLDED INTO ONE. A projection has a data year AND a
  -- forecast horizon; the fact's grain has one `year`. So the horizon goes
  -- into contents_code — TELLER_2030, TELLER_2040, TELLER_2050 — the same
  -- move fhi_mobbing makes with school grade. Without it the three horizons
  -- collide on (source, kommune, year, contents_code) and the grain test fires.
  select
    source_id, kommune_nr, year,
    (contents_code || '_' || projection_year) as contents_code,
    coalesce(contents_label, '') || ' (framskrevet til ' || projection_year || ')' as contents_label,
    value, status, updated_at,
    {{ window_years() }}
  from {{ ref('indicators__fhi_prognose') }}
  where kommune_nr is not null
    and sex = 'all'
    and age_band = '0_120'
    and contents_code = 'TELLER'
),

all_indicators as (
  select * from ssb_08764
  union all
  select * from ssb_06913
  union all
  select * from ssb_06944
  union all
  select * from fhi_bor_alene
  union all
  select * from ssb_13995
  union all
  select * from ssb_06947
  union all
  select * from ssb_06083
  union all
  select * from ssb_12292
  union all
  select * from ssb_12063
  union all
  select * from ssb_12131
  union all
  select * from ssb_12132
  union all
  select * from ssb_09429
  union all
  select * from fhi_trangbodd
  union all
  select * from fhi_mobbing
  union all
  select * from fhi_vgs
  union all
  select * from ssb_crime_tables_08487
  union all
  select * from fhi_alkohol
  union all
  select * from fhi_depresjon
  union all
  select * from fhi_fortrolig_venn
  union all
  select * from fhi_hasj
  union all
  select * from fhi_livskvalitet
  union all
  select * from fhi_mediebruk_some
  union all
  select * from fhi_mediebruk_spill
  union all
  select * from fhi_mediebruk_underhold
  union all
  select * from fhi_smertestillende
  union all
  select * from fhi_neet
  union all
  select * from fhi_befolkning
  union all
  select * from fhi_befolkningsvekst
  union all
  select * from fhi_innvkat
  union all
  select * from fhi_kpr_1aar
  union all
  select * from fhi_selvmord
  union all
  select * from fhi_prognose
)

select
  i.source_id,
  i.kommune_nr,
  k.kommune_name,
  k.fylke_nr,
  f.fylke_name,
  i.year,
  i.contents_code,
  i.contents_label,
  i.value,
  i.status,
  k.is_active         as kommune_is_active,
  -- Carried alongside kommune_is_active so the marts downstream can exclude
  -- SSB's 9999 'Uoppgitt' without each one re-deriving what a sentinel is.
  -- dim_kommune keeps the row (Klass 131 publishes it); these marts do not.
  k.is_sentinel       as kommune_is_sentinel,
  i.window_years,
  i.updated_at
from all_indicators i
join {{ ref('dim_kommune') }} k using (kommune_nr)
left join {{ ref('dim_fylke')   }} f using (fylke_nr)
