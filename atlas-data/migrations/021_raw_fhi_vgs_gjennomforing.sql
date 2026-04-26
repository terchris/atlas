-- raw.fhi_vgs_gjennomforing — FHI 360, Gjennomforing i videregående skole.
-- Substitute for Samfunnspuls's udir-sluttet-vgs (graduation = inverse of
-- dropout; dropout rate derivable as 100 - completion %).

create table if not exists raw.fhi_vgs_gjennomforing (
  geo_code       text        not null,
  aar_code       text        not null,
  kjonn_code     text        not null,
  utdann_code    text        not null,
  innvkat_code   text        not null,
  measure_type   text        not null,
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, utdann_code, innvkat_code, measure_type)
);

comment on table raw.fhi_vgs_gjennomforing is
  'FHI 360 — upper-secondary completion rate (gjennomforing) per region × sex × parents education × immigration category. Loaded by atlas-data/ingest/src/sources/fhi-vgs-gjennomforing.';
