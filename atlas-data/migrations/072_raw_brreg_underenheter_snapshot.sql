-- raw.brreg_underenheter_snapshot — the complete Brreg underenheter register, one
-- row per sub-unit. Populated by atlas-data/ingest/src/sources/brreg-underenheter
-- from Brreg's daily bulk file (GET /enhetsregisteret/api/underenheter/lastned).
--
-- Named as a follow-on in 052/README/sources.yml when brreg-enheter-alle shipped
-- (PLAN-001), and deferred until "the machinery is proven" per
-- INVESTIGATE-all-brreg-organisations.md — the enheter bulk+change-feed pipeline
-- has since run in production for weeks. This is that follow-on, mirroring
-- 052_raw_brreg_enheter_snapshot.sql field for field: same doc-jsonb-verbatim
-- design, same no-GIN-index reasoning, same upsert-never-truncate idempotence.
--
-- WHY A SEPARATE TABLE, NOT A ROW IN brreg_enheter_snapshot
--
-- `enheter` and `underenheter` are two distinct Brreg registers with disjoint
-- organisasjonsnummer spaces, their own bulk files and their own independent
-- change feeds (`/oppdateringer/underenheter`, its own oppdateringsid sequence —
-- the real bootstrap run against live data on 2026-10-04 seeded this feed's
-- watermark at 21,390,729, an entirely separate counter from enheter's own
-- feed). Merging them into one table would conflate two cursors into one
-- watermark and make "which register is this row from" a derived question
-- instead of a structural one.
--
-- WHY THIS CANNOT REUSE raw.brreg_feed_watermark's SINGLE ROW
--
-- That table's own check constraint (`id = 1`) is what makes "exactly one
-- watermark" true by construction, for exactly one feed. A second, independent
-- cursor needs its own single-row table with its own constraint — see 073.

create table if not exists raw.brreg_underenheter_snapshot (
  organisasjonsnummer text        not null,
  doc                 jsonb       not null,
  snapshot_file_date  date,
  loaded_at           timestamptz not null default now(),
  primary key (organisasjonsnummer)
);

comment on table raw.brreg_underenheter_snapshot is
  'Brønnøysundregistrene''s underenheter register — every sub-unit (organisasjonsform BEDR and others) registered under a parent enhet, verbatim. One row per organisasjonsnummer, loaded from Brreg''s daily bulk download by atlas-data/ingest/src/sources/brreg-underenheter. Typing and filtering happen in dbt; this table loses nothing. Sibling to raw.brreg_enheter_snapshot — see that table and this migration''s header for why they are not merged.';

comment on column raw.brreg_underenheter_snapshot.organisasjonsnummer is
  'The sub-unit''s own nine-digit organisation number — distinct from its parent''s, which lives inside doc as overordnetEnhet. Primary key, and the join key for the update feed — stable for the life of the sub-unit, including after deletion from the register.';

comment on column raw.brreg_underenheter_snapshot.doc is
  'The upstream Underenhet object exactly as Brreg published it, with no fields dropped, renamed or re-encoded. Not indexed, for the same measured reason as raw.brreg_enheter_snapshot.doc.';

comment on column raw.brreg_underenheter_snapshot.snapshot_file_date is
  'Date of the bulk file this row came from, taken from the download response Last-Modified. Null for rows written by a source other than a bulk load. Not the registration date of the sub-unit — that lives inside doc.';

comment on column raw.brreg_underenheter_snapshot.loaded_at is
  'When Atlas last wrote this row. Updated on every upsert, so it tracks the load rather than the sub-unit.';
