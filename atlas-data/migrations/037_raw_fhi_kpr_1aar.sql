-- raw.fhi_kpr_1aar — landing table for FHI Folkehelsestatistikk table 370
-- "KPR_1" — annual primary-care contact rates from the Kommunalt pasient-
-- og brukerregister, by region × sex × age × ICPC-2 code group.
--
-- Populated by atlas-data/ingest/src/sources/fhi-kpr-1aar. Atlas filters
-- to AAR=latest, KJONN=0, MEASURE_TYPE=RATE to fit FHI's 50k cap (full
-- product is ~3.9M cells, ~80× cap). Sex-stratified or multi-year slices
-- can be added as sibling sources.

create table if not exists raw.fhi_kpr_1aar (
  geo_code         text        not null,
  aar_code         text        not null,
  kjonn_code       text        not null,   -- always "0" combined sex (only value Atlas ingests)
  alder_code       text        not null,   -- 10 age bands incl. 0_74 aggregate, 15_24, 25_44 etc.
  kodegruppe_code  text        not null,   -- ICPC-2 code-range identifier (P-codes, L-codes, etc.)
  measure_type     text        not null,   -- always "RATE" (only value Atlas ingests)
  value            numeric,
  status           text,
  loaded_at        timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, kodegruppe_code, measure_type)
);

comment on table raw.fhi_kpr_1aar is
  'FHI Folkehelsestatistikk table 370 — annual primary-care contact rates from KPR (municipal patient register), by ICPC-2 code group × region × sex × age. Loaded by atlas-data/ingest/src/sources/fhi-kpr-1aar.';

comment on column raw.fhi_kpr_1aar.kodegruppe_code is
  'ICPC-2 code range. P01_P29 = psychological symptoms; P70_P99 = psychological diagnoses; K70_K99 = cardiovascular; L01_L29 / L70_L99 = musculoskeletal; "Skader" = injuries. Combined codes (P01_P29ogP70_P99 etc.) are FHI''s pre-aggregated totals — exclude from disjoint sums.';
