-- raw.udir_nasjonale_prover — landing table for Udir's Nasjonale prøver
-- (national test) scale-score results, uncertainty margin, and participant
-- count, per kommune, per grade (5th, 8th, 9th), per subject
-- (engelsk/lesing/regning). Populated by
-- atlas-data/ingest/src/sources/udir-nasjonale-prover. One row per
-- region_code x grade x subject x year x measure.
--
-- Atlas's third Udir source, and its first direct learning-outcome signal
-- — every other Udir source measures supply (GSI) or self-reported
-- experience (Elevundersøkelsen), not test performance.
--
-- Two genuinely separate Udir report versions feed this one table: 5th
-- grade (NasjonaleProever/4/1) and "ungdomstrinn" 8th+9th grade
-- (NasjonaleProever/1/1). Not every grade x subject combination exists —
-- English is tested only at 8th grade, not 9th (confirmed live: that
-- combination returns a genuinely empty upstream response, represented
-- here as no rows at all, not suppression).
--
-- region_code is NOT always a real kommune: this table's own EnhetID
-- hierarchy also publishes Svalbard's pseudo-kommune (2100, same tree
-- depth finding as udir-gsi/udir-elevundersokelsen-mobbing) and a literal
-- 2599 ("Utlandet, uspesifisert" — Norwegian schools abroad, reachable
-- only via a second radSti anchor since it sits under its own top-level
-- node, a sibling of "Hele landet" rather than a descendant). Both already
-- resolve through classify_region_code's existing svalbard and
-- unspecified_within_fylke branches.

create table if not exists raw.udir_nasjonale_prover (
  region_code text        not null,
  grade       integer     not null,
  subject     text        not null,
  year        integer     not null,
  measure     text        not null,
  value       numeric,
  loaded_at   timestamptz not null default now(),
  primary key (region_code, grade, subject, year, measure)
);

comment on table raw.udir_nasjonale_prover is
  'Udir Nasjonale prøver — national test scale-score results, uncertainty margin, and participant count, per region, per grade, per subject, per school year. Loaded by atlas-data/ingest/src/sources/udir-nasjonale-prover.';

comment on column raw.udir_nasjonale_prover.region_code is
  'Udir''s own region code from the EnhetID hierarchy (nivaa 3, "kommune-equivalent") — a 4-digit kommune code (including the Svalbard pseudo-kommune 2100), or the literal 2599 ("Utlandet, uspesifisert" — Norwegian schools abroad). region_kind is derived downstream via classify_region_code, not stored here.';

comment on column raw.udir_nasjonale_prover.grade is
  'The real grade number: 5, 8, or 9. Two genuinely separate Udir report versions feed this table — 5th grade and "ungdomstrinn" (8th/9th).';

comment on column raw.udir_nasjonale_prover.subject is
  'Udir''s own stable ProevetypeID code: NPENG (engelsk/English), NPLES (lesing/reading), or NPREG (regning/numeracy). Not every grade x subject combination exists upstream (English is 8th-grade only) — a missing combination has no rows here at all, not a suppressed value.';

comment on column raw.udir_nasjonale_prover.measure is
  'Which figure this row''s value is: Skalapoeng (scale score), Usikkerhet (uncertainty/margin of error), or Antall elever deltatt (participant count). No stable measure code is exposed by the API for these three columns, only the label.';

comment on column raw.udir_nasjonale_prover.value is
  'The measure''s value for this region/grade/subject/year slice. NULL when Udir itself suppressed the cell (its own marker, the literal character ''*'').';
