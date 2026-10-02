-- raw.ssb_12451 — SSB table 12451, Bostedskommune- og kjønnsfordelt
-- sykefravær (legemeldt) for lønnstakere. Physician-certified sick-leave
-- percentage and lost workdays, per kommune of residence, quarterly.
--
-- Reached via SSB's PXWebAPI (lib/pxweb.ts), not a NAV Excel download — NAV's
-- own sykefravær/sykepenger statistics pages publish no kommune-level table
-- at all (confirmed live 2026-10-02, PLAN-013-nav-sykefravaer.md Phase 1).
--
-- v1 scope: Kjonn=0 (Begge kjønn) only, ContentsCode limited to
-- Sykefraversprosent and Sykefraversdagsverk (two of the table's nine
-- measures) — see the manifest and PLAN-013's [Q2]/[Q3] for the full
-- reasoning. region_code is NOT always a kommune: SSB's own sentinel shapes
-- (XX99, 9999, 2111, 2199, 2299) are present and already match
-- classify_region_code's existing patterns exactly — no macro change needed.

create table if not exists raw.ssb_12451 (
  region_code     text        not null,
  period          text        not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, period, contents_code)
);

comment on table raw.ssb_12451 is
  'SSB 12451 — legemeldt sykefravær (percentage and lost workdays), per kommune of residence, quarterly. Loaded by atlas-data/ingest/src/sources/ssb-12451.';

comment on column raw.ssb_12451.region_code is
  'SSB-format region code from the Region dimension. May not be a kommune — classify_region_code says which (SSB''s own XX99/9999/2111/2199/2299 sentinels are present).';

comment on column raw.ssb_12451.period is
  'Quarter, SSB''s own code (e.g. 2026K2), stored verbatim — not parsed into year/quarter columns, same convention as raw.ssb_12944''s period column.';

comment on column raw.ssb_12451.contents_code is
  'Which sykefravær figure this row''s value is — Sykefraversprosent or Sykefraversdagsverk (v1 scope; the table has 7 other measures, not ingested).';

comment on column raw.ssb_12451.value is
  'The measure''s value for this kommune and quarter. No suppression observed live on any sampled cell, including Norway''s smallest kommune by population.';

comment on column raw.ssb_12451.status is
  'SSB''s own cell-level status flag, when one exists (none observed at ingest time).';
