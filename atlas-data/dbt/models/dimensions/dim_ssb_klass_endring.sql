{{
  config(
    materialized='table',
    indexes=[
      {'columns': ['classification_id', 'old_code']},
      {'columns': ['classification_id', 'new_code']}
    ]
  )
}}

-- dim_ssb_klass_endring — SSB Klass's correspondence log, with the kind of
-- change derived. urb-agents #2098/#2099 (R6).
--
-- 🔴 "THE KIND" IS NOT A KLASS FIELD. /changes.json gives oldCode, oldName,
-- newCode, newName, changeOccurred — nothing resembling "renamed" or
-- "merged". The request's own vocabulary (renamed, renumbered, merged,
-- split, border) is derived here from the SHAPE of same-date transitions,
-- not read off anything upstream states.
--
-- DERIVATION, VALIDATED AGAINST THE LIVE DATA BEFORE WRITING THIS SQL (not
-- designed first and hoped to fit): for every row, count how many DISTINCT
-- new_code values its own old_code maps to on the same changeOccurred date
-- (a split, from the old code's side) and how many DISTINCT old_code values
-- feed its own new_code on that date (a merger, from the new code's side).
--
--   new_codes_for_old > 1 and old_codes_for_new > 1  -> split_and_merged
--   new_codes_for_old > 1                             -> split
--   old_codes_for_new > 1                             -> merged
--   old_code = new_code and old_name = new_name       -> border
--   old_code = new_code and old_name != new_name      -> renamed
--   old_code != new_code and old_name = new_name       -> renumbered
--   else (both code and name differ, no fan-out)       -> renamed_and_renumbered
--
-- 🔵 split_and_merged AND renamed_and_renumbered ARE REAL, NOT A CATCH-ALL
-- FOR NOISE. Measured 2026-11-08 against all 1,285 kommune + 31 fylke
-- transitions since 1950:
--
--   merged               609 + 18 = 627
--   renumbered           357 +  0 = 357
--   split_and_merged      199 +  1 = 200
--   split                  75 +  8 =  83
--   renamed                37 +  4 =  41
--   renamed_and_renumbered  7 +  0 =   7
--   border                  1 +  0 =   1
--
-- split_and_merged is 15.2% of all transitions, not a rounding error — e.g.
-- 1960-01-01: part of old 1045 Bakke stays 1045 Bakke (a plain split) while
-- the other part merges into new 1046 Sirdal alongside Tonstad and Øvre
-- Sirdal (that same row is also part of a merger). One transition can
-- genuinely be both at once, and forcing it into either single category
-- would misreport what Klass itself recorded as one event. The request's
-- own vocabulary has five values; this adds exactly the two combinations
-- real data produces, no more.
--
-- renamed_and_renumbered covers two different real causes, not one: the
-- 2020 reform renumbering some kommuner while ALSO dropping a disambiguating
-- fylke suffix that was no longer needed ("Nes (Akershus)" -> "Nes"), and
-- 2024's Gratangen picking up a combined Sami name on the same date its own
-- code otherwise stayed put in a wider fylke reorganisation. Folding these
-- into plain "renumbered" would assert the name was unchanged, which it
-- was not.
-- Postgres does not implement DISTINCT inside a window function's OVER()
-- clause ("DISTINCT is not implemented for window functions" — hit this
-- directly running the first draft, not found by reading docs first). The
-- fan-out counts are computed as separate GROUP BY aggregates instead and
-- joined back, which is semantically identical.
with raw as (
  select * from {{ source('raw', 'ssb_klass_endring') }}
),
fanout_old as (
  select classification_id, old_code, change_occurred,
         count(distinct new_code) as new_codes_for_old
  from raw
  group by classification_id, old_code, change_occurred
),
fanout_new as (
  select classification_id, new_code, change_occurred,
         count(distinct old_code) as old_codes_for_new
  from raw
  group by classification_id, new_code, change_occurred
),
fanout as (
  select
    r.classification_id,
    r.old_code,
    r.old_name,
    r.old_short_name,
    r.new_code,
    r.new_name,
    r.new_short_name,
    r.change_occurred,
    r.loaded_at,
    fo.new_codes_for_old,
    fn.old_codes_for_new
  from raw r
  join fanout_old fo
    on fo.classification_id = r.classification_id
   and fo.old_code = r.old_code
   and fo.change_occurred = r.change_occurred
  join fanout_new fn
    on fn.classification_id = r.classification_id
   and fn.new_code = r.new_code
   and fn.change_occurred = r.change_occurred
)
select
  classification_id,
  old_code,
  old_name,
  old_short_name,
  new_code,
  new_name,
  new_short_name,
  change_occurred,
  case
    when new_codes_for_old > 1 and old_codes_for_new > 1 then 'split_and_merged'
    when new_codes_for_old > 1 then 'split'
    when old_codes_for_new > 1 then 'merged'
    when old_code = new_code and old_name = new_name then 'border'
    when old_code = new_code and old_name != new_name then 'renamed'
    when old_code != new_code and old_name = new_name then 'renumbered'
    else 'renamed_and_renumbered'
  end as kind,
  loaded_at
from fanout
