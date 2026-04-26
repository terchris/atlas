-- raw.fhi_bor_alene — landing table for FHI Folkehelsestatistikk table 187
-- "Personer som bor alene" (people living alone). Kommune-resolved, annual
-- since 2005, broken down by age group and measure type.
--
-- Populated by atlas-data/ingest/src/sources/fhi-bor-alene.

create table if not exists raw.fhi_bor_alene (
  geo_code       text        not null,   -- FHI GEO dim: kommune/fylke/bydel/nasjon
  aar_code       text        not null,   -- FHI AAR dim, e.g. "2025_2025"
  alder_code     text        not null,   -- FHI ALDER dim, e.g. "16_120" (16+)
  measure_type   text        not null,   -- RATE | SMR | TELLER
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, alder_code, measure_type)
);

comment on table raw.fhi_bor_alene is
  'FHI Folkehelsestatistikk table 187 — persons living alone, by region/year/age group. Loaded by atlas-data/ingest/src/sources/fhi-bor-alene.';

comment on column raw.fhi_bor_alene.aar_code is
  'FHI AAR dimension code. Single-year tables use "YYYY_YYYY"; multi-year averages use "YYYY1_YYYY2".';
comment on column raw.fhi_bor_alene.alder_code is
  'FHI ALDER dimension code in "min_max" form, e.g. "16_120" (16 years and older).';
comment on column raw.fhi_bor_alene.measure_type is
  'RATE = percent; SMR = standardised ratio (100 = national average); TELLER = absolute count.';
