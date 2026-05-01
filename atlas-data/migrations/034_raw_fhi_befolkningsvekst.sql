-- raw.fhi_befolkningsvekst — landing table for FHI Folkehelsestatistikk
-- table 185 "Befolkningsvekst" — year-over-year population change per region.
-- Whole-population only (KJONN and ALDER are degenerate single-code dims).
--
-- Populated by atlas-data/ingest/src/sources/fhi-befolkningsvekst. Pulls
-- the full 2002–2024 history (~19k cells) — small enough not to need
-- filtering.

create table if not exists raw.fhi_befolkningsvekst (
  geo_code       text        not null,
  aar_code       text        not null,
  kjonn_code     text        not null,   -- always "0" — table is whole-population only
  alder_code     text        not null,   -- always "0_120" — table is whole-population only
  measure_type   text        not null,   -- TELLER (absolute change) | RATE (percent growth)
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, measure_type)
);

comment on table raw.fhi_befolkningsvekst is
  'FHI Folkehelsestatistikk table 185 — year-over-year population growth per region (counts + rates). Loaded by atlas-data/ingest/src/sources/fhi-befolkningsvekst.';

comment on column raw.fhi_befolkningsvekst.measure_type is
  'TELLER = absolute change in resident count between AAR and AAR-1; RATE = percent growth. Verify exact FHI semantics before labelling as a headline indicator.';
