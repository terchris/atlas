-- raw.fhi_trangbodd — landing table for FHI Folkehelsestatistikk table 794
-- (Trangbodd_UTDANN). Share of population living in overcrowded housing by
-- age and education level. Atlas uses this as a public-API substitute for
-- Samfunnspuls's ssb-spesialbestilt-bosted-husholdning.
--
-- Populated by atlas-data/ingest/src/sources/fhi-trangbodd. Ingest filters
-- UTDANN='0' (all education levels) to stay under FHI's 50 000-row cap;
-- downstream marts can re-ingest with a specific UTDANN when the feature
-- needs the breakdown.

create table if not exists raw.fhi_trangbodd (
  geo_code       text        not null,
  aar_code       text        not null,
  alder_code     text        not null,
  utdann_code    text        not null,
  bodd_code      text        not null,
  measure_type   text        not null,
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, alder_code, utdann_code, bodd_code, measure_type)
);

comment on column raw.fhi_trangbodd.bodd_code is
  'FHI BODD dimension: "trangt" (overcrowded) or "uoppgitt" (unknown).';
comment on column raw.fhi_trangbodd.utdann_code is
  'FHI UTDANN dimension: "0" (all levels) or specific level 1-5.';
