-- raw.ssb_06944 — landing table for SSB statistikkbanktabell 06944
-- (Inntekt for husholdninger, etter husholdningstype). Median household
-- income + taxes + count, per kommune/bydel/fylke/nasjon, by household type.
--
-- Populated by atlas-data/ingest/src/sources/ssb-06944.

create table if not exists raw.ssb_06944 (
  region_code     text        not null,
  household_type  text        not null,   -- HusholdType: 0000..0004
  year            integer     not null,
  contents_code   text        not null,   -- SamletInntekt, InntSkatt, AntallHushold
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, household_type, year, contents_code)
);

comment on table raw.ssb_06944 is
  'SSB table 06944 — household income by household type. Includes kommuner, bydeler (delområder), fylker and national aggregates. Loaded by atlas-data/ingest/src/sources/ssb-06944.';

comment on column raw.ssb_06944.household_type is
  'SSB HusholdType code: 0000 (all households), 0001..0004 (specific types — see upstream metadata).';
