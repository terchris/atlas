-- raw.fhi_hasj — landing table for FHI Folkehelsestatistikk table 363
-- "Hasjbruk_Ungdata_KH" — share of Ungdata respondents reporting cannabis
-- use once or more in the past year. ALDER / ANTALL_GANGER / SOES are
-- degenerate single-code dims for this slice.
--
-- Populated by atlas-data/ingest/src/sources/fhi-hasj. Suppression is
-- heavier than fhi-alkohol because cannabis prevalence is lower at this
-- cohort — expect more NULL values at small-kommune slices.

create table if not exists raw.fhi_hasj (
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

comment on table raw.fhi_hasj is
  'FHI Folkehelsestatistikk table 363 — youth cannabis-use share from Ungdata. Risk-direction substance-use indicator. Loaded by atlas-data/ingest/src/sources/fhi-hasj.';

comment on column raw.fhi_hasj.value is
  'Often NULL at fine-grained slices because cannabis prevalence at this age cohort is low and FHI suppresses small counts to protect privacy. Don''t backfill — it''s correct behaviour.';
