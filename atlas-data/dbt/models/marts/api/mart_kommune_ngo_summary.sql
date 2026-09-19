{{
  config(
    materialized='table',
    schema='marts'
  )
}}

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
group by k.kommune_nr, k.kommune_name, e.icnpo_nummer, e.icnpo_kategori
order by k.kommune_nr, e.icnpo_nummer
