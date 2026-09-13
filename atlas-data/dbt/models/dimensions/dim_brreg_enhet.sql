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
      """
    ],
    indexes=[
      {'columns': ['organisasjonsnummer'], 'unique': True},
      {'columns': ['kommune_nr']},
      {'columns': ['registrert_i_frivillighetsregisteret']},
      {'columns': ['is_active']}
    ]
  )
}}

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
-- `dbt build --full-refresh --select dim_brreg_enhet+` — 256 s for 1.17M rows,
-- measured by imac.
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
  -- now measured it three times: **256 s, once**. 256 seconds once against 34
  -- minutes a day is not a close call.
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
-- population is derived without this table. Only icnpo_* and the FRR-specific
-- attributes depend on it — which means a day when this register is unreachable
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
    -- ⚠️ `antallAnsatte` is present on only ~4% of records (13 of 300 sampled
    -- live on 2026-09-12), while `harRegistrertAntallAnsatte` is on 100%. NULL
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
