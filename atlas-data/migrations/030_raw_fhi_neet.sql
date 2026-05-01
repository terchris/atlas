-- raw.fhi_neet — landing table for FHI Folkehelsestatistikk table 809
-- "NEET_UTDANN" — Not in Education, Employment, or Training, by age band ×
-- parents' education level. Atlas's primary youth-disengagement indicator.
--
-- Populated by atlas-data/ingest/src/sources/fhi-neet. Atlas filters
-- KJONN = "0" (combined) and MEASURE_TYPE = RATE at ingest to stay under
-- FHI's 50k-cell cap; sex-stratified slice can be added as a sibling
-- source if needed.

create table if not exists raw.fhi_neet (
  geo_code       text        not null,   -- FHI GEO dim
  aar_code       text        not null,   -- FHI AAR dim, e.g. "2024_2024"
  kjonn_code     text        not null,   -- FHI KJONN dim: "0" both (only value Atlas ingests)
  alder_code     text        not null,   -- FHI ALDER dim, e.g. "15_29"
  utdann_code    text        not null,   -- Parents' education level: 0 all / 1–4 specific
  measure_type   text        not null,   -- RATE (percent) — only value Atlas ingests
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, utdann_code, measure_type)
);

comment on table raw.fhi_neet is
  'FHI Folkehelsestatistikk table 809 — NEET (Not in Education, Employment, or Training) by age band × parents'' education. Loaded by atlas-data/ingest/src/sources/fhi-neet.';

comment on column raw.fhi_neet.utdann_code is
  'Parents'' education level (NOT the youth''s own). 0 = all levels; 1 = grunnskole; 2 = videregående; 3 = høgskole/universitet kort; 4 = høgskole/universitet lang.';
comment on column raw.fhi_neet.alder_code is
  'FHI ALDER dimension code in "min_max" form. Includes both the canonical NEET span 15_29 and finer slices 15_19, 20_24, 25_29; pick a single non-overlapping partition downstream.';
