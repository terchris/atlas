-- raw.udir_gsi — landing table for Udir's GSI (Grunnskolens informasjonssystem:
-- pupil counts, individually-tailored-instruction counts, Norwegian-reinforcement
-- counts, school counts). Populated by atlas-data/ingest/src/sources/udir-gsi.
-- One row per region_code × measure × school year.
--
-- region_code, not kommune_nr: the API's own hierarchy carries real SSB-format
-- codes at this depth with no crosswalk needed, but "same tree depth as a
-- kommune" is not "is a kommune" — 2100 (Svalbard) and 2111 sit at the exact
-- same depth because GSI reports a school there, matching SSB's own 21xx
-- Svalbard pattern. kommune_nr is resolved downstream via this project's
-- existing classify_region_code/region_code_to_kommune_nr macros, same as
-- every other kommune-grain source — not assumed from the raw code's shape.

create table if not exists raw.udir_gsi (
  region_code text        not null,
  year        integer     not null,
  measure     text        not null,
  value       numeric,
  loaded_at   timestamptz not null default now(),
  primary key (region_code, year, measure)
);

comment on table raw.udir_gsi is
  'Udir GSI — grunnskole pupil counts, individually-tailored-instruction counts, Norwegian-reinforcement counts, and school counts, per region, per school year. Loaded by atlas-data/ingest/src/sources/udir-gsi.';

comment on column raw.udir_gsi.region_code is
  'SSB-format region code, read directly from Udir''s API (the EnhetID hierarchy''s own kode field with inkluderKoder=true) at the third hierarchy level. Not always a real kommune — Svalbard (21xx) reports a school at the same tree depth. kommune_nr is derived downstream via classify_region_code, not stored here.';

comment on column raw.udir_gsi.year is
  'School year code from Udir''s own TidID dimension (e.g. 202510 = school year 2025-26), discovered dynamically via filterVerdier, not a hardcoded range.';

comment on column raw.udir_gsi.measure is
  'Which GSI figure this row''s value is: Antall elever (total pupils), Antall elever med individuelt tilrettelagt opplæring/spesialundervisning, Antall elever med forsterket opplæring i norsk, or Antall skoler (school count). The grand-total slice only (all grades/sexes/ownership types combined) — see the source README for why.';

comment on column raw.udir_gsi.value is
  'The measure''s value for this region and year. Null when Udir itself suppressed the cell (its own marker, the literal character ''*'').';
