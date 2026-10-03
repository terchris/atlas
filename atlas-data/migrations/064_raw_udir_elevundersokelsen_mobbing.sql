-- raw.udir_elevundersokelsen_mobbing — landing table for Udir's
-- Elevundersøkelsen bullying ("mobbing") indicator and its three underlying
-- survey questions, per kommune, per grade (7th and 10th), per school year.
-- Populated by atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing.
-- One row per region_code x grade x year x measure.
--
-- Atlas's second Udir source. Unlike raw.udir_gsi, this report's own API
-- provides a STABLE CODE at the measure level (e.g. "EUIndeks_1398"), not
-- just a human label — measure stores that code, measure_label its real
-- Norwegian survey-question text.
--
-- region_code is NOT always a real kommune: this table's own EnhetID
-- hierarchy also publishes Svalbard's pseudo-kommune (2100, same tree depth
-- finding as udir-gsi) and a literal 2599 ("Utlandet, uspesifisert" —
-- Norwegian schools abroad), confirmed live 2026-10-03 — a sentinel udir-gsi
-- does not have. classify_region_code resolves both through its existing
-- svalbard and unspecified_within_fylke branches respectively.
--
-- A region/grade combination can be genuinely ABSENT (no rows at all for
-- that pair — confirmed live on Hægebostad/4226, which has no 10th-grade
-- cohort reporting into this table) as well as per-row SUPPRESSED (value
-- NULL, Udir's own "*" marker present but the row exists). Absence is not
-- represented here at all (no row written); suppression is a NULL value.

create table if not exists raw.udir_elevundersokelsen_mobbing (
  region_code   text        not null,
  grade         integer     not null,
  year          integer     not null,
  measure       text        not null,
  measure_label text        not null,
  value         numeric,
  loaded_at     timestamptz not null default now(),
  primary key (region_code, grade, year, measure)
);

comment on table raw.udir_elevundersokelsen_mobbing is
  'Udir Elevundersøkelsen — bullying ("mobbing") indicator and its three underlying survey questions, per region, per grade, per school year. Loaded by atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing.';

comment on column raw.udir_elevundersokelsen_mobbing.region_code is
  'Udir''s own region code from the EnhetID hierarchy (nivaa 3, "kommune-equivalent") — a 4-digit kommune code (including the Svalbard pseudo-kommune 2100), or the literal 2599 ("Utlandet, uspesifisert" — Norwegian schools abroad). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.udir_elevundersokelsen_mobbing.grade is
  'The real grade number, 7 or 10 — matching fhi-mobbing''s own established axis. Udir''s internal TrinnID filter has no "all grades" sentinel for this report; every row names its grade explicitly.';

comment on column raw.udir_elevundersokelsen_mobbing.measure is
  'Udir''s own stable identifier for the indicator or question (e.g. EUIndeks_1398, EUSpoersmaal_Q11811) — unlike raw.udir_gsi, this report''s API provides a real code, not just a label, at the measure level.';

comment on column raw.udir_elevundersokelsen_mobbing.measure_label is
  'The real Norwegian survey question or indicator text, verbatim from the API, alongside the stable code in measure.';

comment on column raw.udir_elevundersokelsen_mobbing.value is
  'Percentage of surveyed pupils, for this region/grade/year/measure slice. NULL when Udir itself suppressed the cell (its own marker, the literal character ''*''). A region/grade pair with nothing to report at all (confirmed live on Hægebostad''s 10th grade) has no row here — absence, not a NULL value.';
