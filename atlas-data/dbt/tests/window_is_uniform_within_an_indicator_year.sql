-- mart_indicator_summary carries the window as `max(window_years)` over the
-- kommuner at latest_year, because its grain is (source_id, contents_code)
-- while the window lives on the fact row. That aggregate is only lossless if
-- every kommune in an indicator-year shares one window.
--
-- 🔴 I COULD NOT VERIFY THAT WHEN I WROTE IT. There was no database holding
-- the marts to query, so the alternative to this test was shipping max() on an
-- assumption and calling it a fact — which is the exact shape of the defect
-- this whole change exists to fix. It is asserted here instead.
--
-- ⚠️ IF THIS FAILS, DO NOT WIDEN THE TEST. A mixed window inside one
-- indicator-year means either an upstream series changed its window mid-flight
-- (real, and a consumer needs to know) or a CTE folds two different upstream
-- slices into one contents_code (a modelling bug, like the one fhi_prognose
-- avoids by folding the forecast horizon INTO contents_code). Both want
-- fixing at the source, not here.
--
-- Returns the offending groups; dbt fails the test on any row.
select
  source_id,
  contents_code,
  year,
  count(distinct window_years) as distinct_windows,
  min(window_years)            as min_window,
  max(window_years)            as max_window
from {{ ref('fact_kommune_indicators') }}
group by source_id, contents_code, year
having count(distinct window_years) > 1
