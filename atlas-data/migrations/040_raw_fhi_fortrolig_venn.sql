-- raw.fhi_fortrolig_venn — landing table for FHI Folkehelsestatistikk
-- table 354 "FORTROLIGVENN_Ungdata_KH" — share of Ungdata respondents
-- reporting they have a close confiding friend. Protective-direction
-- social-connectedness indicator. ALDER / HARVENN / SOES are degenerate
-- single-code dims for this slice.
--
-- Populated by atlas-data/ingest/src/sources/fhi-fortrolig-venn.

create table if not exists raw.fhi_fortrolig_venn (
  geo_code      text        not null,
  aar_code      text        not null,
  kjonn_code    text        not null,
  alder_code    text        not null,   -- always "1_6" — Ungdata cohort identifier
  harvenn_code  text        not null,   -- always "Jatrorellerheltsikker" — affirmative band
  soes_code     text        not null,   -- always "0" — combined socioeconomic statuses
  measure_type  text        not null,   -- SMR | MEIS — sample-based, no TELLER/RATE
  value         numeric,
  status        text,
  loaded_at     timestamptz not null default now(),
  primary key (geo_code, aar_code, kjonn_code, alder_code,
               harvenn_code, soes_code, measure_type)
);

comment on table raw.fhi_fortrolig_venn is
  'FHI Folkehelsestatistikk table 354 — youth confiding-friend share from Ungdata. Protective-direction social-connectedness indicator. Loaded by atlas-data/ingest/src/sources/fhi-fortrolig-venn.';

comment on column raw.fhi_fortrolig_venn.harvenn_code is
  'Always "Jatrorellerheltsikker" — affirmative responses (yes, I think so or definitely). Higher value = more youth report having a close friend = better outcome.';
