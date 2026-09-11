-- raw.brreg_feed_watermark and raw.brreg_oppdateringer — the Brreg change feed.
-- Populated by atlas-data/ingest/src/sources/brreg-oppdateringer. PLAN-002 phase 1.
--
-- The bulk snapshot (052) is stale the day after it loads. Brreg publishes every
-- change to the register as an ordered feed, and this is where Atlas records how
-- far it has consumed and what it consumed.
--
-- WHY THE WATERMARK LIVES HERE AND NOT IN A DAGSTER CURSOR
--
-- Dagster offers per-sensor cursors, and a cursor is the obvious home for "how
-- far did we get". It is the wrong home. A cursor lives in the Dagster INSTANCE
-- database — a different database from this one, with a different lifecycle, that
-- survived `uis undeploy dagster` by luck rather than by design and was preserved
-- on urb-agents #591 specifically because it holds evidence someone needed.
--
-- If that database is ever rebuilt, a cursor-based feed silently restarts from
-- nowhere: no error, no gap reported, just a poller that believes it is caught up
-- and quietly stops applying deletions. A row in `raw` is backed up with the data
-- it describes, restored with it, and sits beside raw.ingest_runs where anyone
-- looking for pipeline state already looks.
--
-- ⚠️ This is exactly the kind of indirection a later reader "simplifies" into a
-- cursor. The reason is written here so that reader meets it first.
--
-- WHY THE QUEUE IS APPEND-ONLY
--
-- raw.* is a landing layer. The feed's value is the record of what changed and
-- when — overwriting or deleting rows here discards that at the moment of
-- receiving it and makes marts unrebuildable from raw. Deletion is expressed as a
-- row saying "deleted", never as an absent row.

create table if not exists raw.brreg_feed_watermark (
  -- Single-row table. The constant primary key is what enforces that: an upsert
  -- on id = 1 can never accidentally become a second, competing watermark.
  id                   integer     not null primary key default 1,
  last_oppdateringsid  bigint      not null,
  last_dato            timestamptz,
  updated_at           timestamptz not null default now(),
  constraint brreg_feed_watermark_single_row check (id = 1)
);

comment on table raw.brreg_feed_watermark is
  'How far Atlas has consumed Brreg''s oppdateringer feed. Exactly one row (id = 1, enforced by a check constraint). Deliberately NOT a Dagster cursor — see the migration header: a cursor lives in the Dagster instance database, which has a different lifecycle, and a rebuilt one restarts the feed from nowhere without reporting a gap.';

comment on column raw.brreg_feed_watermark.last_oppdateringsid is
  'The highest oppdateringsid successfully processed and committed. The next poll asks for last_oppdateringsid + 1. Advanced only after a batch is durably written, so an interrupted run re-processes its last batch rather than skipping it.';

comment on column raw.brreg_feed_watermark.last_dato is
  'The dato of that change, carried for human legibility only. Never use it to resume — several changes share a millisecond, which is the whole reason the feed is walked by id.';

create table if not exists raw.brreg_oppdateringer (
  oppdateringsid      bigint      not null primary key,
  dato                timestamptz,
  organisasjonsnummer text        not null,
  endringstype        text        not null,
  processed_at        timestamptz not null default now(),
  process_status      text
);

comment on table raw.brreg_oppdateringer is
  'Append-only log of every change Brreg reported, one row per oppdateringsid. Never updated and never deleted from: raw.* is a landing layer, and overwriting discards the feed''s own record of what changed at the moment of receiving it. Loaded by atlas-data/ingest/src/sources/brreg-oppdateringer.';

comment on column raw.brreg_oppdateringer.oppdateringsid is
  'Brreg''s monotonic change id, and the primary key. Ids are SPARSE — the id space runs far ahead of the record count, so the gap between two ids is not the number of changes between them. Never compute a backlog by subtracting ids.';

comment on column raw.brreg_oppdateringer.endringstype is
  'Brreg''s change type, stored verbatim. Five values occur: Ny, Endring, Sletting, Fjernet, Ukjent. Sletting is the deletion in current traffic; Fjernet is real but concentrated in older eras (23 of 500 at oppdateringsid 16,400,000); Ukjent is the entire pre-2018-08 history. Not constrained to an enum on purpose — a sixth value must land in raw and be counted, not rejected at the door.';

comment on column raw.brreg_oppdateringer.process_status is
  'Outcome of applying this change to raw.brreg_enheter_snapshot: applied, tombstoned, or skipped_unknown. Null means the row was recorded but not yet applied.';

-- ── The delta layer ─────────────────────────────────────────────────────────
--
-- One row per change, holding the organisation's document as it stood when the
-- change was received. The feed NEVER touches raw.brreg_enheter_snapshot: the
-- bootstrap owns that table, this owns the deltas, and dbt reconciles the two
-- into marts (PLAN-003). That separation means a buggy poller cannot corrupt the
-- 1.17M-row snapshot, which is the expensive thing to rebuild.
--
-- ⚠️ A DELETED ORGANISATION STILL RETURNS HTTP 200.
--
-- Measured 2026-09-12: fetching the entity link for a `Sletting` change gives
-- 200 with a *stub* body — about six keys (navn, organisasjonsform,
-- organisasjonsnummer, historiskeNavn, slettedato, respons_klasse) against the
-- ~30 a live entity carries. Not 404, not 410.
--
-- So an implementation that detects deletion from the HTTP status sees nothing
-- wrong and writes a six-key stub over a full record. Deletion is detected from
-- the FEED's endringstype, and `slettedato` inside the body is the corroborating
-- signal — never the status code.

create table if not exists raw.brreg_enheter_versions (
  oppdateringsid      bigint      not null primary key
    references raw.brreg_oppdateringer (oppdateringsid),
  organisasjonsnummer text        not null,
  endringstype        text        not null,
  doc                 jsonb,
  fetched_at          timestamptz not null default now()
);

create index if not exists brreg_enheter_versions_orgnr_idx
  on raw.brreg_enheter_versions (organisasjonsnummer, oppdateringsid desc);

comment on table raw.brreg_enheter_versions is
  'Append-only version history: the organisation''s document as it stood at each change. One row per oppdateringsid. Never updated in place — the point of the feed is the record of what changed and when, and overwriting discards it at the moment of receiving it. Reconciled with raw.brreg_enheter_snapshot by dbt (PLAN-003), which is why the feed never writes to the snapshot table itself.';

comment on column raw.brreg_enheter_versions.doc is
  'The entity document at the time of the change, verbatim. ⚠️ For a Sletting this is Brreg''s SIX-KEY STUB, not a full record — the deleted entity still answers HTTP 200 (see the header). Consumers must branch on endringstype, never assume doc is a complete Enhet. Null when the fetch failed and the change was recorded without a body.';

comment on index brreg_enheter_versions_orgnr_idx is
  'Supports "the latest version of this organisation" — the access pattern PLAN-003''s reconciliation uses, and the only one this table has.';
