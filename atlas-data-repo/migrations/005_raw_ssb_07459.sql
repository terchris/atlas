-- raw.ssb_07459 — landing table for SSB statistikkbanktabell 07459
-- (Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning).
--
-- Populated by atlas-data/ingest/src/sources/ssb-07459. Five dimensions:
-- Region × Kjonn (sex) × Alder (age, single-year codes "000"..."105+") ×
-- ContentsCode × Tid.

create table if not exists raw.ssb_07459 (
  region_code     text        not null,
  sex             text        not null,   -- Kjonn: "1" (Menn), "2" (Kvinner)
  age             text        not null,   -- Alder: "000"..."104", "105+"
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, sex, age, year, contents_code)
);

comment on table raw.ssb_07459 is
  'SSB table 07459 — population by region, sex and single-year age. Loaded by atlas-data/ingest/src/sources/ssb-07459.';
comment on column raw.ssb_07459.sex is
  'SSB Kjonn code: "1" = Menn (men), "2" = Kvinner (women).';
comment on column raw.ssb_07459.age is
  'SSB Alder code as text. "000" = 0 år, "001" = 1 år, …, "104" = 104 år, "105+" = 105 years or more.';
