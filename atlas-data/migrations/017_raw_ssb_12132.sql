-- raw.ssb_12132 — SSB KOSTRA 12132, Utgifter som inngår i stønadssatsene
-- for økonomisk sosialhjelp. Rules on what counts as income for welfare
-- calculations per kommune.

create table if not exists raw.ssb_12132 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);
comment on table raw.ssb_12132 is
  'SSB KOSTRA 12132 — social-assistance benefit rules (whether child benefit / childrens own income / cash-for-childcare counted as income). Loaded by atlas-data/ingest/src/sources/ssb-12132.';
