-- raw.ssb_klass_fylker — landing table for SSB Klass classification 104
-- (Fylker), snapshotted at the ingest date.
--
-- Populated by atlas-data/ingest/src/sources/ssb-klass-fylker. Same shape as
-- ssb_klass_kommuner — Klass responses are structurally identical across
-- classifications.

create table if not exists raw.ssb_klass_fylker (
  code        text        not null,
  name        text        not null,
  parent_code text,
  level       text,
  short_name  text,
  valid_from  date,
  valid_to    date,
  notes       text,
  loaded_at   timestamptz not null default now(),
  primary key (code)
);

comment on table raw.ssb_klass_fylker is
  'SSB Klass classification 104 (Fylker). Active fylker at the ingest date, including SSB''s residual "99 Uoppgitt" code. Loaded by atlas-data/ingest/src/sources/ssb-klass-fylker.';
