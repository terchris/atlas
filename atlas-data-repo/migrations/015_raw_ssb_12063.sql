-- raw.ssb_12063 — SSB KOSTRA 12063, Kommunale fritidstilbud. Municipal
-- leisure services for children/youth, plus volunteer association counts.

create table if not exists raw.ssb_12063 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);
comment on table raw.ssb_12063 is
  'SSB KOSTRA 12063 — municipal leisure services and voluntary youth associations. Loaded by atlas-data/ingest/src/sources/ssb-12063.';
