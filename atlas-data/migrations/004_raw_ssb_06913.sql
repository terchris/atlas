-- raw.ssb_06913 — landing table for SSB statistikkbanktabell 06913
-- (Endringer i befolkningen — folketilvekst, levendefødte, døde,
-- flytting, per kommune og fylke, annual).
--
-- Populated by atlas-data/ingest/src/sources/ssb-06913. Same 3-dimension shape
-- as ssb_08764 but with 8 ContentsCodes instead of 5.

create table if not exists raw.ssb_06913 (
  region_code     text        not null,
  year            integer     not null,
  contents_code   text        not null,
  contents_label  text        not null,
  value           numeric,
  status          text,
  loaded_at       timestamptz not null default now(),
  primary key (region_code, year, contents_code)
);

comment on table raw.ssb_06913 is
  'SSB table 06913 — population change indicators (Folkemengde, Levende, Dode, Fodselsoverskudd, Innflyttinger, Utflyttinger, Nettoinnflytting, Folketilvekst). Loaded by atlas-data/ingest/src/sources/ssb-06913.';
