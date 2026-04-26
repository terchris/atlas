-- raw.ssb_06947 — landing table for SSB statistikkbanktabell 06947
-- (Personer i husholdninger med lavinntekt, EU- og OECD-skala). Same shape
-- as ssb_08764 but for the whole population instead of children under 18.
--
-- Populated by atlas-data/ingest/src/sources/ssb-06947.

create table if not exists raw.ssb_06947 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);

comment on table raw.ssb_06947 is
  'SSB table 06947 — whole-population low-income (EU/OECD scale). Complements ssb_08764 (children). Loaded by atlas-data/ingest/src/sources/ssb-06947.';
