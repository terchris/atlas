-- raw.husbanken_bostotte — landing table for Husbanken's bostøtte (housing
-- allowance) statistics: application counts, decision counts, payout counts,
-- rejection counts, and the paid-out kroner amount. Populated by
-- atlas-data/ingest/src/sources/husbanken-bostotte.
-- One row per region_code × measure × year.
--
-- region_code, not kommune_nr: Husbanken's own KommuneNr dimension carries
-- real SSB-format codes with no crosswalk needed, but Svalbard's pseudo-codes
-- (2100, 2111) are present among them, confirmed live, always as real zero
-- values. kommune_nr is resolved downstream via this project's existing
-- classify_region_code/region_code_to_kommune_nr macros, same as every other
-- kommune-grain source — not assumed from the raw code's shape.

create table if not exists raw.husbanken_bostotte (
  region_code text        not null,
  year        integer     not null,
  measure     text        not null,
  value       numeric,
  loaded_at   timestamptz not null default now(),
  primary key (region_code, year, measure)
);

comment on table raw.husbanken_bostotte is
  'Husbanken bostøtte — housing allowance application, decision, payout and rejection counts, plus the paid kroner amount, per region, per year. Loaded by atlas-data/ingest/src/sources/husbanken-bostotte.';

comment on column raw.husbanken_bostotte.region_code is
  'SSB-format region code, read directly from the Qlik hypercube''s KommuneNr dimension. Not always a real kommune — Svalbard''s pseudo-codes (2100, 2111) are present, confirmed live, and so are Oslo''s 15 bydeler plus one discontinued pre-2004 one (4-digit codes 0311-0326, a numbering distinct from FHI''s 6-digit bydel convention). kommune_nr is derived downstream via classify_region_code, not stored here.';

comment on column raw.husbanken_bostotte.year is
  'Calendar year from the hypercube''s År dimension. Rows where Husbanken''s own system recorded no year (the literal text "-") are dropped during parsing, not fabricated into a fake year.';

comment on column raw.husbanken_bostotte.measure is
  'Which bostøtte figure this row''s value is: soknad (application count), vedtak (decision count), utbetaling (payout count), avslag (rejection count), or belop (paid kroner amount). Named via explicit qLabels set on the Qlik request.';

comment on column raw.husbanken_bostotte.value is
  'The measure''s value for this region and year. No suppression marker was found in this dataset during Phase 1/2 research — a null here means Qlik''s own qNum was unparseable, not a deliberate redaction.';
