-- raw.fhi_depresjon — landing table for FHI Folkehelsestatistikk table 339
-- "Depressive symptomer_Ungdata_KH" — share of youth reporting depressive
-- symptoms in the Ungdata survey, by region × sex × socioeconomic status.
--
-- Populated by atlas-data/ingest/src/sources/fhi-depresjon. Atlas filters
-- AAR=bottom(4) (latest 4 years) to stay under FHI's 50k-cell cap;
-- pre-2022 history lives in the table and can be back-filled by a sibling
-- source if needed.

create table if not exists raw.fhi_depresjon (
  geo_code        text        not null,
  aar_code        text        not null,
  kjonn_code      text        not null,
  alder_code      text        not null,   -- always "1_6" (Ungdata cohort identifier)
  depresjon_code  text        not null,   -- always "Ja" — "yes" responses only
  soes_code       text        not null,   -- 0 combined + 1/2/3 specific SES levels
  measure_type    text        not null,   -- SMR | MEIS — sample-based, no TELLER/RATE
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               depresjon_code, soes_code, measure_type)
);

comment on table raw.fhi_depresjon is
  'FHI Folkehelsestatistikk table 339 — youth depressive symptoms from Ungdata, by region × sex × SES. Loaded by atlas-data/ingest/src/sources/fhi-depresjon.';

comment on column raw.fhi_depresjon.depresjon_code is
  'Always "Ja" (yes-respondents only) for this table. The value is the share of respondents reaching the symptomatic threshold.';
comment on column raw.fhi_depresjon.soes_code is
  'Socioeconomic status. 0 = combined; 1/2/3 = specific levels (typically low/middle/high). Verify against Ungdata methodology.';
