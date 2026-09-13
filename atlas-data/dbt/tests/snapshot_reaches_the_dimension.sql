-- Singular dbt test: everything the bulk snapshot knows must have reached the
-- published dimension. Fails with one row per organisation the snapshot has
-- loaded more recently than the dimension reconciled it.
--
-- 🔴 WHY THIS EXISTS — it is the check that would have caught urb-agents #835,
-- and the reason it did not exist is instructive.
--
-- `raw` has TWO writers: the change feed (`brreg-oppdateringer`, half-hourly)
-- and the bulk loader (`brreg_bootstrap`, manual, once). `dim_brreg_enhet`'s
-- incremental predicate had ONE input path — organisations the feed had touched
-- since the dimension's watermark. A bootstrap produces no
-- `brreg_enheter_versions` rows, so it could not appear in that predicate at all.
--
-- ⚠️ Measured by imac on 2026-09-13: a bootstrap rewrote all 1,174,007 snapshot
-- rows, `transform_and_publish` SUCCEEDED in 329 s, Dagster recorded an
-- ASSET_MATERIALIZATION for `marts/dim_brreg_enhet` — and zero rows were written.
-- `max(reconciled_at)` still predated the run.
--
-- 🔴 THE POINT THAT GENERALISES: the asset materialisation IS the check, and it
-- cannot exhibit this failure. A green materialisation of a model that wrote
-- nothing looks exactly like one that wrote everything. Exit status, freshness,
-- row counts and a 200 from the API all agreed it had worked. The only way to
-- see it was to ask whether the OUTPUT reflects the INPUT — which is this test,
-- and which no status signal can answer on the model's behalf.
--
-- ⚠️ That matters most in the case nobody rehearses: re-running the bootstrap is
-- what an operator would do to REPAIR the register after a bad load, and it is
-- precisely then that "it ran and reported success" is the only evidence they
-- have.
--
-- WHAT THIS ASSERTS, AND WHAT IT DOES NOT
--
-- `last_seen_at` on the dimension is `greatest(fetched_at, loaded_at)` — the
-- newest moment either writer touched the organisation. So a row is a failure
-- only when the SNAPSHOT is ahead of everything the dimension has applied.
--
-- 🔵 The inner join is deliberate. Organisations the dimension legitimately
-- excludes — tombstoned by `Sletting`/`Fjernet`, or carrying a null document —
-- are absent from `{{ ref('dim_brreg_enhet') }}`, and this test must not demand
-- their return. Their exclusion is the tombstone test's business, not this one's.
--
-- 🔴 `raw.brreg_enheter_snapshot` is written literally rather than through
-- `source()`, so `ref('dim_brreg_enhet')` is this test's SINGLE dbt parent and it
-- becomes an asset check on that asset rather than a free-floating test. Same
-- reason and same shape as `tombstoned_organisations_leave_the_dimension.sql`.

select
  s.organisasjonsnummer,
  s.loaded_at   as snapshot_loaded_at,
  d.last_seen_at,
  d.reconciled_at
from raw.brreg_enheter_snapshot s
join {{ ref('dim_brreg_enhet') }} d
  on d.organisasjonsnummer = s.organisasjonsnummer
where s.loaded_at > d.last_seen_at
