-- raw.fhi_alkohol — landing table for FHI Folkehelsestatistikk table 332
-- "Alkohol_Ungdata_KH" — share of Ungdata respondents reporting alcohol
-- use once or more in the past year. ALDER / ANTALL_GANGER / SOES are
-- degenerate single-code dims for this slice.
--
-- Populated by atlas-data/ingest/src/sources/fhi-alkohol.

create table if not exists raw.fhi_alkohol (
  geo_code            text        not null,
  aar_code            text        not null,
  kjonn_code          text        not null,
  alder_code          text        not null,   -- always "1_6" — Ungdata cohort identifier
  antall_ganger_code  text        not null,   -- always "engangellerflere" — one-or-more uses
  soes_code           text        not null,   -- always "0" — combined socioeconomic statuses
  measure_type        text        not null,   -- SMR | MEIS — sample-based, no TELLER/RATE
  value               numeric,
  status              text,
  loaded_at           timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               antall_ganger_code, soes_code, measure_type)
);

comment on table raw.fhi_alkohol is
  'FHI Folkehelsestatistikk table 332 — youth alcohol-use share from Ungdata. Risk-direction substance-use indicator. Loaded by atlas-data/ingest/src/sources/fhi-alkohol.';

comment on column raw.fhi_alkohol.antall_ganger_code is
  'Always "engangellerflere" (one-or-more uses) — the table reports the share answering yes to using alcohol at least once in the past year.';
