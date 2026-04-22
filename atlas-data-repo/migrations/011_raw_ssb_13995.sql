-- raw.ssb_13995 — landing table for SSB statistikkbanktabell 13995
-- (Sosialhjelpstilfeller, utbetalt beløp og stønadstid). Region × Tid ×
-- ContentsCode. 34 content codes covering caseload, recipients, amounts
-- paid, duration, share of beneficiaries, etc.
--
-- Populated by atlas-data/ingest/src/sources/ssb-13995.

create table if not exists raw.ssb_13995 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);

comment on table raw.ssb_13995 is
  'SSB table 13995 — social-assistance cases, amounts paid, duration. KOSTRA-based kommune region dimension flattened into region_code. Loaded by atlas-data/ingest/src/sources/ssb-13995.';
