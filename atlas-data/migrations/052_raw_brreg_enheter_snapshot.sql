-- raw.brreg_enheter_snapshot — the complete Enhetsregisteret, one row per organisation.
-- Populated by atlas-data/ingest/src/sources/brreg-enheter-alle from Brreg's daily
-- bulk file (GET /enhetsregisteret/api/enheter/lastned, ~210 MB gzip / ~2.0 GB JSON).
--
-- PLAN-001 phase 2. Terje decided on 2026-09-11 to hold the whole register
-- (~1.17M enheter) rather than the 122 units a curated NGO list produced.
--
-- WHY doc jsonb AND NOT FLATTENED COLUMNS
--
-- Brreg's Enhet has ~30 fields, several of them nested objects (forretningsadresse,
-- naeringskode1..3, organisasjonsform, institusjonellSektorkode). Flattening them
-- here would mean this file has an opinion about which of them matter, and every
-- upstream addition would need a migration before the loader could store it.
-- `doc` keeps the record verbatim; typing the handful of fields Atlas queries is
-- dbt's job (PLAN-003). A raw landing table that loses nothing is the only version
-- of this table that a change feed (PLAN-002) can safely update in place.
--
-- NO GIN INDEX, DELIBERATELY. Measured on 2026-09-11 (PLAN-001 phase 1): jsonb rows
-- cost 1,651 bytes each, and a GIN jsonb_path_ops index takes that to 2,340 — +42%,
-- ~0.8 GB across the register. Nothing queries jsonb paths: dbt reads the whole doc
-- and projects columns. Add the index when an access pattern needs it, with the
-- measurement that justified it. Do not add it speculatively.
--
-- The primary key is what makes both the bulk load and the change feed idempotent:
-- the loader upserts on organisasjonsnummer and never truncates, so a re-run over a
-- populated table replaces rows rather than emptying the register first.

create table if not exists raw.brreg_enheter_snapshot (
  organisasjonsnummer text        not null,
  doc                 jsonb       not null,
  snapshot_file_date  date,
  loaded_at           timestamptz not null default now(),
  primary key (organisasjonsnummer)
);

comment on table raw.brreg_enheter_snapshot is
  'Brønnøysundregistrene Enhetsregisteret — every registered Norwegian organisation, verbatim. One row per organisasjonsnummer, loaded from Brreg''s daily bulk download by atlas-data/ingest/src/sources/brreg-enheter-alle. Typing and filtering happen in dbt; this table loses nothing.';

comment on column raw.brreg_enheter_snapshot.organisasjonsnummer is
  'Nine-digit Norwegian organisation number. Primary key, and the join key for the update feed — stable for the life of the organisation, including after deletion from the register.';

comment on column raw.brreg_enheter_snapshot.doc is
  'The upstream Enhet object exactly as Brreg published it, with no fields dropped, renamed or re-encoded. Not indexed: see the file header for the measurement behind that choice.';

comment on column raw.brreg_enheter_snapshot.snapshot_file_date is
  'Date of the bulk file this row came from, taken from the download response Last-Modified where the server sends one. Null for rows written by a source other than a bulk load (the PLAN-002 change feed will set its own provenance). Not the registration date of the organisation — that lives inside doc.';

comment on column raw.brreg_enheter_snapshot.loaded_at is
  'When Atlas last wrote this row. Updated on every upsert, so it tracks the load rather than the organisation.';
