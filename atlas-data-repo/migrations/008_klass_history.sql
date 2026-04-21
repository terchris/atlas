-- Extend raw.ssb_klass_{kommuner,fylker} to store historical validity ranges.
--
-- Previous migrations 006/007 defined these tables keyed solely on `code`
-- (active snapshot only). Switching to Klass's /codes.json endpoint returns
-- multiple rows per code when a code's name or properties changed over time —
-- so the PK now includes valid_from_in_range.
--
-- Because this changes the PK shape, dropping and recreating is simpler than
-- ALTER-ing in place. Raw tables are owned by ingest; re-running the ingest
-- modules after this migration repopulates them.

drop table if exists raw.ssb_klass_kommuner cascade;
drop table if exists raw.ssb_klass_fylker cascade;

create table raw.ssb_klass_kommuner (
  code                    text        not null,
  name                    text        not null,
  parent_code             text,
  level                   text,
  short_name              text,
  valid_from              date,
  valid_to                date,
  valid_from_in_range     date        not null,
  valid_to_in_range       date,
  notes                   text,
  loaded_at               timestamptz not null default now(),
  primary key (code, valid_from_in_range)
);

comment on table raw.ssb_klass_kommuner is
  'SSB Klass classification 131 (Kommuner) — full history from the /codes.json endpoint. Multiple rows per code correspond to name/property changes. Loaded by atlas-data/ingest/src/sources/ssb-klass-kommuner.';

comment on column raw.ssb_klass_kommuner.valid_from_in_range is
  'Start of the validity window within the requested date range. Populated by Klass /codes.json.';
comment on column raw.ssb_klass_kommuner.valid_to_in_range is
  'End of the validity window within the requested date range. NULL only if outside the requested range.';

create table raw.ssb_klass_fylker (
  code                    text        not null,
  name                    text        not null,
  parent_code             text,
  level                   text,
  short_name              text,
  valid_from              date,
  valid_to                date,
  valid_from_in_range     date        not null,
  valid_to_in_range       date,
  notes                   text,
  loaded_at               timestamptz not null default now(),
  primary key (code, valid_from_in_range)
);

comment on table raw.ssb_klass_fylker is
  'SSB Klass classification 104 (Fylker) — full history from /codes.json. Loaded by atlas-data/ingest/src/sources/ssb-klass-fylker.';
