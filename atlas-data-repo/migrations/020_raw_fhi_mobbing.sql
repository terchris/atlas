-- raw.fhi_mobbing — FHI 377, Mobbing i 7. og 10. klasse, 3-årige tall.
-- Substitute for Samfunnspuls's udir-elevundersokelsen mobbing slice.

create table if not exists raw.fhi_mobbing (
  geo_code       text        not null,
  aar_code       text        not null,
  kjonn_code     text        not null,
  trinn_code     text        not null,   -- TRINN: "7" or "10"
  spm_id_code    text        not null,
  measure_type   text        not null,
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, trinn_code, spm_id_code, measure_type)
);

comment on table raw.fhi_mobbing is
  'FHI 377 — share of 7th/10th grade pupils reporting bullying, 3-year averages. Loaded by atlas-data/ingest/src/sources/fhi-mobbing.';
