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
    value, status, updated_at
  from {{ ref('indicators__ssb_08764') }}
  where kommune_nr is not null
),

ssb_06913 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06913') }}
  where kommune_nr is not null
),

ssb_06944 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_06944') }}
  where kommune_nr is not null
    and household_type = '0000'   -- all households; headline
),

fhi_bor_alene as (
  select
    source_id, kommune_nr, year, contents_code,
    contents_label, value, status, updated_at
  from {{ ref('indicators__fhi_bor_alene') }}
  where kommune_nr is not null
    and age_group = '16_120'       -- all adults 16+; headline
),

ssb_13995 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_13995') }}
  where kommune_nr is not null
),

ssb_06947 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
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
    value, status, updated_at
  from {{ ref('indicators__ssb_06083') }}
  where kommune_nr is not null
),

ssb_12292 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12292') }}
  where kommune_nr is not null
),

ssb_12063 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12063') }}
  where kommune_nr is not null
),

ssb_12131 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__ssb_12131') }}
  where kommune_nr is not null
),

ssb_12132 as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
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
    value, status, updated_at
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
    value, status, updated_at
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
    value, status, updated_at
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
    value, status, updated_at
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
    value, status, updated_at
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
    value, status, updated_at
  from {{ ref('indicators__fhi_alkohol') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_depresjon as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_depresjon') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_fortrolig_venn as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_fortrolig_venn') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_hasj as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_hasj') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_livskvalitet as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_livskvalitet') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_some as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_mediebruk_some') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_spill as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_mediebruk_spill') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_mediebruk_underhold as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_mediebruk_underhold') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
),

fhi_smertestillende as (
  select
    source_id, kommune_nr, year, contents_code, contents_label,
    value, status, updated_at
  from {{ ref('indicators__fhi_smertestillende') }}
  where kommune_nr is not null
    and sex = 'all'
    and socioeconomic_status = '0'
    and contents_code = 'MEIS'
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
  i.updated_at
from all_indicators i
join {{ ref('dim_kommune') }} k using (kommune_nr)
left join {{ ref('dim_fylke')   }} f using (fylke_nr)
