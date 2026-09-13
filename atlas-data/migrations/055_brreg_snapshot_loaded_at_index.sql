-- 055 — index raw.brreg_enheter_snapshot(loaded_at)
--
-- 🔴 WHY: dim_brreg_enhet's incremental predicate asks "which organisations has
-- the bulk loader written since this dimension last applied one?" Without an
-- index that question is a sequential scan of a 3,311 MB table, every half hour,
-- to return zero rows in the steady state.
--
-- ⚠️ This exists because the FIRST attempt at that question (527455e) avoided the
-- index by joining the snapshot to the dimension per organisation instead —
-- 3,311 MB against 3,971 MB on every run. imac measured it at +42 s per run,
-- ~34 extra minutes of database work per day, to serve a path taken about once a
-- year (urb-agents #837). An index scan returning nothing is the cheap shape of
-- the same question.
--
-- 🔵 Deliberately a plain btree on one column and nothing more. The snapshot
-- table carries no index beyond its primary key on purpose — a GIN index on
-- `doc` was measured at +42% load time and declined in PLAN-001 — so this is
-- added for a named query, not in case something needs it.
--
-- NOT `concurrently`: this runs inside the migration runner's transaction, and
-- the table is not being written during migrations. A bulk load takes minutes and
-- is manual; the feed writes brreg_enheter_versions, not this table.

create index if not exists brreg_enheter_snapshot_loaded_at_idx
  on raw.brreg_enheter_snapshot (loaded_at);

comment on index raw.brreg_enheter_snapshot_loaded_at_idx is
  'Serves dim_brreg_enhet''s incremental predicate: rows the bulk loader wrote after the newest snapshot_loaded_at already in the dimension. Returns nothing on an ordinary run.';
