-- Singular dbt test: an organisation Brreg has deleted must not be served as
-- current state, no matter how dim_brreg_enhet was last built.
--
-- 🔴 WHY THIS EXISTS, AND WHY IT WAS WRITTEN BEFORE THE MODEL IT GUARDS
--
-- dim_brreg_enhet became INCREMENTAL so the Brreg lineage could be rebuilt on a
-- feed's cadence instead of a nightly full rebuild (~72% of the dbt build was
-- the Brreg additions, measured by imac on urb-agents #757).
--
-- An incremental model does not remove rows. It appends and updates. So the one
-- thing that stops a deleted organisation living forever in the dimension is
-- that `delete+insert` removes its key before re-selecting, and the model's
-- WHERE clause then declines to re-insert it.
--
-- That is a correct but entirely invisible mechanism: nothing about the model
-- reads as "this is how deletions are applied", and every row count stays
-- plausible when it breaks. Deletions silently not applying is this project's
-- recurring failure — it is the shape of the `Fjernet` sampling error, of the
-- change feed's page cap (a poller that walks 20 pages of `Ukjent` and never
-- sees a `Sletting`), and of the bulk loader that cannot express a deletion at
-- all. Every one of those looked healthy.
--
-- ⚠️ Switching the model to `append` or `merge`, or dropping `unique_key`, all
-- break this while leaving the build green. This test is what notices.
--
-- HOW IT WORKS
--
-- raw.brreg_enheter_versions is the authority on what was deleted: a `Sletting`
-- or `Fjernet` row is a tombstone. An organisation whose LATEST version is a
-- tombstone must be absent from the dimension.
--
-- ⚠️ "Latest" is load-bearing. An organisation can be deleted and re-registered
-- under the same organisasjonsnummer — the number is retained after deletion,
-- which is exactly what makes it a safe join key. Testing "has any tombstone"
-- rather than "its newest version is a tombstone" would fail on a legitimately
-- revived organisation. Ranking by oppdateringsid is exact here because it is
-- Brreg's own monotonic sequence; there are no ties to break.
--
-- Returns one row per violation, so dbt fails and names the offenders.
--
-- ⚠️ WHY raw.brreg_enheter_versions IS NAMED LITERALLY AND NOT VIA source().
--
-- dagster-dbt attaches a singular test as an ASSET CHECK only when the test has
-- exactly ONE dbt parent. Measured against this repo's own manifest:
--
--   contents_code_identifies_an_indicator   1 parent (a model)   attached ✓
--   raw_sources_were_refreshed_recently     1 parent (a model)   attached ✓
--   this test, with source() + ref()        2 parents            attached ✗
--
-- Two parents and the test still exists in the manifest, still passes `dbt test`
-- — and nothing in the pipeline ever runs it. The image build refuses that
-- ("these singular dbt tests are in the manifest but nothing runs them"), which
-- is how this was caught rather than shipped as decorative coverage.
--
-- So the dependency on the version history is deliberately untracked, to keep
-- `ref('dim_brreg_enhet')` the single parent and keep the check wired up. The
-- cost is a missing lineage edge; the alternative was a test that does not run.
-- raw.brreg_enheter_versions is created by migration 053 and its name is fixed
-- there.

with latest_version as (
  select distinct on (organisasjonsnummer)
    organisasjonsnummer,
    oppdateringsid,
    endringstype
  from raw.brreg_enheter_versions
  order by organisasjonsnummer, oppdateringsid desc
),

tombstoned as (
  select organisasjonsnummer, oppdateringsid, endringstype
  from latest_version
  where endringstype in ('Sletting', 'Fjernet')
)

select
  t.organisasjonsnummer,
  t.endringstype,
  t.oppdateringsid,
  'deleted upstream but still served as current state' as failure
from tombstoned t
join {{ ref('dim_brreg_enhet') }} d
  on d.organisasjonsnummer = t.organisasjonsnummer
