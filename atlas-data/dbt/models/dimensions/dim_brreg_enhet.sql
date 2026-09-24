{#

  🔴 THIS TABLE WAS BUILT FROM TWO BRREG DISTRIBUTIONS, AND THE `links` COHORT
  IS DRAINING INTO `_links`. Anyone analysing `last_seen_at` will trip over this
  eventually, and the only visible evidence is a `doc` key that may stop being
  published — so it is recorded here rather than left in the data.

  ⚠️ THE TWO HALVES ARE NOT FIXED. The delta job rewrites whole documents: when
  it touches an organisation it moves `last_seen_at` forward AND replaces the
  doc with the REST shape, so the row leaves the `links` cohort and joins
  `_links`. Whole-table counts, 2026-09-24:

      05:30Z   links 1 112 582   _links 62 716   total 1 175 298
      09:50Z   links 1 112 154   _links 63 324   total 1 175 478
      10:03Z   links 1 112 154   _links 63 324   total 1 175 478

      -428 converted + 180 new rows = +608 into _links.  Reconciles exactly.

  🔵 A consumer building on "rows before 14 September behave like X" is building
  on a population that is LEAVING.

  🔴 THE DIRECTION IS THE FINDING. THE RATE IS NOT. The third observation is
  identical to the second thirteen minutes later, because the delta job runs
  every thirty minutes and the conversion moves in STEPS at job boundaries — so
  an interval that falls between two runs shows zero and an interval spanning
  one shows a jump. ⚠️ Do not divide a count difference by an elapsed time here.
  What is safe: the split narrows monotonically, it will be visible for a long
  time, and it will probably never reach zero — organisations that change often
  convert first, and the long tail may never change at all.

      bulk download (enheter/lastned)   ->  doc carries `links`     1 112 582
      REST API (the change feed)        ->  doc carries `_links`       62 716
      rows carrying BOTH                                                    0
                                                                    ---------
                                                                    1 175 298

  Every row carries exactly one and never both, and the two sum to the row count
  with nothing left over. ⚠️ BOTH FORMATS ARE CURRENT. Neither is legacy and
  neither is a version: they are two distributions of the same register that
  differ in shape. The decisive measurement is the boundary, not the ratio:

      last_seen_at >= 2026-09-15     _links 20 908     links 0

  Zero. Not "few". Verified by count=exact, one query each, 2026-09-24.

  ⚠️ AN EARLIER VERSION OF THIS NOTE READ THE PARTITION AS "two upstream API
  versions landing in the same table" and marked it INFERENCE, untested. The
  partition was real and that mechanism was wrong — the consumer that first
  reported it retracted the story and kept the fact. A ratio from an 800-row
  sample was never evidence for either; three separate samples put the split at
  93/7, 97.9/2.1 and 29.7/70.3.

  🔵 THE 577-ROW RESIDUE IS THE FIRST DELTA RUN, AND IT RAN AFTER THE LOAD
  FINISHED — SEQUENCE, NOT OVERLAP.

      last `links` row written    2026-09-14T11:24:49.766Z
      first `_links` row written  2026-09-14T11:26:21.329Z
      gap                         1 min 31 s, with nothing in between

  ⚠️ AN EARLIER VERSION OF THIS NOTE SAID "a delta run arriving BEFORE the load
  finished". The band was measured correctly and the word was wrong: I read
  `last_seen_at <= 11:30` as "inside the load window" because 11:30 was the
  quoted boundary, and never checked when the load actually STOPPED. It stopped
  at 11:24:49. **A rounded boundary someone quoted is not a measurement of the
  event.** Found by the consumer that reported the partition.

  🔵 The band itself stands. 577 rows carry `_links` with `last_seen_at` before
  11:30 — 0.05% of the load — and they are not scattered:

      <= 11:00    0        <= 11:20    0
      <= 11:25    0        <= 11:29  577        <= 11:30  577

  A FOUR-MINUTE BAND immediately after the load's last write. Scatter would mean
  something re-fetched 577 organisations for a reason nobody has named; a single
  narrow band starting 91 seconds after the load stopped is its first delta run.

  ⚠️ What this does NOT establish is which JOB wrote them. That the rows came by
  the REST path follows from the `_links` shape — established above — but job
  identity needs `raw.ingest_runs`, which is not published. It was thought to
  need ingest logs; it needed the DISTRIBUTION of a published column, which a
  count alone could not show.

  🔴 WHY `last_oppdateringsid` AND `snapshot_loaded_at` ARE INDEXED.

  Both incremental predicates below read `max(...)` from THIS table. Until
  2026-09-13 neither column was indexed, so each read was an aggregate over a
  3,971 MB relation with nothing to satisfy it — a sequential scan, twice per
  run, 48 times a day.

  ⚠️ One of those scans PREDATES the snapshot arm: `max(last_oppdateringsid)` has
  been unindexed since this model became incremental. The redesign did not
  introduce the cost, it doubled it — which is why the measured regression
  (13.18 s → ~31 s, urb-agents #894) is close to "one more full scan of the same
  table" rather than anything about the snapshot predicate itself.

  🔵 `max(col)` over a btree is planned as an index scan backward with LIMIT 1,
  so both reads should become effectively constant-time. NULLs are not a problem:
  `snapshot_loaded_at` is null for feed-only organisations, `max()` ignores nulls,
  and Postgres rewrites the aggregate to an ordered read that skips them.

  ✅ MEASURED, AND THE HYPOTHESIS HELD (imac, urb-agents #896):

      max(last_oppdateringsid)   6,063 ms  242,209 buffers  ->  1.4 ms  4 buffers
      max(snapshot_loaded_at)    7,778 ms  241,936 buffers  ->  9.3 ms  4 buffers

  🔴 The older scan was real. The 13.18 s baseline this design was argued against
  contained a 6.1 s sequential scan of a 3,971 MB table that predates every change
  in the thread — so part of what looks like a regression here is a defect that
  was always present and is now fixed.

  ⚠️ DO NOT SUBTRACT IT TO FLATTER THIS DESIGN. It is tempting to say the old
  baseline "really" cost ~7 s once its own scan is removed, making the ratio ~3x.
  imac refused that subtraction and so does this comment: no build pairs the old
  predicate with the new indexes, so the counterfactual was never measured. The
  honest pair is 13.18 s then, 21.6 s now — about 1.6x — and even that compares
  two shipped configurations differing in three ways at once.

  ⚠️ dbt creates indexes on an incremental model when the table is CREATED, so
  these take effect on the next `--full-refresh` and not before.

  🔴 THE DECISION, TAKEN 2026-09-13 AND RECORDED SO IT IS NOT RE-ARGUED FROM
  SCRATCH: **accepted at ~21.6 s / ~139 s, against a stated target of ~97 s.**

  I set that target myself and I am missing it by ~43%, so this is stated as a
  miss rather than dressed as a pass. Why it is accepted anyway:

    • What it buys is not optional. Without the snapshot arm a bootstrap is a
      SILENT no-op — measured at 329 s, a green ASSET_MATERIALIZATION, and zero
      rows written. Re-running the bootstrap is what an operator reaches for to
      REPAIR the register, and that is the moment a false success costs most.
    • ~8.4 s per run x 48 runs is ~6.7 min/day. The join withdrawn on the same
      criterion cost ~34 min/day: this is a fifth of the thing already judged a
      bad trade, and the alternative to paying it is a known silent failure
      rather than a tolerable one.
    • The target was a proxy for "do not pay a lot for a once-a-year path",
      written before anyone knew what the path cost. Holding to the proxy over
      the reasoning it stood for would be obeying a number I invented.

  ⚠️ What is NOT claimed: that the remaining ~8.4 s is understood. The watermark
  reads are now ~10 ms combined, so the cost is elsewhere — the union, the extra
  column carried through `combined`/`typed`, or index maintenance on rebuild.
  Nobody has run EXPLAIN on the whole predicate. That is a cheap follow-up and it
  is not a condition of this decision.

  🔴 AND ONE THING ABOUT MEASURING THIS AGAIN. The indexes survive a rollback:
  any `dim_brreg_enhet` timing taken on imac's host from now on is an INDEXED
  measurement whatever build is installed. **The 13.18 s baseline is historical,
  not repeatable there** — a future `e0ef430` timing on that host would silently
  be measuring something else while looking like a clean comparison.

  🔵 The first attempt at this change put the explanation inside the `config()`
  call as `#` comments. That is not a comment in Jinja — the list silently did not
  take, and `dbt parse` still reported four indexes. Caught by reading the
  compiled manifest rather than the edited file.
#}
{{
  config(
    materialized='incremental',
    unique_key='organisasjonsnummer',
    incremental_strategy='delete+insert',
    on_schema_change='fail',
    schema='marts',
    post_hook=[
      """
      delete from {{ this }} d
       where exists (
         select 1
           from (
             select distinct on (organisasjonsnummer)
                    organisasjonsnummer, endringstype
               from raw.brreg_enheter_versions
              order by organisasjonsnummer, oppdateringsid desc
           ) v
          where v.organisasjonsnummer = d.organisasjonsnummer
            and v.endringstype in ('Sletting', 'Fjernet')
       )
      """,
      """
      delete from {{ this }} where doc is null
      """,
      """
      create index if not exists dim_brreg_enhet_voluntary_active_idx
        on {{ this }} (kommune_nr, icnpo_nummer, icnpo_kategori)
        where registrert_i_frivillighetsregisteret and is_active
      """,
      """
      comment on index {{ this.schema }}.dim_brreg_enhet_voluntary_active_idx is
        'LOAD-BEARING. api_v1.kommune_ngo_summary and kommune_ngo_totals are '
        'index-only scans over this index. Dropping it does not make them '
        'slower, it makes them unusable: 25 s for a 24 kB response, and one '
        'request timed out (urb-agents #1268). It costs 872 kB. Declared in '
        'dbt models/dimensions/dim_brreg_enhet.sql - a DROP here is undone by '
        'the next run, and the outage lasts until then.'
      """,
      """
      alter table {{ this }} set (autovacuum_vacuum_scale_factor = 0.02)
      """,
      {
        "sql": "vacuum (analyze, skip_locked) {{ this }}",
        "transaction": False
      }
    ],
    indexes=[
      {'columns': ['organisasjonsnummer'], 'unique': True},
      {'columns': ['kommune_nr']},
      {'columns': ['registrert_i_frivillighetsregisteret']},
      {'columns': ['is_active']},
      {'columns': ['last_oppdateringsid']},
      {'columns': ['snapshot_loaded_at']}
    ]
  )
}}

-- ⚠️ The index statement is APPENDED TO THE EXISTING post_hook LIST above, not
-- given its own `post_hook=` argument — two of those in one config() is a
-- compilation error. And no `#` comments inside that jinja expression: also a
-- compilation error. Both are how I first wrote it.
--
-- 🔴 THE INDEX ALONE MADE IT WORSE. AN INDEX-ONLY SCAN IS ONLY INDEX-ONLY IF
-- THE VISIBILITY MAP SAYS SO.
--
-- `864fb52` deployed the index above and was a 2-7x REGRESSION for its first
-- ten minutes, because this table had never been vacuumed (imac, urb-agents
-- #1270). A page that is not marked all-visible forces the scan to check the
-- heap anyway, so it does the index work AND the heap work:
--
--     before the index                Index Scan          —          3,410 ms
--     index created, NOT vacuumed     Index Only Scan   15,915   6,859-22,858 ms
--     index + VACUUM (ANALYZE)        Index Only Scan        0     286-  390 ms
--
-- ⚠️ AND IT COMES BACK, CONTINUOUSLY, WITH NO DEPLOY TO BLAME. brreg_transform
-- updates this table every 30 minutes; every update un-marks a page. Measured
-- locally on the 2345 MB fixture, autovacuum disabled, warm cache:
--
--     dead tuples        0     5 000    23 000    56 000   235 000
--     heap fetches       0       508     2 492     5 871    24 671
--     execution        8.8 ms   9.8 ms   12.7 ms   72.1 ms  352.2 ms
--
-- 🔴 Decay is LINEAR — about 0.105 heap fetches per dead tuple — so there is no
-- threshold that keeps it at zero. Default autovacuum would not fire until
-- ~235 000 dead rows, the right-hand column: intermittent API slowness that
-- correlates with nothing and gets blamed on the network.
--
-- ✅ TWO HOOKS, TWO DIFFERENT JOBS. They are not alternatives:
--
--   `vacuum (analyze)` REBUILDS THE VISIBILITY MAP at the moment the damage is
--   made, by the thing that makes it. Live, imac measured 15 915 heap fetches
--   -> 0. In the fixture it went 24 671 -> 277, and 277 is where it stayed
--   across three more vacuums — 1 250 of 351 250 pages stay un-marked for a
--   reason I could not establish, with no other backend holding a snapshot.
--   ⚠️ I am recording that rather than rounding it to zero: the live number is
--   imac's, the residue is mine, and no claim here rests on the residue.
--
--   🔴 SKIP_LOCKED, AND IT IS NOT AN OPTIMISATION. `VACUUM` takes SHARE UPDATE
--   EXCLUSIVE and WAITS for a conflicting lock rather than failing.
--   `brreg_transform` writes this table every 30 minutes. If the two overlap,
--   the transform pod sits inside VACUUM and nothing times out.
--
--   ⚠️ THE INCIDENT I ORIGINALLY CITED HERE DID NOT HAPPEN. This comment said
--   "a transform took ~70 minutes against a 240 s norm". imac's run records
--   show a FAILURE at 12:00:58 after 225 s and then no transform in existence
--   for 48 minutes — the three relations were dark because nothing was running,
--   not because something was stuck (urb-agents #1329). No transform in 30
--   hours exceeded 275 s. I accepted a timeline that "matched on three points"
--   without asking whether the thing it explained had occurred.
--
--   🔵 THE CHANGE STILL STANDS, AND ALWAYS RESTED ON THIS RATHER THAN ON THAT
--   INCIDENT: a VACUUM that can block a nightly transform behind a 30-minute
--   writer is a latent hazard whether or not it has fired. Reproduced on
--   Postgres 15 against a real conflicting SHARE UPDATE EXCLUSIVE lock:
--
--       vacuum (analyze)                BLOCKED until the other side released
--       vacuum (analyze, skip_locked)   returned immediately
--
--   ⚠️ WHAT SKIPPING COSTS. That cycle does no vacuum and no analyze, so the
--   visibility map degrades until the next successful run. That is what
--   `autovacuum_vacuum_scale_factor = 0.02` is for — the backstop for "the
--   model does not run", and a skipped hook is the same case. Postgres emits a
--   WARNING naming the skipped relation, so a skip is visible in the dbt log.
--
--   🔴 AND THIS COMMENT BROKE THE BUILD. Only its first line carried the `--`
--   prefix; every line after was raw SQL, so dim_brreg_enhet failed at model 1
--   of 90 and CASCADE took its three dependents with it. Twice in one day the
--   same three relations went dark, and the second time the cause was prose.
--
--  Cost on 2345 MB: 5.1 s after 235 k dead rows, 1.4 s in steady state,
--   against a run that already takes ~21 s. (imac's 49.8 s was the FIRST vacuum
--   of a table that had never had one — there was no visibility map yet, so
--   nothing could be skipped. Subsequent vacuums skip all-visible pages, which
--   is why the recurring cost is seconds and not a minute.)
--
--   `autovacuum_vacuum_scale_factor = 0.02` BOUNDS the decay when this model
--   does NOT run. A post-hook cleans up only on a run; if the pipeline is
--   paused or failing, the default threshold lets it degrade all the way to the
--   24 671-heap-fetch column. This caps it around 23 000 dead / 2 492 fetches.
--   It takes only a ShareUpdateExclusiveLock (verified), so it never blocks a
--   reader, and setting it HERE rather than in someone's psql history is what
--   makes it survive `--full-refresh`, which drops reloptions with the table.
--
-- 🔴 VACUUM MUST USE THE DICT HOOK FORM. dbt-postgres wraps a model and its
-- hooks in one transaction, and the obvious spelling fails:
--
--     post_hook="vacuum (analyze) {{ this }}"
--        -> Database Error: VACUUM cannot run inside a transaction block
--     post_hook={"sql": "vacuum (analyze) {{ this }}", "transaction": False}
--        -> OK
--
-- Both were run, not reasoned about; the failing one is what I would have
-- written. ⚠️ Being outside the transaction also means this runs AFTER the
-- model commits — a failure here leaves the data correct and the visibility map
-- stale, which is the right way round.
--
-- 🔵 The project-level `+post-hook: analyze_if_table()` still runs, and runs
-- FIRST — before the deletes below, so its statistics are taken from a state
-- that no longer exists by the time the run ends. The `(analyze)` here is what
-- actually leaves this model with correct stats. Left in place because it is a
-- project-wide hook and other models depend on it.
--
-- 🔵 COMMENT ON INDEX is imac's suggestion, and it is a good one: a note that
-- must survive a maintenance window belongs where the person holding the DROP
-- will read it, which is the catalogue, not this file.
--
-- 🔴 WHY THAT PARTIAL COVERING INDEX EXISTS, AND WHY dbt's `indexes:` COULD NOT
-- DECLARE IT.
--
-- api_v1.kommune_ngo_summary and api_v1.kommune_ngo_totals are views over this
-- table. Unfiltered — which is how anyone consumes a 357-row national rollup —
-- the aggregate cannot be pushed below the LIMIT, so it is a full pass.
--
-- ⚠️ MEASURED ON THE LIVE API (ops-dev, urb-agents #1268):
--
--     ?kommune_nr=eq.3411   filtered      0.65 s
--     all 357 rows          unfiltered   25.3 s cold, ~3.9 s warm, for 24 kB
--
-- The plan was an Index Scan on `registrert_i_frivillighetsregisteret` followed
-- by ~68 000 heap fetches scattered across a 2.3 GB table. Warm that is
-- tolerable; cold it is 68 000 random reads and one request TIMED OUT.
--
-- ✅ This index carries the filter as a predicate and the group-by keys as its
-- columns, so the aggregate becomes an INDEX-ONLY SCAN with Heap Fetches: 0 —
-- the 2.3 GB table is never touched.
--
-- MEASURED on a local Postgres 15 against a synthetic register matched to the
-- real one on row count, payload size (~1.7 kB, 2344 MB total) and the real
-- ~10.3 % null-kommune / ~6 % voluntary shares:
--
--     without   206-379 ms warm   Index Scan + 68 460 heap fetches
--     with       18.3-18.5 ms     Index Only Scan, Heap Fetches: 0
--     index size 600 kB
--
-- ⚠️ BOTH OF THOSE FIXTURE NUMBERS WERE OPTIMISTIC, MEASURED LIVE AFTER DEPLOY
-- (urb-agents #1270):
--
--     in-db, post-vacuum     286-390 ms      ~16-20x the 18 ms predicted here
--     end-to-end via the API 0.205-0.326 s   5 consecutive runs, all 357 rows
--     filtered               0.120 s
--     index size             872 kB          45 % over the 600 kB predicted
--
-- 🔵 25 s to a quarter-second is still the honest headline. `Heap Fetches: 0`
-- is the claim that held; every absolute number I predicted from a fixture did
-- not. Three fixtures, three wrong numbers, the mechanism right each time:
-- the first matched row COUNT and not row SIZE, so heap fetches were invisible;
-- the second was freshly built and therefore vacuum-clean, so the visibility
-- map was invisible; the third under-sized the index by 45 %. A synthetic
-- benchmark reproduces only the dimensions you thought to reproduce, and
-- reports a confident number for the ones you didn't.
--
-- ⚠️ `indexes:` in dbt-postgres takes columns / unique / type and cannot express
-- a WHERE predicate, which is the whole point of this one — a plain index on the
-- same columns would still fetch heap rows. Hence the post-hook, which is
-- idempotent and survives incremental runs because this model is not dropped.
--
-- 🔵 The alternative was materialising the rollups and refreshing them on
-- dim_brreg_enhet's cadence. That is the drift defect removed in #1265, bought
-- back deliberately. An index fixes the access pattern without reintroducing a
-- staleness window.

-- 🔴 INCREMENTAL, AND `delete+insert` IS THE PART THAT MAKES DELETIONS WORK.
--
-- Measured by imac (urb-agents #757): the dbt build went 117.9 s → 414.1 s when
-- the Brreg models arrived, so 72% of it is this lineage. A full rebuild of
-- 1.17M rows to apply the ~57 organisations that change in a quarter of an hour
-- is what kept served freshness a day behind a feed that is minutes behind.
--
-- 🔴 THE SECOND POST-HOOK EXISTS FOR THE SAME REASON AS THE FIRST, AND I ALMOST
-- SHIPPED THE SAME BUG TWICE.
--
-- The WHERE clause at the bottom now excludes rows with a null `doc`. That stops
-- new ones entering — and does nothing about the ones already in the table,
-- because `delete+insert` only deletes keys present in `tmp`, and the WHERE is
-- exactly what keeps them out of `tmp`.
--
-- ⚠️ Identical shape to the tombstone case below: **a filter that looks like it
-- removes rows is what prevents their removal.** I reasoned my way to that once,
-- imac falsified it with `DELETE 0` against `DELETE 1`, and I still had to catch
-- myself repeating it here. Anything excluded by that WHERE needs an explicit
-- delete, or it lives in the table forever.
--
-- Kept as a separate statement rather than folded into the first: one job each,
-- and the two have different reasons.
--
-- 🔴 `on_schema_change='fail'` — AND WHY NOT THE OTHER THREE.
--
-- dbt's default is `ignore`, and it took the whole Brreg pipeline down on an
-- upgrade (imac, urb-agents #780). Adding `reconciled_at` to this model meant an
-- EXISTING table never gained the column: the incremental run succeeded into the
-- old shape, `mart_brreg_enhet` then could not be created, and `api_v1` served
-- ZERO views — on every subsequent run, not just the first.
--
-- ⚠️ Two properties made it as bad as it was:
--   - **A fresh install never sees it.** There is no old table to preserve, so
--     the install path everyone tests is exactly the path that hides it.
--   - **The error surfaces two models away** from the config that causes it, so
--     whoever hits it starts debugging the mart.
--
-- `append_new_columns` looks like the obvious fix and is worse here. It adds the
-- column and leaves 1.17M existing rows NULL — and `reconciled_at` carries a
-- `not_null` test, so the build goes red anyway, now for a reason that reads
-- like a data problem rather than a migration. Dropping the test to suit would
-- weaken a contract to accommodate a mechanism. `sync_all_columns` has the same
-- flaw and also drops columns, which on a published surface is worse.
--
-- `fail` stops the run AT THIS MODEL with "the source and target schemas are out
-- of sync", which is the true statement. The upgrade is then a deliberate
-- `dbt build --full-refresh --select dim_brreg_enhet+`.
--
-- ⚠️ THAT COMMAND TOOK 1 438 s, NOT 256 s. This line said "256 s for 1.17M
-- rows, measured by imac" and sat directly beside the command — but the 256 s
-- measured THE DIMENSION ALONE, and the `+` also builds 58 data tests, 4 view
-- models and 1 table model. About 5.6x more work than the figure describes.
-- Measured 2026-09-24 by imac on the eec241d refresh: 1 437.94 s.
-- Plan a maintenance window off 1 438 s; quote 256 s only for the dimension.
--
-- 🔴 RUN THAT FULL REFRESH AS `atlas`, NOT AS A SUPERUSER. `--full-refresh`
-- drops and recreates, so the new tables take the running user's ownership. imac
-- did it as `postgres` while diagnosing this and the next Dagster run died with
-- `permission denied for table dim_brreg_enhet`. The repair is
-- `alter table … owner to atlas`, but not needing it is better.
--
-- 🔴 THE POST-HOOK IS NOT BELT-AND-BRACES. IT IS THE ONLY THING THAT DELETES.
--
-- I first wrote this relying on `delete+insert` alone, reasoning that a
-- tombstoned organisation's key would be dropped and the WHERE clause below
-- would decline to re-insert it. **That is wrong, and it is worth spelling out
-- because it is convincing.** dbt's delete+insert is:
--
--     delete from target where unique_key in (select unique_key from tmp);
--     insert into target select * from tmp;
--
-- The WHERE clause at the bottom of this model excludes tombstoned
-- organisations, so they are **not in tmp** — so the delete does not match them
-- and the row survives untouched, forever. The filter that looks like it removes
-- deletions is exactly what prevents them from being removed.
--
-- ⚠️ A full refresh hides this completely: the table is rebuilt from a select
-- that excludes them, so it looks correct. It only goes wrong on the second run
-- onward, and only for organisations deleted since the first.
--
-- So deletion is done explicitly, by the post-hook, where it can be read.
-- `tests/tombstoned_organisations_leave_the_dimension.sql` is what notices if it
-- stops working, and it was written before this config changed.
--
-- COST, since it scans the version history each run: the inner `distinct on` is
-- O(brreg_enheter_versions), which is append-only and grows ~2M rows/year. At
-- 51k rows today it is milliseconds. Revisit when that table passes ~5M rows —
-- with a measurement, as with the storage threshold in PLAN-003 phase 1.
--
-- Deletions silently not applying is this project's recurring failure: the
-- `Fjernet` sampling error, the feed's page cap (20 pages of `Ukjent` and never
-- a `Sletting`), and a bulk file that cannot express a deletion at all. All
-- three looked healthy.

-- dim_brreg_enhet — current state of every organisation in Enhetsregisteret.
--
-- Reconciles two raw inputs that answer different questions:
--   raw.brreg_enheter_snapshot  — the whole register at one moment (PLAN-001)
--   raw.brreg_enheter_versions  — every change since (PLAN-002)
--
-- 🔴 DELETION IS A FILTER, NEVER A DELETE.
--
-- A tombstoned organisation is excluded from current state and stays in the
-- version history, so "what did this look like before it was removed" remains
-- answerable. Deletions are 8.0% of change traffic (measured over seven days:
-- Sletting 7.3%, Fjernet 0.7%) and they arrive ONLY through the feed — a bulk
-- file cannot express one, because absence from a 1.17M-record file is
-- indistinguishable from a truncated download.
--
-- ⚠️ WHY THE SNAPSHOT IS NOT SIMPLY THE TRUTH.
--
-- The snapshot is a day old the moment it lands, and it can never lose a row.
-- The feed is current but only covers what changed. Neither alone is the
-- register. This model is the only place the two are combined, which is why it
-- is materialized as a table rather than a view: the reconciliation is the
-- expensive part and nothing downstream should repeat it.
--
-- ⚠️ TYPING IS SELECTIVE ON PURPOSE. The eight columns below are the ones Atlas
-- queries. The other ~35 fields stay in `doc`, available to anyone who needs one,
-- without this model having an opinion about all of them and without a migration
-- every time Brreg adds a field.

with

{% if is_incremental() %}
-- The organisations to rebuild this run: everything the feed has touched since
-- the newest change already reflected in the dimension.
--
-- 🔴 THE WATERMARK IS READ FROM `this`, NOT FROM raw.brreg_feed_watermark, AND
-- THE DIFFERENCE IS A DATA-LOSS BUG IN ONE DIRECTION.
--
-- The feed's watermark is how far the POLLER has consumed. It is normally ahead
-- of what this model has applied — the feed runs, then the transform runs. Using
-- it here would select changes newer than the feed's position and therefore skip
-- every change between the last build and the last poll. Silently, and only for
-- the organisations that actually changed, which is the worst possible subset.
--
-- ⚠️ Reading `max(last_oppdateringsid)` from `this` can only ever LAG, never
-- lead: a tombstoned organisation is absent from the dimension, so its id is not
-- counted, and the watermark sits at the newest surviving change instead. The
-- consequence is that a few changes get re-processed. Every write here is a
-- delete-then-insert keyed on organisasjonsnummer, so re-processing is a no-op.
--
-- Lagging costs work. Leading loses data. This reads the one that lags.
changed as (
  select distinct organisasjonsnummer
  from {{ source('raw', 'brreg_enheter_versions') }}
  where oppdateringsid > (
    select coalesce(max(last_oppdateringsid), 0) from {{ this }}
  )

  union

  -- 🔴 THE SECOND WRITER. Everything above selects organisations the FEED has
  -- touched. `raw` has two writers — the half-hourly feed and the manual bulk
  -- loader — and this model had one input path, so a BOOTSTRAP was invisible to
  -- it by construction.
  --
  -- ⚠️ Measured by imac on 2026-09-13 (urb-agents #835), and every surface said
  -- it worked: `brreg_bootstrap` rewrote all 1,174,007 snapshot rows,
  -- `transform_and_publish` succeeded in 329 s, Dagster recorded an
  -- ASSET_MATERIALIZATION for `marts/dim_brreg_enhet` — and the model wrote ZERO
  -- rows. A green materialisation of a model that wrote nothing is
  -- indistinguishable from one that wrote everything, which matters most because
  -- re-running the bootstrap is how an operator REPAIRS the register.
  --
  -- 🔴 THE WATERMARK IS `snapshot_loaded_at`, A SNAPSHOT-ONLY COLUMN, AND THAT IS
  -- THE WHOLE DESIGN. `last_seen_at` is `greatest(fetched_at, loaded_at)`, so a
  -- single recent feed change lifts it above every snapshot row and a predicate
  -- reading it would skip them — it would LEAD, and the note above is about
  -- exactly that: lagging costs work, leading loses data. A column only the bulk
  -- loader can move cannot be contaminated by the feed.
  --
  -- It lags safely: organisations the final filter excludes (tombstoned, or with
  -- a null document) never enter the dimension, so their `loaded_at` is not
  -- counted and the maximum sits at the newest SURVIVING row. Lagging means a few
  -- organisations get re-processed, and every write here is a delete-then-insert
  -- keyed on organisasjonsnummer, so re-processing is a no-op.
  --
  -- ⚠️ THE FIRST VERSION OF THIS DID IT WITH A JOIN AND IT WAS THE WRONG TRADE.
  -- `527455e` compared each snapshot row to its own dimension row — correct, and
  -- immune to the contamination above without needing a new column. imac measured
  -- it: 3,311 MB joined against 3,971 MB on every run, **+42 s per run, ~34 extra
  -- minutes of database work per day**, to serve a path taken about once a year
  -- (#837). "Cannot lead" is a correctness argument and it was doing duty as a
  -- performance one.
  --
  -- 🔵 The column costs a `--full-refresh` on upgrade, which is why it was
  -- rejected the first time — on an assumption that was never measured. imac has
  -- now measured it three times: **256 s, once**, for THE DIMENSION ALONE.
  -- 256 seconds once against 34 minutes a day is not a close call.
  -- ⚠️ The documented upgrade command is `--select dim_brreg_enhet+`, which
  -- also builds the tests and downstream models and took 1 438 s on 2026-09-24.
  -- The trade above is still not close; the window you book is the larger one.
  --
  -- Served by `brreg_enheter_snapshot_loaded_at_idx` (migration 055): an index
  -- range scan returning zero rows on an ordinary run, rather than a sequential
  -- scan of 3,311 MB to learn the same thing.
  select organisasjonsnummer
  from {{ source('raw', 'brreg_enheter_snapshot') }}
  where loaded_at > (
    select coalesce(max(snapshot_loaded_at), '-infinity'::timestamptz) from {{ this }}
  )
),
{% endif %}

snapshot as (
  select
    organisasjonsnummer,
    doc,
    snapshot_file_date,
    loaded_at
  from {{ source('raw', 'brreg_enheter_snapshot') }}
  {% if is_incremental() %}
  where organisasjonsnummer in (select organisasjonsnummer from changed)
  {% endif %}
),

-- The most recent change per organisation. `distinct on` with a descending
-- oppdateringsid is exact here because the id is Brreg's own monotonic sequence:
-- there are no ties to break, which is the whole reason the feed is walked by id
-- rather than by timestamp.
latest_change as (
  select distinct on (organisasjonsnummer)
    organisasjonsnummer,
    oppdateringsid,
    endringstype,
    doc as changed_doc,
    fetched_at
  from {{ source('raw', 'brreg_enheter_versions') }}
  {% if is_incremental() %}
  where organisasjonsnummer in (select organisasjonsnummer from changed)
  {% endif %}
  order by organisasjonsnummer, oppdateringsid desc
),

-- Organisations the feed has seen but the snapshot has not: registered after the
-- bulk file was generated. A full outer join rather than a left join, because
-- dropping these would mean the register silently lags the feed by up to a day
-- for every new organisation — 16.1% of change traffic is `Ny`.
combined as (
  select
    coalesce(s.organisasjonsnummer, c.organisasjonsnummer) as organisasjonsnummer,
    -- The changed document wins when there is one.
    --
    -- 🔵 STILL CORRECT NOW THAT A BOOTSTRAP CAN SELECT ROWS, and it is worth
    -- saying why, because the widened predicate above makes the case reachable
    -- for the first time: an organisation can now be rebuilt because its
    -- SNAPSHOT moved while an older feed change also exists for it, and the feed
    -- document wins anyway.
    --
    -- That is right, on one assumption that is worth naming rather than
    -- assuming: **the feed is lossless**. Every change reflected in a newer bulk
    -- file also travelled through `/oppdateringer`, by construction — the bulk
    -- file is a periodic rendering of the same register the feed streams. So a
    -- feed document is never older in register terms than a snapshot document,
    -- only fetched at a different moment. And a tombstone MUST win regardless:
    -- the snapshot cannot express a deletion at all.
    --
    -- ✅ MEASURED, NOT ASSUMED — imac, 2026-09-13 (urb-agents #839). This stopped
    -- being an assumption the day after it was written, and the numbers are here
    -- because a load-bearing assumption without its evidence beside it decays
    -- back into an assumption:
    --
    --     rows compared (of 866,000)                 865,876
    --     differing on navn / kommune_nr / konkurs        94
    --       explained by a feed change                    94
    --       UNEXPLAINED                                    0
    --     adjacent pairs (orgnr n and n+1 both differing)  0
    --     mean gap between differing orgnrs        1,689,072
    --
    -- 🔴 The zero adjacent pairs across 161 million is the part that settles it,
    -- not the 94. A lossy feed loses RUNS — a page cap, a cursor gap, a poll that
    -- failed — and produces a contiguous block. This is maximally scattered
    -- churn, which is what an intact feed and a stale file look like.
    --
    -- ⚠️ Exhaustive rather than sampled, which is stronger than what was asked
    -- for: the request was for a contiguous sample, because a scattered sample
    -- can pass over a clean-looking million. imac compared everything instead and
    -- made the caveat moot.
    --
    -- ⚠️ BOUND, stated because it is not 100%: this covers the 74% of rows
    -- carrying the newer file date. The remaining 308,239 still hold the file the
    -- dimension was built from, so there is nothing to compare there. A completed
    -- bootstrap would extend it.
    --
    -- If this ever has to be re-checked, the failure to look for is a contiguous
    -- block of differing organisations, not a high count.
    --
    -- ⚠️ For a tombstone this is
    -- Brreg's six-key deletion stub, NOT a full record — a deleted organisation
    -- still answers HTTP 200. Such rows are excluded from current state below,
    -- so the stub never reaches a consumer expecting an Enhet.
    coalesce(c.changed_doc, s.doc) as doc,
    c.endringstype,
    c.oppdateringsid,
    s.snapshot_file_date,
    -- 🔴 The bulk loader's write time, carried through UNCHANGED and never
    -- combined with the feed's. `last_seen_at` below deliberately mixes both;
    -- this one must not, because the incremental predicate reads its maximum to
    -- decide what the bulk loader has written since. Mixing them would let a feed
    -- change advance the snapshot watermark and skip real snapshot rows.
    s.loaded_at as snapshot_loaded_at,
    greatest(coalesce(c.fetched_at, s.loaded_at), coalesce(s.loaded_at, c.fetched_at)) as last_seen_at
  from snapshot s
  full outer join latest_change c
    on s.organisasjonsnummer = c.organisasjonsnummer
),

-- Frivillighetsregisteret enrichment (PLAN-003 phase 3). LEFT JOIN, never inner:
-- ~72,798 of 1.17M organisations are in this register, and an inner join would
-- silently reduce the dimension to the voluntary sector.
--
-- 🔴 This does NOT supply membership. `registrertIFrivillighetsregisteret` below
-- comes from the Enhetsregister document and is on 100% of records, so the NGO
-- population is derived without this table. Only icnpo_* and the
-- frivillighetsregister-specific attributes depend on it — which means a day when this register is unreachable
-- costs Atlas its classifications, not its NGO population.
frivillig as (
  select
    organisasjonsnummer,
    icnpo_nummer,
    icnpo_kategori,
    doc as frivillig_doc
  from {{ source('raw', 'brreg_frivillige') }}
),

typed as (
  select
    organisasjonsnummer,
    doc ->> 'navn'                                               as navn,
    doc -> 'organisasjonsform' ->> 'kode'                        as organisasjonsform_kode,
    doc -> 'organisasjonsform' ->> 'beskrivelse'                 as organisasjonsform_beskrivelse,
    doc -> 'naeringskode1' ->> 'kode'                            as naeringskode1_kode,
    doc -> 'forretningsadresse' ->> 'kommunenummer'              as kommune_nr,
    -- ⚠️ `antallAnsatte` is present on 72 097 of 1 175 334 records — 6.13%,
    -- COUNTED by jsonb_object_keys on 2026-09-24 (urb-agents #1458) — while
    -- `harRegistrertAntallAnsatte` is on 100%.
    --
    -- 🔵 This line said "~4% (13 of 300 sampled live on 2026-09-12)" until
    -- 2026-09-24. A 300-row sample, wrong by half, in a comment that read as
    -- settled. Four instruments in this data have now failed the same way; the
    -- conclusion below is untouched and was always right. NULL
    -- here therefore means "not reported", which is NOT the same as zero
    -- employees — and a coverage analysis that reads NULL as 0 understates
    -- staffed organisations by a wide margin. Both columns are kept so the
    -- distinction survives.
    nullif(doc ->> 'antallAnsatte', '')::integer                 as antall_ansatte,
    coalesce((doc ->> 'harRegistrertAntallAnsatte')::boolean, false)
                                                                 as har_registrert_antall_ansatte,
    coalesce((doc ->> 'konkurs')::boolean, false)                as konkurs,
    coalesce((doc ->> 'underAvvikling')::boolean, false)         as under_avvikling,
    coalesce((doc ->> 'underTvangsavviklingEllerTvangsopplosning')::boolean, false)
                                                                 as under_tvangsavvikling,
    coalesce((doc ->> 'registrertIFrivillighetsregisteret')::boolean, false)
                                                                 as registrert_i_frivillighetsregisteret,
    nullif(doc ->> 'registreringsdatoEnhetsregisteret', '')::date as registrert_dato,
    nullif(doc ->> 'slettedato', '')::date                       as slettedato,
    f.icnpo_nummer,
    f.icnpo_kategori,
    f.frivillig_doc -> 'grasrotandel' ->> 'deltarI'              as grasrotandel_deltar_i,
    nullif(f.frivillig_doc ->> 'innfoertDato', '')::date         as frivillig_innfoert_dato,
    -- ── contact details ──────────────────────────────────────────────
    -- 🔴 EXTRACTED ON TERJE'S DECISION, 2026-09-24 (urb-agents #1457):
    -- "yes the ENK are businesses, extract all the fields". An
    -- enkeltpersonforetak is a registered business and these are the
    -- contact details it registered AS one; Brreg publishes them under
    -- NLOD. That reasoning is indifferent to the row counts, which is why
    -- the counts doubling on re-measurement did not change the answer.
    -- Measured 2026-09-24 by count=exact over all 1 175 298 rows:
    --   epostadresse 324 959 (27.65%) · mobil 308 984 (26.29%)
    --   telefon 194 519 (16.55%) · hjemmeside 114 070 (9.71%)
    doc ->> 'epostadresse'                                            as epostadresse,
    doc ->> 'mobil'                                                   as mobil,
    doc ->> 'telefon'                                                 as telefon,
    doc ->> 'hjemmeside'                                              as hjemmeside,
    -- ── registry memberships ─────────────────────────────────────────
    (doc ->> 'registrertIMvaregisteret')::boolean                     as registrert_i_mvaregisteret,
    (doc ->> 'registrertIForetaksregisteret')::boolean                as registrert_i_foretaksregisteret,
    (doc ->> 'registrertIStiftelsesregisteret')::boolean              as registrert_i_stiftelsesregisteret,
    (doc ->> 'registrertIPartiregisteret')::boolean                   as registrert_i_partiregisteret,
    (doc ->> 'erIKonsern')::boolean                                   as er_i_konsern,
    -- ── registration and event dates ─────────────────────────────────
    -- 🔵 Upstream sends every one of these as a STRING. Casting to date
    -- is a derivation and therefore Atlas's to get right; raw keeps the
    -- verbatim string.
    nullif(doc ->> 'stiftelsesdato', '')::date                              as stiftelsesdato,
    nullif(doc ->> 'vedtektsdato', '')::date                                as vedtektsdato,
    nullif(doc ->> 'registreringsdatoForetaksregisteret', '')::date         as registreringsdato_foretaksregisteret,
    nullif(doc ->> 'registreringsdatoMerverdiavgiftsregisteret', '')::date  as registreringsdato_merverdiavgiftsregisteret,
    nullif(doc ->> 'registreringsdatoMerverdiavgiftsregisteretEnhetsregisteret', '')::date as registreringsdato_mva_enhetsregisteret,
    nullif(doc ->> 'registreringsdatoFrivilligMerverdiavgiftsregisteret', '')::date as registreringsdato_frivillig_mva,
    nullif(doc ->> 'registreringsdatoFrivillighetsregisteret', '')::date    as registreringsdato_frivillighetsregisteret,
    nullif(doc ->> 'registreringsdatoAntallAnsatteEnhetsregisteret', '')::date as registreringsdato_antall_ansatte_enhetsreg,
    nullif(doc ->> 'registreringsdatoAntallAnsatteNAVAaregisteret', '')::date as registreringsdato_antall_ansatte_nav,
    nullif(doc ->> 'fravalgRevisjonDato', '')::date                         as fravalg_revisjon_dato,
    nullif(doc ->> 'fravalgRevisjonBeslutningsDato', '')::date              as fravalg_revisjon_beslutnings_dato,
    -- ── distress and dissolution ─────────────────────────────────────
    -- 🔴 THE SPARSITY IS THE SIGNAL. These are 99%+ null because few
    -- organisations reach these states — which is exactly what a
    -- consumer filtering for distressed organisations needs. Measured
    -- 2026-09-24: konkursdato 3 249 · underAvviklingDato 7 396 ·
    -- tvangsopplost…Regnskap 975 · …Revisor 302 · …Styre 106 ·
    -- underRekonstruksjonsforhandlingDato 15.
    nullif(doc ->> 'konkursdato', '')::date                                 as konkursdato,
    nullif(doc ->> 'underAvviklingDato', '')::date                          as under_avvikling_dato,
    nullif(doc ->> 'tvangsopplostPgaManglendeRegnskapDato', '')::date       as tvangsopplost_pga_manglende_regnskap_dato,
    nullif(doc ->> 'tvangsopplostPgaManglendeRevisorDato', '')::date        as tvangsopplost_pga_manglende_revisor_dato,
    nullif(doc ->> 'tvangsopplostPgaMangelfulltStyreDato', '')::date        as tvangsopplost_pga_mangelfullt_styre_dato,
    nullif(doc ->> 'underRekonstruksjonsforhandlingDato', '')::date         as under_rekonstruksjonsforhandling_dato,
    -- 🔴 THE THREE KEYS MY 20 000-ROW SAMPLE MISSED. imac's
    -- jsonb_object_keys enumeration returned 64 keys against my floor of 61
    -- (urb-agents #1458). Two of them are on 24 and 2 rows — no sample was
    -- ever going to find those, which is the whole argument for enumerating.
    nullif(doc ->> 'tvangsavvikletPgaManglendeSlettingDato', '')::date as tvangsavviklet_pga_manglende_sletting_dato,
    nullif(doc ->> 'registreringsdatoPartiregisteret', '')::date       as registreringsdato_partiregisteret,
    nullif(doc ->> 'underUtenlandskInsolvensbehandlingDato', '')::date as under_utenlandsk_insolvensbehandling_dato,
    -- ── classification codes ─────────────────────────────────────────
    doc -> 'naeringskode1' ->> 'beskrivelse'                      as naeringskode1_beskrivelse,
    doc -> 'naeringskode2' ->> 'kode'                             as naeringskode2_kode,
    doc -> 'naeringskode2' ->> 'beskrivelse'                      as naeringskode2_beskrivelse,
    doc -> 'naeringskode3' ->> 'kode'                             as naeringskode3_kode,
    doc -> 'naeringskode3' ->> 'beskrivelse'                      as naeringskode3_beskrivelse,
    doc -> 'institusjonellSektorkode' ->> 'kode'                  as institusjonell_sektorkode_kode,
    doc -> 'institusjonellSektorkode' ->> 'beskrivelse'           as institusjonell_sektorkode_beskrivelse,
    doc -> 'hjelpeenhetskode' ->> 'kode'                          as hjelpeenhetskode_kode,
    doc -> 'hjelpeenhetskode' ->> 'beskrivelse'                   as hjelpeenhetskode_beskrivelse,
    -- ── addresses ────────────────────────────────────────────────────
    -- ⚠️ `adresse` is an ARRAY of street lines upstream, not a string.
    coalesce((select array_agg(x) from jsonb_array_elements_text(doc -> 'forretningsadresse' -> 'adresse') x), '{}')::text[] as forretningsadresse_adresse,
    doc -> 'forretningsadresse' ->> 'postnummer'                  as forretningsadresse_postnummer,
    doc -> 'forretningsadresse' ->> 'poststed'                    as forretningsadresse_poststed,
    doc -> 'forretningsadresse' ->> 'kommune'                     as forretningsadresse_kommune,
    doc -> 'forretningsadresse' ->> 'land'                        as forretningsadresse_land,
    doc -> 'forretningsadresse' ->> 'landkode'                    as forretningsadresse_landkode,
    coalesce((select array_agg(x) from jsonb_array_elements_text(doc -> 'postadresse' -> 'adresse') x), '{}')::text[] as postadresse_adresse,
    doc -> 'postadresse' ->> 'postnummer'                         as postadresse_postnummer,
    doc -> 'postadresse' ->> 'poststed'                           as postadresse_poststed,
    doc -> 'postadresse' ->> 'kommune'                            as postadresse_kommune,
    doc -> 'postadresse' ->> 'kommunenummer'                      as postadresse_kommune_nr,
    doc -> 'postadresse' ->> 'land'                               as postadresse_land,
    doc -> 'postadresse' ->> 'landkode'                           as postadresse_landkode,
    -- ── capital, foreign registration, group ─────────────────────────
    nullif(doc -> 'kapital' ->> 'belop', '')::numeric             as kapital_belop,
    doc -> 'kapital' ->> 'valuta'                                 as kapital_valuta,
    nullif(doc -> 'kapital' ->> 'antallAksjer', '')::bigint       as kapital_antall_aksjer,
    nullif(doc -> 'kapital' ->> 'innfortDato', '')::date          as kapital_innfort_dato,
    doc -> 'kapital' ->> 'type'                                   as kapital_type,
    (doc -> 'kapital' ->> 'fulltInnbetalt')::boolean              as kapital_fullt_innbetalt,
    nullif(doc -> 'kapital' ->> 'innbetalt', '')::numeric         as kapital_innbetalt,
    doc -> 'foretaksformIHjemlandet' ->> 'kode'                   as foretaksform_i_hjemlandet_kode,
    doc -> 'foretaksformIHjemlandet' ->> 'beskrivelse'            as foretaksform_i_hjemlandet_beskrivelse,
    doc -> 'foretaksformIHjemlandet' ->> 'beskrivelseBokmaal'     as foretaksform_i_hjemlandet_beskrivelse_bokmaal,
    doc -> 'utenlandskRegisterAdresse' ->> 'adresse'              as utenlandsk_register_adresse_adresse,
    doc -> 'utenlandskRegisterAdresse' ->> 'poststed'             as utenlandsk_register_adresse_poststed,
    doc -> 'utenlandskRegisterAdresse' ->> 'land'                 as utenlandsk_register_adresse_land,
    doc ->> 'utenlandskRegisterNavn'                                  as utenlandsk_register_navn,
    doc ->> 'registreringsnummerIHjemlandet'                          as registreringsnummer_i_hjemlandet,
    doc ->> 'underlagtLovgivningLand'                                 as underlagt_lovgivning_land,
    doc ->> 'underlagtLovgivningLandKode'                             as underlagt_lovgivning_landkode,
    doc ->> 'overordnetEnhet'                                         as overordnet_enhet,
    doc ->> 'maalform'                                                as maalform,
    -- 🔵 A YEAR, sent as a string. Guarded rather than cast blindly: a
    -- single malformed value would fail the build across 1.17M rows.
    case when doc ->> 'sisteInnsendteAarsregnskap' ~ '^[0-9]{4}$'
         then (doc ->> 'sisteInnsendteAarsregnskap')::int end     as siste_innsendte_aarsregnskap,
    -- ── arrays ───────────────────────────────────────────────────────
    -- 🔴 ELEMENT TYPES VERIFIED AGAINST NON-EMPTY ROWS, not assumed. My
    -- first plan said text[] for all the prose lists; `paategninger`
    -- turned out to hold OBJECTS ({tekst, …} enforcement notices), and
    -- an array column's type cannot be changed after publication
    -- without breaking callers.
    coalesce((select array_agg(x) from jsonb_array_elements_text(doc -> 'aktivitet') x), '{}')::text[] as aktivitet,
    coalesce((select array_agg(x) from jsonb_array_elements_text(doc -> 'vedtektsfestetFormaal') x), '{}')::text[] as vedtektsfestet_formaal,
    coalesce((select array_agg(x) from jsonb_array_elements_text(doc -> 'frivilligMvaRegistrertBeskrivelser') x), '{}')::text[] as frivillig_mva_registrert_beskrivelser,
    doc -> 'historiskeNavn'                                          as historiske_navn,
    doc -> 'paategninger'                                            as paategninger,
    endringstype,
    oppdateringsid,
    snapshot_file_date,
    snapshot_loaded_at,
    last_seen_at,
    doc
  from combined
  left join frivillig f using (organisasjonsnummer)
)

select
  organisasjonsnummer,
  navn,
  organisasjonsform_kode,
  organisasjonsform_beskrivelse,
  naeringskode1_kode,
  kommune_nr,
  antall_ansatte,
  har_registrert_antall_ansatte,
  konkurs,
  under_avvikling,
  under_tvangsavvikling,
  registrert_i_frivillighetsregisteret,
  registrert_dato,
  icnpo_nummer,
  icnpo_kategori,
  (grasrotandel_deltar_i = 'true') as grasrotandel_deltar_i,
  frivillig_innfoert_dato,
  -- ── extracted from `doc` on Terje's instruction, 2026-09-24 ──────
  epostadresse,
  mobil,
  telefon,
  hjemmeside,
  registrert_i_mvaregisteret,
  registrert_i_foretaksregisteret,
  registrert_i_stiftelsesregisteret,
  registrert_i_partiregisteret,
  er_i_konsern,
  stiftelsesdato,
  vedtektsdato,
  registreringsdato_foretaksregisteret,
  registreringsdato_merverdiavgiftsregisteret,
  registreringsdato_mva_enhetsregisteret,
  registreringsdato_frivillig_mva,
  registreringsdato_frivillighetsregisteret,
  registreringsdato_antall_ansatte_enhetsreg,
  registreringsdato_antall_ansatte_nav,
  fravalg_revisjon_dato,
  fravalg_revisjon_beslutnings_dato,
  konkursdato,
  under_avvikling_dato,
  tvangsopplost_pga_manglende_regnskap_dato,
  tvangsopplost_pga_manglende_revisor_dato,
  tvangsopplost_pga_mangelfullt_styre_dato,
  under_rekonstruksjonsforhandling_dato,
  tvangsavviklet_pga_manglende_sletting_dato,
  registreringsdato_partiregisteret,
  under_utenlandsk_insolvensbehandling_dato,
  naeringskode1_beskrivelse,
  naeringskode2_kode,
  naeringskode2_beskrivelse,
  naeringskode3_kode,
  naeringskode3_beskrivelse,
  institusjonell_sektorkode_kode,
  institusjonell_sektorkode_beskrivelse,
  hjelpeenhetskode_kode,
  hjelpeenhetskode_beskrivelse,
  forretningsadresse_adresse,
  forretningsadresse_postnummer,
  forretningsadresse_poststed,
  forretningsadresse_kommune,
  forretningsadresse_land,
  forretningsadresse_landkode,
  postadresse_adresse,
  postadresse_postnummer,
  postadresse_poststed,
  postadresse_kommune,
  postadresse_kommune_nr,
  postadresse_land,
  postadresse_landkode,
  kapital_belop,
  kapital_valuta,
  kapital_antall_aksjer,
  kapital_innfort_dato,
  kapital_type,
  kapital_fullt_innbetalt,
  kapital_innbetalt,
  foretaksform_i_hjemlandet_kode,
  foretaksform_i_hjemlandet_beskrivelse,
  foretaksform_i_hjemlandet_beskrivelse_bokmaal,
  utenlandsk_register_adresse_adresse,
  utenlandsk_register_adresse_poststed,
  utenlandsk_register_adresse_land,
  utenlandsk_register_navn,
  registreringsnummer_i_hjemlandet,
  underlagt_lovgivning_land,
  underlagt_lovgivning_landkode,
  overordnet_enhet,
  maalform,
  siste_innsendte_aarsregnskap,
  aktivitet,
  vedtektsfestet_formaal,
  frivillig_mva_registrert_beskrivelser,
  historiske_navn,
  paategninger,
  -- "Trading" rather than "exists". An organisation in konkurs or under
  -- avvikling is still registered and still answers from Brreg; it is simply not
  -- something a coverage analysis should count as an operating body. Consumers
  -- who want everything registered should ignore this column rather than expect
  -- it to mean something else.
  not (konkurs or under_avvikling or under_tvangsavvikling) as is_active,
  endringstype as last_endringstype,
  oppdateringsid as last_oppdateringsid,
  snapshot_file_date,
  snapshot_loaded_at,
  last_seen_at,
  -- 🔴 THE SECOND CLOCK. `last_seen_at` says when the INGEST last wrote this
  -- organisation into raw; this says when the TRANSFORM last reconciled it into
  -- marts. They are different times and the gap between them is real: the feed
  -- polls every half hour and the reconciliation follows ten minutes later.
  --
  -- Without both, "current" means two different things depending on which table
  -- you read — raw can be minutes fresh while the served API is hours stale, and
  -- a consumer of api_v1 has no way to tell. That was invisible until imac's
  -- acceptance host sat 13.5 hours behind Brreg with every check green.
  --
  -- ⚠️ On an incremental run only the rebuilt organisations get a new value, which
  -- is the honest answer rather than a limitation: a row untouched since Tuesday
  -- was last reconciled on Tuesday, and stamping it with today's build time would
  -- assert a freshness the row does not have.
  --
  -- `run_started_at` is dbt's own timestamp for the invocation, so it cannot
  -- drift from the build the way a hand-set now() in a post-hook could.
  '{{ run_started_at }}'::timestamptz as reconciled_at,
  doc
from typed
-- 🔴 The deletion filter. Tombstoned rows stay in raw.brreg_enheter_versions and
-- are excluded here. `slettedato` is belt and braces: it catches an organisation
-- deleted between the snapshot and the first feed run, where no version row
-- exists yet to carry the endringstype.
where coalesce(endringstype, '') not in ('Sletting', 'Fjernet')
  and slettedato is null
  -- 🔴 An organisation the feed MENTIONED but nothing ever DESCRIBED is not a
  -- register entry, and must not be served as one.
  --
  -- The feed reports changes for organisations the bulk file never contained,
  -- and an `Ukjent` change carries no usable document. The full outer join above
  -- is right to let them in — a `Ny` organisation registered after the snapshot
  -- must appear — but a row whose `doc` is null has every typed column null and
  -- says nothing about anybody.
  --
  -- ⚠️ AND IT DOES NOT SAY NOTHING. It asserts. `coalesce((doc ->> 'konkurs'),
  -- false)` turns an absent document into the positive claim that the
  -- organisation is NOT bankrupt and NOT being wound up, and `is_active` then
  -- reads true. imac found 145 such rows on the public API (urb-agents #780):
  -- no name, no legal form, no kommune — and `konkurs: false`, stated as fact,
  -- on a register of ~462,000 natural persons.
  --
  -- 🔵 The contract already said these rows should not exist: `not_null` on
  -- `navn`, `organisasjonsform_kode` and `doc` all failed on the scheduled run.
  -- The model was emitting rows its own tests forbade, so this makes the model
  -- enforce what the schema already asserted rather than adding a new rule.
  --
  -- An organisation excluded here is not lost: it is absent until a change
  -- arrives carrying a document, and then it appears complete. Omitting what we
  -- cannot describe is the honest failure; publishing defaults is not.
  and doc is not null
