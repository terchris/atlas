-- raw.fhi_livskvalitet — landing table for FHI Folkehelsestatistikk table 373
-- "Livskvalitet_Ungdata_KH" — subjective quality of life among youth from
-- the Ungdata survey. ALDER / LIVSKVALITET / SOES are degenerate
-- single-code dims for this slice.
--
-- Populated by atlas-data/ingest/src/sources/fhi-livskvalitet.

create table if not exists raw.fhi_livskvalitet (
  geo_code          text        not null,
  aar_code          text        not null,
  kjonn_code        text        not null,
  alder_code        text        not null,   -- always "1_6" — Ungdata survey-cohort grouping
  livskvalitet_code text        not null,   -- always "8_10" — high quality-of-life score band
  soes_code         text        not null,   -- always "0" — combined socioeconomic statuses
  measure_type      text        not null,   -- SMR | MEIS
  value             numeric,
  status            text,
  loaded_at         timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               livskvalitet_code, soes_code, measure_type)
);

comment on table raw.fhi_livskvalitet is
  'FHI Folkehelsestatistikk table 373 — youth quality-of-life from Ungdata, by region × sex × year. Loaded by atlas-data/ingest/src/sources/fhi-livskvalitet.';

comment on column raw.fhi_livskvalitet.alder_code is
  'Always "1_6" for this table — looks like an age band but is more likely an Ungdata survey-cohort identifier. Verify against Ungdata methodology before labelling.';
comment on column raw.fhi_livskvalitet.livskvalitet_code is
  'Always "8_10" for this table — the "high quality of life" score band on a 0–10 self-report scale. The table reports the share of respondents reaching this band.';
comment on column raw.fhi_livskvalitet.measure_type is
  'SMR = standardised ratio vs national. MEIS = FHI mean / smoothed indicator value. No TELLER or RATE — Ungdata is sample-based, not an enumeration.';
