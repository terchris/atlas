-- raw.udir_fravar — landing table for Udir's "Fravær i grunnskole" —
-- median and average days/hours of documented absence, plus participant
-- count, for 10th-grade pupils only, per kommune, for every available
-- school year. Populated by atlas-data/ingest/src/sources/udir-fravar.
-- One row per region_code x year x measure.
--
-- Atlas's fourth Udir source. Structurally 10th-grade-only — Udir's own
-- FravaerG table has no other grade to select, confirmed by its
-- Rapportside's own gyldigeFiltre list carrying no TrinnID filter at all
-- — not a filtered slice Atlas chose, so no grade column here.
--
-- A genuinely separate sibling report, VGO_fravaer (videregående), is NOT
-- covered by this table: its EnhetID hierarchy has no kommune level at
-- all (fylke/school-grain only, confirmed live), a structural fact about
-- how Norway organises videregående skole, deliberately deferred.
--
-- region_code is NOT always a real kommune: this table's own EnhetID
-- hierarchy also publishes Svalbard's pseudo-kommune (2100, same tree
-- depth finding as udir-gsi/udir-elevundersokelsen-mobbing/udir-
-- nasjonale-prover) and a literal 2599 ("Utlandet, uspesifisert" —
-- Norwegian schools abroad, reachable only via a second radSti anchor
-- since it sits under its own top-level node, a sibling of "Hele landet"
-- rather than a descendant — carries real, non-suppressed data every
-- year, confirmed live). Both already resolve through
-- classify_region_code's existing svalbard and unspecified_within_fylke
-- branches.
--
-- Backfills every discovered year (11, confirmed live), not latest-only
-- — a real correction made at the start of Phase 2; see this source's
-- README.

create table if not exists raw.udir_fravar (
  region_code text        not null,
  year        integer     not null,
  measure     text        not null,
  value       numeric,
  loaded_at   timestamptz not null default now(),
  primary key (region_code, year, measure)
);

comment on table raw.udir_fravar is
  'Udir Fravær i grunnskole — median/average days and hours of documented absence, plus participant count, for 10th-grade pupils only, per region, per school year. Loaded by atlas-data/ingest/src/sources/udir-fravar.';

comment on column raw.udir_fravar.region_code is
  'Udir''s own region code from the EnhetID hierarchy (nivaa 3, "kommune-equivalent") — a 4-digit kommune code (including the Svalbard pseudo-kommune 2100), or the literal 2599 ("Utlandet, uspesifisert" — Norwegian schools abroad). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.udir_fravar.year is
  'School year code from Udir''s own TidID dimension (6-digit integer, e.g. 202506 = school year 2024-25). Every discovered year is backfilled, not just the latest.';

comment on column raw.udir_fravar.measure is
  'Which figure this row''s value is: Median dager, Median timer, Snitt dager, Snitt timer, or Antall elever. No stable measure code is exposed by the API for these five columns, only the label.';

comment on column raw.udir_fravar.value is
  'The measure''s value for this region/year slice. NULL when Udir itself suppressed the cell (its own marker, the literal character ''*'').';
