-- raw.ssb_klass_versions and raw.ssb_klass_endring — SSB Klass classification
-- version metadata and the correspondence/change log. urb-agents #2098/#2099
-- (R6). Two tables in one migration because both exist for the same reason
-- and are both small, structurally simple KLASS-metadata tables — unlike
-- raw.ssb_klass_kommuner/_fylker (migrations 006/007/008), which already
-- hold the full per-code history this migration does not duplicate.
--
-- WHY raw.ssb_klass_versions EXISTS. The request asks for "the KLASS version
-- id" on every code period. Neither `/codes.json` nor `/codesAt.json` carries
-- one — confirmed by inspecting the raw response keys directly, 2026-11-08: a
-- code has no field resembling `versionId`. The only place a version id
-- exists is a classification's own `/classifications/{id}.json`, as a
-- `versions` array with its own validFrom/validTo. dbt joins a code's
-- validity window against this table's ranges; see
-- models/dimensions/dim_ssb_klass_kommune.sql for why that join is a
-- one-to-many (array), not a one-to-one.
--
-- WHY raw.ssb_klass_endring EXISTS. `/codes.json`'s history is about each
-- CODE's own validity window; it cannot answer "what did code X become".
-- Klass's `/changes.json` endpoint is the correspondence table: every
-- old-code -> new-code transition, with the date it took effect. Covers both
-- classification 131 (kommuner) and 104 (fylker), distinguished by
-- classification_id, because atlas-scraper maps old CRM municipality numbers
-- through exactly this table.
create table if not exists raw.ssb_klass_versions (
  classification_id text        not null,
  version_id         text        not null,
  version_name       text        not null,
  valid_from          date        not null,
  valid_to            date,
  loaded_at           timestamptz not null default now(),
  primary key (classification_id, version_id)
);

comment on table raw.ssb_klass_versions is
  'SSB Klass classification version metadata (id, name, validity window), for classifications 131 (Kommuner) and 104 (Fylker). Loaded by ingest/src/sources/ssb-klass-kommuner and ingest/src/sources/ssb-klass-fylker alongside their own code history.';

create table if not exists raw.ssb_klass_endring (
  classification_id text        not null,
  old_code           text        not null,
  old_name           text        not null,
  old_short_name     text,
  new_code           text        not null,
  new_name           text        not null,
  new_short_name     text,
  change_occurred    date        not null,
  loaded_at          timestamptz not null default now(),
  primary key (classification_id, old_code, new_code, change_occurred)
);

comment on table raw.ssb_klass_endring is
  'SSB Klass correspondence/change log, verbatim, for classifications 131 (Kommuner) and 104 (Fylker). One row per old-code -> new-code transition Klass recorded. Loaded by ingest/src/sources/ssb-klass-endring. "The kind of change" (renamed/renumbered/merged/split/border) is NOT a field Klass provides — it is derived in dbt from the shape of same-date transitions, not stored here verbatim.';

comment on column raw.ssb_klass_endring.old_code is
  'Measured 2026-11-08: a single changeOccurred date can carry more than one row sharing the same old_code (a split) or the same new_code (a merger), and 2026 recorded both in the same event (a boundary reorganisation, not two unrelated changes). Not unique alone — the primary key is the whole transition.';
