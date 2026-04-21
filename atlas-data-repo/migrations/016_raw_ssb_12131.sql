-- raw.ssb_12131 — SSB KOSTRA 12131, Stønadssatser for sosialhjelp. Monthly
-- social-assistance rates set by each kommune.

create table if not exists raw.ssb_12131 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);
comment on table raw.ssb_12131 is
  'SSB KOSTRA 12131 — social-assistance monthly rates. Loaded by atlas-data/ingest/src/sources/ssb-12131.';
