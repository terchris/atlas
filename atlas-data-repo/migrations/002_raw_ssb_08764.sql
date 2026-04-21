-- raw.ssb_08764 — landing table for SSB statistikkbanktabell 08764
-- (Personer under 18 år i husholdninger med lavinntekt, EU- og OECD-skala).
--
-- Populated by atlas-data/ingest/src/sources/ssb-08764. The shape mirrors one
-- flattened JSON-stat2 cell per row. Idempotent on the composite primary key:
-- re-running the ingest updates value/status/loaded_at for existing rows.

create table if not exists raw.ssb_08764 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);

comment on table raw.ssb_08764 is
  'SSB table 08764 — children under 18 in low-income households (EU/OECD scale). Loaded by atlas-data/ingest/src/sources/ssb-08764.';

comment on column raw.ssb_08764.value is
  'NULL when the upstream cell is suppressed; see status column for the suppression marker.';
comment on column raw.ssb_08764.status is
  'SSB status/suppression marker (e.g. "." for confidential). NULL when the cell has a plain numeric value.';
