-- raw.fhi_ensomhet — landing table for FHI Folkehelsestatistikk table 348
-- "Ensomhet_Ungdata_KH" (loneliness, Ungdata survey, 8th-10th graders).
-- Kommune-resolved, annual, broken down by sex. ALDER/NIVA_PLAGET/SOES each
-- resolve to one category at this table's grain, so they are columns here
-- too rather than assumed constant — see
-- atlas-data/ingest/src/sources/fhi-ensomhet/README.md for why.
--
-- Populated by atlas-data/ingest/src/sources/fhi-ensomhet. urb-agents
-- #2100/#2101 (T5).

create table if not exists raw.fhi_ensomhet (
  geo_code          text        not null,   -- FHI GEO dim: kommune/fylke/bydel/nasjon
  aar_code          text        not null,   -- FHI AAR dim, e.g. "2025_2025"
  kjonn_code        text        not null,   -- "0" total, "1" boys, "2" girls
  alder_code        text        not null,   -- FHI ALDER dim — one value at this grain
  niva_plaget_code  text        not null,   -- FHI NIVA_PLAGET dim — one value at this grain
  soes_code         text        not null,   -- FHI SOES dim — one value at this grain
  measure_type      text        not null,   -- SMR only — see README
  value             numeric,
  status            text,
  loaded_at         timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, niva_plaget_code, soes_code, measure_type)
);

comment on table raw.fhi_ensomhet is
  'FHI Folkehelsestatistikk table 348 — loneliness among 8th-10th graders (Ungdata survey), by region/year/sex. Loaded by atlas-data/ingest/src/sources/fhi-ensomhet. Only MEASURE_TYPE=SMR exists for this table — never a raw percentage, never a count.';

comment on column raw.fhi_ensomhet.aar_code is
  'FHI AAR dimension code. Single-year tables use "YYYY_YYYY".';
comment on column raw.fhi_ensomhet.kjonn_code is
  'FHI KJONN dimension code: "0" kjønn samlet (total), "1" gutter, "2" jenter.';
comment on column raw.fhi_ensomhet.measure_type is
  'SMR = standardised ratio vs national average (100 = national). This table has no RATE and no TELLER.';
