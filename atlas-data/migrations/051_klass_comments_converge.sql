-- 051_klass_comments_converge.sql
-- Make the migration set converge on the FIRST run instead of the second.
--
-- THE BUG THIS FIXES
--
-- Applying migrations/*.sql twice produced two different schemas. Measured on
-- Postgres 15.18, 2026-09-09: pass 1 -> pass 2 differed on 25 lines; pass 2 ->
-- pass 3 was identical. So the set converged, but only at n=2, and the state it
-- converged to was the wrong one.
--
-- Mechanism:
--
--   006/007 create raw.ssb_klass_{kommuner,fylker} in the old snapshot shape and
--   set their comments *unconditionally*.
--
--   008 switches both tables to the history shape, guarded: it drops+recreates
--   only if valid_from_in_range is missing, and sets its own comments inside
--   that guard.
--
--   Run 1: 006/007 comment, then 008 recreates (destroying 006/007's column
--          comments) and sets its own. Correct.
--   Run 2: 006/007's CREATE TABLE IF NOT EXISTS skips — but their COMMENT
--          statements are not conditional, so they fire and overwrite 008's,
--          and re-attach column comments to a table whose shape no longer
--          matches them. 008's guard then sees the history shape and skips
--          entirely, so it never re-asserts. The old comments win.
--
-- The visible result was a history table documented as "Active kommuner at the
-- ingest date", with valid_from described as "NULL for a codesAt snapshot" —
-- describing a schema that had been dropped two migrations earlier. Comments are
-- not cosmetic here: they reach pg_description, and dbt's persist_docs and any
-- catalogue introspection read them.
--
-- 008's guard is not the fault and is not changed. The fault is that 006/007's
-- unconditional comments outlive the shape they describe.
--
-- WHY A NEW FILE RATHER THAN AN EDIT
--
-- migrations/README.md: don't amend an applied migration, add a new one. This
-- runs last, so its comments always win, on every run including the first —
-- which is what makes the set converge at n=1 rather than n=2.

-- Table comments: restore the history-shape descriptions 008 intends.
COMMENT ON TABLE raw.ssb_klass_kommuner IS
  'SSB Klass classification 131 (Kommuner) — full history from /codes.json. Multiple rows per code correspond to name/property changes. Loaded by atlas-data/ingest/src/sources/ssb-klass-kommuner.';

COMMENT ON TABLE raw.ssb_klass_fylker IS
  'SSB Klass classification 104 (Fylker) — full history from /codes.json. Loaded by atlas-data/ingest/src/sources/ssb-klass-fylker.';

-- Column comments 006 re-attaches on every re-run, corrected for the history
-- shape. These describe /codes.json semantics, not the codesAt snapshot.
COMMENT ON COLUMN raw.ssb_klass_kommuner.parent_code IS
  'Upstream parentCode from Klass /codes.json. Typically null for classification 131; the fylke relationship is encoded in the first 2 digits of `code`.';

COMMENT ON COLUMN raw.ssb_klass_kommuner.valid_from IS
  'Upstream validFrom — the date this code version became valid. See valid_from_in_range for the window within the requested range.';

COMMENT ON COLUMN raw.ssb_klass_kommuner.valid_to IS
  'Upstream validTo — the date this code version stopped being valid. NULL = still valid.';
