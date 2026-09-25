{{
  config(
    materialized='view',
    schema='marts'
  )
}}

-- dim_fylke — the county dimension, the sibling of dim_kommune that was not
-- published. A consumer joining at fylke level was rebuilding this mapping,
-- and each of them was rebuilding it slightly differently — the same thing
-- dim_kommune was published to stop (urb-agents #1250).
--
-- Sourced from SSB Klass classification 104. History-aware: historical codes
-- are here with is_active = false, because a consumer joining old data needs
-- them to resolve.
--
-- ⚠️ TWO DIFFERENT COUNTS, AND THEY GET CONFUSED. Measured 2026-09-25 through
-- the published dim_kommune, whose fylke_name is a LEFT JOIN onto this table:
--
--   35 distinct fylke codes resolve to a name here — so this relation holds AT
--      LEAST that many rows. It carries the pre-2020 01–20 numbering, the
--      intermediate Viken 30 and Vestfold og Telemark 38, and oddities like
--      13 Bergen, which was its own fylke.
--   16 of those appear on at least one ACTIVE kommune: the 15 real fylker of
--      today plus '99 Uoppgitt'.
--
-- 🔵 models/dimensions/schema.yml says "16 rows". That is the second number,
-- not the first — it describes today's fylker, not this table's size. Filter
-- `?is_active=eq.true` for the current set rather than reading a row count.
--
-- 🔵 A VIEW over the dimension table, not a second copy of it — same reason as
-- mart_dim_kommune's wrapper: the api_v1 layer is a projection, not a store.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 is_sentinel IS DERIVED HERE, AND IT IS DERIVED FOR A REASON
-- ══════════════════════════════════════════════════════════════════════════
--
-- '99 Uoppgitt' is not a county. It is SSB's residual bucket, and it is an
-- ACTIVE code — so `?is_active=eq.true` returns 16, not 15, exactly as
-- `?is_active=eq.true` on dim_kommune returns 358 rather than 357 because of
-- the 9999 bucket.
--
-- dim_kommune already publishes `is_sentinel` for its own bucket. Publishing
-- its sibling WITHOUT the same column would mean a consumer who had learned
-- the filter on one relation would silently not have it on the other — the
-- inconsistency urb-agents #700 is about, shipped one relation wider.
--
-- ⚠️ This is a DERIVED column in Atlas's own wrapper, not an edit to SSB's
-- data. fylke_nr, fylke_name and everything else are passed through exactly as
-- dim_fylke holds them; nothing upstream is altered, dropped or relabelled.

select
  f.fylke_nr,
  f.fylke_name,
  -- The Sámi variant where there is one, split out of upstream's combined
  -- "Name - Nama" string, exactly as dim_kommune does it.
  f.fylke_name_alt,
  f.is_active,
  f.valid_from,
  f.valid_to,
  f.notes,
  f.updated_at,
  -- 🔴 TRUE for the '99 Uoppgitt' residual. See the block above.
  (f.fylke_nr = '99') as is_sentinel
from {{ ref('dim_fylke') }} f
order by f.fylke_nr
