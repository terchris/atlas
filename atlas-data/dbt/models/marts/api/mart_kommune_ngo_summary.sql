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
-- ✅ After the index: 0.205-0.326 s end-to-end, 0.12 s filtered (urb-agents
-- #1270). ⚠️ The index only holds while the visibility map does — see
-- dim_brreg_enhet for why that model's vacuum hook is half of this fix.
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

-- 🔴 A VIEW, AND THAT IS THE WHOLE FIX FOR A DEFECT I SHIPPED AS A TABLE.
--
-- schedules.py says, beside the half-hourly brreg_transform job:
--
--   "The day any model between the dimension and the API becomes a TABLE,
--    that stops being true and this job must gain the publish. Nothing
--    enforces it."
--
-- I made exactly that model a table. `brreg_transform` refreshes
-- dim_brreg_enhet every 30 minutes; a table here is only rebuilt by the daily
-- transform, so this surface drifted behind api_v1.brreg_enhet all day. A
-- consumer found it as a ONE-ROW discrepancy at kommune 3411 and correctly
-- guessed build-time skew (urb-agents #1265) — it would have grown until the
-- next transform, every day.
--
-- ⚠️ Adding this model to the half-hourly job was the other option and is the
-- worse one: that job already has an unfixed stacking hazard (a run exceeding
-- its 30-minute interval does not skip, it races on delete+insert against
-- dim_brreg_enhet — INVESTIGATE-transform-run-stacking), and spending that
-- margin to keep a cache warm is spending the thing that cannot be replaced.
--
-- 🔵 A view removes the skew rather than scheduling around it, and it is
-- affordable — MEASURED, not assumed. Against a synthetic register of 1.17M
-- rows with the real ~10.3 % null-kommune and ~6 % voluntary shares, on the
-- three indexes dim_brreg_enhet already carries: 42-88 ms per execution over
-- five runs. The API's own baseline latency is ~330 ms.
--
-- Precedent: mart_brreg_enhet is a view over the same dimension, for the same
-- reason, and says so.

-- 🔴 THE VIEW THAT REMOVES A 2.8 MB DOWNLOAD FROM EVERY PAGE LOAD.
--
-- PostgREST has aggregates disabled (`db-aggregates-enabled` off, the default
-- since v12.2), so `?select=count()` returns 400. A consumer needing one number
-- per kommune — how many active voluntary organisations are registered there —
-- had two options and both were bad (urb-agents #1250, finding 1):
--
--   one count=exact probe per kommune   ~2.5 s each x 357 = ~15 minutes
--   download and count client-side      2.8 MB CSV, 72 792 rows, every visitor
--
-- It shipped the download. This is 357 x ~33 rows instead, and it is the
-- consumer's own first suggestion — cheaper than turning aggregates on, and it
-- needs no PostgREST configuration that Atlas cannot set anyway.
--
-- 🔴 IT ALSO REMOVES A SILENT-FAILURE DEPENDENCY, which is the better reason.
-- That app fetches with `limit=100000` and no paging, which is correct only
-- while `db-max-rows` is unset. In its own words: "if you ever set it, my
-- response is capped silently and every coverage figure goes quietly low — no
-- error, no exception, plausible numbers."
--
-- ⚠️ And the trap is closer than it looks: the usual mitigation for enabling
-- aggregates IS setting db-max-rows. Granting finding 1 the way it was first
-- asked for would have broken the app through finding 1's own safety measure.
-- A pre-aggregated view needs neither setting.
--
-- ⚠️ EXCLUSIONS, measured 2026-09-19 and stated because a consumer counting
-- from this view will otherwise reach a different total than one counting from
-- brreg_enhet:
--
--   7 488 of 72 792 active voluntary units (10.3 %) have NO kommune_nr — that
--   is what Brreg publishes, not something Atlas dropped — and cannot be
--   attributed to anywhere. A further handful sit on codes outside the 357 and
--   are dropped by the join to dim_kommune.
--
-- A (kommune, category) pair absent from this view has zero organisations.
-- Rows are not emitted for empty combinations; join dim_kommune if you need
-- the zeros.

select
  k.kommune_nr,
  k.kommune_name,
  e.icnpo_nummer,
  e.icnpo_kategori,
  count(*)::int as active_count
from {{ ref('dim_brreg_enhet') }} e
join {{ ref('dim_kommune') }} k
  on k.kommune_nr = e.kommune_nr
where e.registrert_i_frivillighetsregisteret
  and e.is_active
  -- Not the 9999 sentinel. kommune_ngo_totals reads this view, so excluding it
  -- here fixes both (urb-agents #1301).
  and not k.is_sentinel
group by k.kommune_nr, k.kommune_name, e.icnpo_nummer, e.icnpo_kategori
order by k.kommune_nr, e.icnpo_nummer
