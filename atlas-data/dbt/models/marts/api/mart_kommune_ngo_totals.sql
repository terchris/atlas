{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- One row per kommune: how many active voluntary organisations are registered
-- there. 357 rows instead of the ~5 400 in kommune_ngo_summary.
--
-- 🔴 EXISTS BECAUSE POSTGREST CANNOT SUM. `?select=active_count.sum()` returns
-- PGRST123 — aggregates are disabled — so a consumer wanting one number per
-- kommune has to fetch every category row and add them up client-side. That is
-- most of the 0.82 MB a cold page load now costs (ops-dev, urb-agents #1265),
-- and the mart exists specifically to be summed.
--
-- ⚠️ Atlas cannot turn aggregates on: template-info.yaml's postgrest block
-- exposes `schemas` and `url_prefix` and nothing else. Publishing the rollup is
-- the part that is ours, and it costs a view.
--
-- 🔵 Measured on a synthetic 1.17M-row register: 40-75 ms. Same reasoning as
-- kommune_ngo_summary for why this is a view and not a table — a table here
-- would drift behind api_v1.brreg_enhet between daily transforms.
--
-- ⚠️ Counts exclude the 10.3 % of active voluntary units carrying no
-- kommune_nr. Summing this view gives the placed total, not the register
-- total; the difference is deliberate and is stated on kommune_ngo_summary.

select
  kommune_nr,
  kommune_name,
  sum(active_count)::int as active_count
from {{ ref('mart_kommune_ngo_summary') }}
group by kommune_nr, kommune_name
order by kommune_nr
