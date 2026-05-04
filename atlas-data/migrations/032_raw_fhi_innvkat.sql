-- raw.fhi_innvkat — landing table for FHI Folkehelsestatistikk table 650
-- "INNVAND_INNVKAT" — population by immigrant category (1st-gen / 2nd-gen
-- / combined) per region × age band.
--
-- Complements raw.fhi_innvandrere (table 175): that splits by LANDBAK
-- (country background) but collapses INNVKAT; this one is the inverse.
-- Populated by atlas-data/ingest/src/sources/fhi-innvkat.

create table if not exists raw.fhi_innvkat (
  geo_code       text        not null,   -- FHI GEO dim
  aar_code       text        not null,   -- FHI AAR dim, e.g. "2025_2025"
  alder_code     text        not null,   -- FHI ALDER dim, e.g. "0_120"
  innvkat_code   text        not null,   -- 2 = 1st-gen, 3 = 2nd-gen, 23 = combined
  landbak_code   text        not null,   -- always "0" for this table
  measure_type   text        not null,   -- TELLER / RATE / SMR
  value          numeric,
  status         text,
  loaded_at      timestamptz not null default now(),
  primary key (geo_code, aar_code, alder_code, innvkat_code, landbak_code, measure_type)
);

comment on table raw.fhi_innvkat is
  'FHI Folkehelsestatistikk table 650 — population by immigrant category (1st-gen / 2nd-gen / combined). Loaded by atlas-data/ingest/src/sources/fhi-innvkat.';

comment on column raw.fhi_innvkat.innvkat_code is
  'Immigrant category. 2 = innvandrere (1st-gen); 3 = norskfødte med innvandrerforeldre (2nd-gen); 23 = combined (sum of 2 + 3) — exclude from disjoint-category sums.';
comment on column raw.fhi_innvkat.landbak_code is
  'Country background — fixed at "0" (collapsed) for this table. Use raw.fhi_innvandrere for origin-region resolution.';
