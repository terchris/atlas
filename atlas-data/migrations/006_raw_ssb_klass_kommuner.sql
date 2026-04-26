-- raw.ssb_klass_kommuner — landing table for SSB Klass classification 131
-- (Kommuner), snapshotted at the ingest date.
--
-- Populated by atlas-data/ingest/src/sources/ssb-klass-kommuner. Unlike
-- statbank tables this is a classification registry — the single source of
-- truth for which 4-digit kommune codes are active.

create table if not exists raw.ssb_klass_kommuner (
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

comment on table raw.ssb_klass_kommuner is
  'SSB Klass classification 131 (Kommuner). Active kommuner at the ingest date. Loaded by atlas-data/ingest/src/sources/ssb-klass-kommuner.';

comment on column raw.ssb_klass_kommuner.parent_code is
  'Upstream parentCode field. For Klass 131 at codesAt snapshot this is typically null; fylke relationship is encoded in the first 2 digits of `code`.';
comment on column raw.ssb_klass_kommuner.valid_from is
  'Upstream validFrom. NULL for a codesAt snapshot (equivalent to: valid at the ingest date).';
comment on column raw.ssb_klass_kommuner.valid_to is
  'Upstream validTo. NULL = still valid.';
