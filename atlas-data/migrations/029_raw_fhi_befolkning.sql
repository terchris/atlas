-- raw.fhi_befolkning — landing table for FHI Folkehelsestatistikk table 338
-- "Befolkningssammensetning_antall_andel" — population counts by region × sex
-- × age band. Used as the demographic denominator across other indicators.
--
-- Populated by atlas-data/ingest/src/sources/fhi-befolkning. Atlas filters
-- MEASURE_TYPE = TELLER (counts) at ingest to stay under FHI's 50k-cell cap;
-- RATE / SMR are derivable downstream from the same counts.

create table if not exists raw.fhi_befolkning (
  geo_code       text        not null,   -- FHI GEO dim: kommune/fylke/bydel/nasjon
  aar_code       text        not null,   -- FHI AAR dim, e.g. "2025_2025"
  kjonn_code     text        not null,   -- FHI KJONN dim: "0" both, "1" men, "2" women
  alder_code     text        not null,   -- FHI ALDER dim, e.g. "0_120" (everyone), "0_17" (kids)
  measure_type   text        not null,   -- TELLER (count) — only value Atlas ingests
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, measure_type)
);

comment on table raw.fhi_befolkning is
  'FHI Folkehelsestatistikk table 338 — population by region × sex × age. Loaded by atlas-data/ingest/src/sources/fhi-befolkning.';

comment on column raw.fhi_befolkning.alder_code is
  'FHI ALDER dimension code in "min_max" form. Includes both aggregate bands (0_120 = everyone) and disjoint slices (0_4, 5_14, etc.); pick a single non-overlapping partition downstream.';
comment on column raw.fhi_befolkning.measure_type is
  'TELLER = absolute count. Atlas only ingests TELLER for this table; RATE / SMR are derivable from these counts.';
