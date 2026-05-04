-- raw.fhi_selvmord — landing table for FHI Folkehelsestatistikk table 344
-- "Selvmord femårig" — suicide deaths per region, 5-year rolling windows.
-- Atlas pulls FHI's smoothed MEIS indicator only; raw RATE/TELLER/SMR can
-- be added as sibling sources where small-cell sample-size caveats apply.
--
-- Suicide statistics are sensitive — downstream consumers should follow
-- FHI's veileder for omtale av selvmord.
--
-- Populated by atlas-data/ingest/src/sources/fhi-selvmord.

create table if not exists raw.fhi_selvmord (
  geo_code        text        not null,
  aar_code        text        not null,   -- "YYYY1_YYYY5" 5-year rolling window
  kjonn_code      text        not null,
  alder_code      text        not null,
  aarsak_code     text        not null,   -- always "SELVMORD" — table is pre-filtered to suicide
  measure_type    text        not null,   -- always "MEIS" (smoothed) — only value Atlas ingests
  value           numeric,                -- often NULL where small-cell suppression applies
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code, aarsak_code, measure_type)
);

comment on table raw.fhi_selvmord is
  'FHI Folkehelsestatistikk table 344 — suicide deaths, 5-year rolling, by region × sex × age. Smoothed MEIS indicator only. Loaded by atlas-data/ingest/src/sources/fhi-selvmord.';

comment on column raw.fhi_selvmord.aar_code is
  '5-year rolling window in "YYYY1_YYYY5" form, e.g. "2020_2024". Atlas pulls the latest 3 rolling windows.';
comment on column raw.fhi_selvmord.measure_type is
  'Always MEIS (FHI mean / smoothed indicator). Annual kommune-level suicide rates are too noisy due to small samples; MEIS pools information across geography to give stable per-region estimates.';
comment on column raw.fhi_selvmord.value is
  'Often NULL at fine-grained slices because FHI suppresses small counts to protect privacy. Do not backfill or interpolate at ingest.';
