-- raw.ssb_12944 — landing table for SSB statistikkbanktabell 12944
-- (Personer i husholdninger med vedvarende lavinntekt (EU-60), 3-årsperiode).
--
-- Populated by atlas-data/ingest/src/sources/ssb-12944. Four dimensions instead
-- of 08764's three: Region × Alder × ContentsCode × Tid, where Tid values are
-- three-year rolling periods ("2011-2013" through "2022-2024") stored as text.

create table if not exists raw.ssb_12944 (
  region_code     text        not null,
  age_group       text        not null,
  period          text        not null,       -- e.g. "2022-2024"
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, age_group, period, contents_code)
);

comment on table raw.ssb_12944 is
  'SSB table 12944 — persons in households with persistent low income (EU-60), 3-year rolling periods. Loaded by atlas-data/ingest/src/sources/ssb-12944.';

comment on column raw.ssb_12944.period is
  'Three-year rolling period as upstream code, e.g. "2022-2024". Stored verbatim; parse into start/end years in dbt if needed.';
comment on column raw.ssb_12944.age_group is
  'SSB Alder dimension code. Values: 999A (all ages), 00-17, 18-34, 35-49, 50-66, 067+.';
comment on column raw.ssb_12944.value is
  'NULL when the upstream cell is suppressed; see status column for the suppression marker.';
