-- raw.fhi_innvandrere — landing table for FHI Folkehelsestatistikk table 175
-- "Innvandrere og norskfødte med innvandrerforeldre, etter LANDBAK".
-- Population counts by country background × region × age band.
--
-- Populated by atlas-data/ingest/src/sources/fhi-innvandrere. Atlas filters
-- MEASURE_TYPE = TELLER (counts) at ingest to stay under FHI's 50k-cell cap;
-- RATE / SMR are derivable downstream.

create table if not exists raw.fhi_innvandrere (
  geo_code       text        not null,   -- FHI GEO dim
  aar_code       text        not null,   -- FHI AAR dim, e.g. "2025_2025"
  alder_code     text        not null,   -- FHI ALDER dim, e.g. "0_120" (everyone)
  landbak_code   text        not null,   -- FHI LANDBAK dim — country-background grouping (8 codes)
  measure_type   text        not null,   -- TELLER (count) — only value Atlas ingests
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, alder_code, landbak_code, measure_type)
);

comment on table raw.fhi_innvandrere is
  'FHI Folkehelsestatistikk table 175 — population with immigrant background by country origin. Loaded by atlas-data/ingest/src/sources/fhi-innvandrere.';

comment on column raw.fhi_innvandrere.landbak_code is
  'FHI LANDBAK dimension — country-background grouping. 8 codes spanning Norway-born and immigrant origin regions; verify codes against FHI docs (not human-readable on their own).';
