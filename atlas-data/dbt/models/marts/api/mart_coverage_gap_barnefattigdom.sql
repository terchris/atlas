with latest as (
  select {{ latest_year_agg() }} as year
  from {{ ref('fact_kommune_indicators') }}
  where source_id = 'ssb-08764' and contents_code = 'EUskala60'
)
select
  f.kommune_nr,
  f.kommune_name,
  f.fylke_name,
  f.year,
  max(case when f.contents_code = 'EUskala60' then f.value end)::float as value_pct,
  max(case when f.contents_code = 'Personer'  then f.value end)::float as personer,
  -- 🔴 THE COLUMN A CONSUMER ACTUALLY WANTS, DERIVED, BECAUSE SSB DOES NOT
  -- PUBLISH IT. Table 08764 carries only the total (`Personer`) and shares
  -- (`EUskala*`), so the count of children in low-income households exists
  -- nowhere upstream and every consumer must compute it.
  --
  -- ⚠️ One of them computed it wrong: the published description for `personer`
  -- said it WAS this number, so a consumer summing the column got 1,097,107 —
  -- Norway's entire under-18 population — and would have published it as a
  -- child-poverty figure (urb-agents #1250/#1251). Terje authorised adding this
  -- rather than renaming `personer`, so the existing consumer keeps working.
  --
  -- ⚠️ IT IS AN ESTIMATE AND THE ERROR IS NOT NEGLIGIBLE. `value_pct` is
  -- published to ONE decimal, so the true count lies within ±0.05 % of the
  -- denominator: ±65 children for Oslo, ±4 for a kommune of 7 000. Rounding to
  -- an integer is honest at that scale and misleading beyond it — do not
  -- present this as SSB's own count, because SSB does not have one.
  round((max(case when f.contents_code = 'Personer'  then f.value end)
       * max(case when f.contents_code = 'EUskala60' then f.value end)
       / 100.0)::numeric)::int as barn_i_lavinntekt
from {{ ref('fact_kommune_indicators') }} f
join latest l on f.year = l.year
where f.source_id = 'ssb-08764'
  and f.contents_code in ('EUskala60', 'Personer')
  and f.kommune_is_active
  -- 🔴 AND NOT THE SENTINEL. kommune_is_active does NOT exclude SSB's 9999
  -- 'Uoppgitt': it is a current code, so is_active is true, and this view has
  -- been emitting a row for a place that does not exist. Anyone summing
  -- barn_i_lavinntekt across kommuner was adding a non-place to the total.
  -- dim_kommune still carries 9999 — Klass 131 publishes it and Atlas does not
  -- drop what SSB publishes — and the value now lives in unattributed_totals.
  -- urb-agents #1301, Terje 2026-09-21, option B.
  and not f.kommune_is_sentinel
group by f.kommune_nr, f.kommune_name, f.fylke_name, f.year
order by f.kommune_nr
