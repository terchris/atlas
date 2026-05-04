-- raw.fhi_smertestillende — landing table for FHI Folkehelsestatistikk
-- table 390 "Smertestillende_ungdata" — share of Ungdata respondents
-- using painkillers at least weekly. ALDER / STATUS / SOES are
-- single-code degenerate dims for this slice.
--
-- Populated by atlas-data/ingest/src/sources/fhi-smertestillende.

create table if not exists raw.fhi_smertestillende (
  geo_code      text        not null,
  aar_code      text        not null,
  kjonn_code    text        not null,
  alder_code    text        not null,   -- always "1_6" — Ungdata cohort identifier
  status_code   text        not null,   -- always "Minst_ukentlig" — at-least-weekly band
  soes_code     text        not null,   -- always "0" — combined socioeconomic statuses
  measure_type  text        not null,   -- SMR | MEIS — sample-based, no TELLER/RATE
  value         numeric,
  status        text,
  loaded_at     timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               status_code, soes_code, measure_type)
);

comment on table raw.fhi_smertestillende is
  'FHI Folkehelsestatistikk table 390 — youth painkiller use (at-least-weekly) from Ungdata. Marker of chronic pain / psychological distress. Loaded by atlas-data/ingest/src/sources/fhi-smertestillende.';

comment on column raw.fhi_smertestillende.status_code is
  'Always "Minst_ukentlig" (at-least-weekly use) for this table — the table reports the share reaching this frequency band.';
