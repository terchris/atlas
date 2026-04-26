-- raw.ssb_09429 — SSB 09429, Utdanningsnivå etter kommune og kjønn.
-- Educational attainment distribution, with sex breakdown.
-- 5 dimensions: Region × Nivaa (education level) × Kjonn × ContentsCode × Tid.

create table if not exists raw.ssb_09429 (
  region_code      text        not null,
  education_level  text        not null,   -- Nivaa
  sex              text        not null,   -- Kjonn ("1" / "2" / "0"=both)
  year             integer     not null,
  contents_code    text        not null,
  contents_label   text        not null,
  value            numeric,
  status           text,
  loaded_at        timestamptz not null default now(),
  primary key (region_code, education_level, sex, year, contents_code)
);

comment on table raw.ssb_09429 is
  'SSB 09429 — educational attainment by kommune and sex. Loaded by atlas-data/ingest/src/sources/ssb-09429.';
comment on column raw.ssb_09429.sex is
  'SSB Kjonn code: "0" = both sexes, "1" = men, "2" = women.';
