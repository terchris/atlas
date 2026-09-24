-- 🔴 A JSONB PATH THAT GOES DEAD BREAKS NOTHING. THAT IS WHY THIS EXISTS.
--
-- On 2026-09-24 dim_brreg_enhet gained 76 columns extracted from `doc` with
-- expressions like `doc ->> 'epostadresse'`. That is the first time a PUBLISHED
-- column's value depends on a JSONB PATH rather than on a source column, and
-- the two fail completely differently:
--
--   a source column disappears   the build FAILS. Postgres cannot compile it.
--   a jsonb key is renamed       every row returns NULL. The column still
--                                exists, the type is still right, the row count
--                                is unchanged, and EVERY EXISTING CHECK STAYS
--                                GREEN.
--
-- ⚠️ The 76 columns landed with ZERO tests. dbt's totals did not move at all —
-- PASS=997 before and after, identical membership — because brreg_enhet's 29
-- assertions all describe the original 21 columns (urb-agents #1465). imac put
-- the consequence best: "if under_rekonstruksjonsforhandling_dato silently
-- becomes null next month, the 15 I measured today is the only record that it
-- ever held anything."
--
-- 🔵 NOT not_null ON 76 COLUMNS. Most are legitimately sparse — `konkursdato`
-- is null for 99.7% of organisations because they have not gone bankrupt — so
-- not_null would be noise, and noise is how a suite stops being read.
--
-- 🔵 A FLOOR INSTEAD, on five columns chosen to span four orders of magnitude,
-- so a path dying anywhere in the range is caught. Floors are set well below
-- the measured value: the target is ZERO, not drift. `brreg-oppdateringer`
-- rewrites this table every thirty minutes and these counts move daily.
--
--     column                                 measured 2026-09-24      floor
--     forretningsadresse_poststed                     1 156 789    900 000
--     epostadresse                                      324 980    200 000
--     konkursdato                                         3 249      1 000
--     paategninger (non-empty)                            2 599        500
--     under_rekonstruksjonsforhandling_dato                  15          1
--
-- ⚠️ THE LAST ONE IS DELIBERATELY A NON-ZERO TEST, NOT A PROPORTION. It is the
-- rarest key that survived enumeration — four separate samples missed it — and
-- the only useful assertion about a 15-row column is that it is not empty.
--
-- 🔴 IF THAT ROW LEGITIMATELY EMPTIES, THIS TEST FAILS AND THAT IS CORRECT.
-- Norway having no organisations under rekonstruksjonsforhandling is a real
-- possibility and a thing a human should see once, not a thing to pre-emptively
-- tolerate. Lower the floor to 0 with a dated comment saying who checked — do
-- NOT delete the row, because then nothing watches the path again.

with populated as (
  select
    count(forretningsadresse_poststed)                   as forretningsadresse_poststed,
    count(epostadresse)                                  as epostadresse,
    count(konkursdato)                                   as konkursdato,
    count(*) filter (
      where paategninger is not null
        and paategninger <> '[]'::jsonb
    )                                                    as paategninger_non_empty,
    count(under_rekonstruksjonsforhandling_dato)         as under_rekonstruksjonsforhandling_dato
  from {{ ref('dim_brreg_enhet') }}
),

checks as (
  select * from (values
    ('forretningsadresse_poststed',           (select forretningsadresse_poststed           from populated),  900000),
    ('epostadresse',                          (select epostadresse                          from populated),  200000),
    ('konkursdato',                           (select konkursdato                           from populated),    1000),
    ('paategninger_non_empty',                (select paategninger_non_empty                from populated),     500),
    ('under_rekonstruksjonsforhandling_dato', (select under_rekonstruksjonsforhandling_dato from populated),       1)
  ) as t(column_name, populated_rows, floor_rows)
)

select
  column_name,
  populated_rows,
  floor_rows,
  'jsonb path may be dead — this column was populated on 2026-09-24 and is now below its floor'
    as diagnosis
from checks
where populated_rows < floor_rows
