-- raw.ssb_06083 — SSB table 06083, Familier etter familietype. 9 family-type
-- codes × region × year. Single-parent share is a classic vulnerability proxy.

create table if not exists raw.ssb_06083 (
  region_code     text        not null,
  family_type     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, family_type, year, contents_code)
);

comment on table raw.ssb_06083 is
  'SSB table 06083 — families by type (couple with/without children, single parent, etc.). Loaded by atlas-data/ingest/src/sources/ssb-06083.';
