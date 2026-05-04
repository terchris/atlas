-- raw.ssb_10826 — landing table for SSB statistikkbanktabell 10826
-- (Alders- og kjønnsfordeling for befolkningen i bydeler).
--
-- Populated by atlas-data/ingest/src/sources/ssb-10826. Five dimensions:
-- Region × Kjonn (sex) × Alder (age, single-year codes "000"..."105+") ×
-- ContentsCode × Tid.

create table if not exists raw.ssb_10826 (
  region_code     text        not null,
  region_label    text        not null,
  sex             text        not null,
  age             text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, sex, age, year, contents_code)
);

comment on table raw.ssb_10826 is
  'SSB table 10826 — population by bydel/city-total region, sex and single-year age. Loaded by atlas-data/ingest/src/sources/ssb-10826.';
comment on column raw.ssb_10826.region_code is
  'SSB Region code for bydel population rows. Codes are alphanumeric and include city-total, active-bydel, unknown-bydel, and historical-bydel rows.';
comment on column raw.ssb_10826.region_label is
  'Human-readable SSB Region label, preserved because 10826 uses alphanumeric bydel codes that are not yet backed by dim_bydel.';
comment on column raw.ssb_10826.sex is
  'SSB Kjonn code: "1" = Menn (men), "2" = Kvinner (women).';
comment on column raw.ssb_10826.age is
  'SSB Alder code as text. "000" = 0 år, "001" = 1 år, …, "104" = 104 år, "105+" = 105 years or more.';
