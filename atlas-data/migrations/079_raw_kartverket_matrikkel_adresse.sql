-- raw.kartverket_matrikkel_adresse — Kartverket's national address file
-- (Matrikkelen), verbatim, one row per address. urb-agents #2098/#2099 (R5).
--
-- 2,604,785 addresses per the request (measured by Atlas 2026-11-08:
-- 2,604,936 — ordinary drift between the two dates, not a defect).
--
-- WHY doc jsonb AND NOT 46 FLATTENED COLUMNS — same reasoning as
-- raw.brreg_enheter_snapshot (migration 052): the upstream CSV has 46
-- columns, most of them access-route metadata (atkomstId, sommeratkomstId,
-- vinteratkomstId and their coordinates) nothing in this request's field
-- list touches. `doc` keeps every column verbatim, keyed by the upstream's
-- own header names; typing the dozen fields Atlas actually serves is dbt's
-- job (models/dimensions/dim_kartverket_matrikkel_adresse.sql).
--
-- adresse_id is the upstream's `adresseId` column. Confirmed byte-identical
-- to `lokalid` (the CSV's own primary key) across a 100,000-row sample,
-- 2026-11-08 — either would work as the primary key; `adresseId` is used
-- because it is the name the request's own field list gives.
create table if not exists raw.kartverket_matrikkel_adresse (
  adresse_id text        not null,
  doc        jsonb       not null,
  loaded_at  timestamptz not null default now(),
  primary key (adresse_id)
);

comment on table raw.kartverket_matrikkel_adresse is
  'Kartverket''s Matrikkelen address file (Geonorge dataset f7df7a18-b30f-4745-bd64-d0863812350c), one row per address, verbatim. Loaded by atlas-data/ingest/src/sources/kartverket-matrikkel-adresse from the CSV distribution (46 columns, semicolon-delimited, EPSG:4258). Typing and filtering happen in dbt; this table loses nothing.';

comment on column raw.kartverket_matrikkel_adresse.adresse_id is
  'The upstream adresseId column — confirmed identical to lokalid across a sampled 100,000 rows, 2026-11-08. Primary key.';

comment on column raw.kartverket_matrikkel_adresse.doc is
  'Every column of the upstream CSV row, verbatim, keyed by the upstream''s own header names (e.g. "kommunenummer", "adressenavn", "Nord", "Øst") — no field dropped, renamed or re-encoded. Not indexed: dbt reads the whole doc and projects columns, matching raw.brreg_enheter_snapshot''s own reasoning (migration 052).';
