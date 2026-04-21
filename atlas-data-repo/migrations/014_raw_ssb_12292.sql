-- raw.ssb_12292 — SSB KOSTRA 12292, Omsorgstjenester. 49 content codes
-- covering nursing-home residents, home-care users, bed capacity, service
-- intensity, et cetera. Populated by atlas-data/ingest/src/sources/ssb-12292.

create table if not exists raw.ssb_12292 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);
comment on table raw.ssb_12292 is
  'SSB KOSTRA 12292 — nursing-home and home-care service indicators per kommune. Loaded by atlas-data/ingest/src/sources/ssb-12292.';
