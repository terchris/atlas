{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- 🔴 MY EARLIER PERFORMANCE NUMBER FOR THIS VIEW WAS WRONG, AND WRONG IN THE
-- WAY THAT MATTERED.
--
-- I reported "42-88 ms, measured not assumed" when choosing a view over a
-- table. The measurement was real and the synthetic table was not: I matched
-- the ROW COUNT (1.17M) and the distributions and left the payload tiny, so I
-- benchmarked a ~100 MB relation standing in for a 2.3 GB one. Row size is what
-- decides a heap fetch, and heap fetches were the entire cost.
--
-- ⚠️ Live, the unfiltered path was 25.3 s cold and ~3.9 s warm for 24 kB of
-- output, with one request timing out (ops-dev, urb-agents #1268). The filtered
-- path — the one I measured the analogue of — really is sub-second.
--
-- ✅ Fixed by a 600 kB partial covering index on dim_brreg_enhet rather than by
-- materialising: Index Only Scan, Heap Fetches 0, 18 ms against 206-379 ms, on
-- a synthetic register rebuilt to the REAL payload size (2344 MB). See that
-- model for the full measurement. The view stays a view, so the drift defect
-- from #1265 is not bought back.
--
-- ⚠️ THE LESSON WORTH MORE THAN THE INDEX: a synthetic benchmark reproduces
-- only the dimensions you thought to reproduce. I got the row count right and
-- the row size wrong, and the number I published was out by two orders of
-- magnitude on the access pattern that actually hurts.

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
