-- raw.fhi_mediebruk_underhold — landing table for FHI Folkehelsestatistikk
-- table 667 "Mediebruk_underhold_ungdata" — share of youth reporting
-- >3h/day on streaming / entertainment media. ALDER / MEDIEBRUK / SOES
-- are degenerate single-code dims for this slice. Shorter time series
-- (~8 years) than the spill / some tables.
--
-- Populated by atlas-data/ingest/src/sources/fhi-mediebruk-underhold.

create table if not exists raw.fhi_mediebruk_underhold (
  geo_code        text        not null,
  aar_code        text        not null,
  kjonn_code      text        not null,
  alder_code      text        not null,   -- always "1_6"
  mediebruk_code  text        not null,   -- always "Merenn3timer" — >3h/day band
  soes_code       text        not null,   -- always "0"
  measure_type    text        not null,   -- SMR | MEIS
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               mediebruk_code, soes_code, measure_type)
);

comment on table raw.fhi_mediebruk_underhold is
  'FHI Folkehelsestatistikk table 667 — youth >3h/day streaming/entertainment share from Ungdata. Risk-direction screen-time indicator. Loaded by atlas-data/ingest/src/sources/fhi-mediebruk-underhold.';
