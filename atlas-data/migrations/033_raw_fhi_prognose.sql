-- raw.fhi_prognose — landing table for FHI Folkehelsestatistikk table 171
-- "Befolkningsframskriving" — population projections by region × age × forecast year.
-- Pairs with raw.fhi_befolkning (observed counts on the same dimension shape).
--
-- Populated by atlas-data/ingest/src/sources/fhi-prognose. Atlas filters
-- KJONN = "0" (combined), MEASURE_TYPE = TELLER, PROGNOSEAAR = (2030, 2040, 2050)
-- at ingest to stay under FHI's 50k-cell cap (full product is ~990k, ~25× cap).

create table if not exists raw.fhi_prognose (
  geo_code         text        not null,   -- FHI GEO dim
  aar_code         text        not null,   -- Base year of projection (e.g. "2024_2024")
  kjonn_code       text        not null,   -- "0" both (only value Atlas ingests)
  alder_code       text        not null,   -- FHI ALDER dim, e.g. "0_120"
  prognoseaar_code text        not null,   -- Year being projected TO ("2030" / "2040" / "2050")
  measure_type     text        not null,   -- TELLER (count) — only value Atlas ingests
  value            numeric,
  status           text,
  loaded_at        timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, prognoseaar_code, measure_type)
);

comment on table raw.fhi_prognose is
  'FHI Folkehelsestatistikk table 171 — population projections by region × age × forecast year. Loaded by atlas-data/ingest/src/sources/fhi-prognose.';

comment on column raw.fhi_prognose.aar_code is
  'BASE year of the projection (the year the forecast is anchored on), in FHI YYYY_YYYY form. Joining observed to projected requires AAR↔PROGNOSEAAR, not AAR↔AAR.';
comment on column raw.fhi_prognose.prognoseaar_code is
  'Year the projection is FOR (target year). Atlas ingests 3 horizons: "2030", "2040", "2050".';
