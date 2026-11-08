-- raw.kartverket_fylke — Kartverket's current county boundaries, verbatim,
-- one row per fylke. urb-agents #2098/#2099 (R4). Sibling to
-- raw.kartverket_kommune — see that migration's header for the shared
-- reasoning (current state only, names as a jsonb array).
--
-- 15 rows, not 16: this table carries no '99 Uoppgitt' sentinel the way
-- dim_fylke does (that sentinel is SSB Klass's, not Kartverket's — this is
-- real administrative geometry, there is no polygon for "unspecified").
create table if not exists raw.kartverket_fylke (
  fylke_nr   text        not null,
  fylke_navn text        not null,   -- Kartverket's own combined display name (fylkesnavn field) — see column comment
  names      jsonb       not null,   -- the full administrativenhetnavn array, verbatim
  gyldig_fra date,
  gyldig_til date,
  geometry   geometry(MultiPolygon, 4258) not null,
  loaded_at  timestamptz not null default now(),
  primary key (fylke_nr)
);

comment on table raw.kartverket_fylke is
  'Kartverket''s current county boundaries (Geonorge dataset 6093c8a8-fa80-11e6-bc64-92361f002671), one row per fylke, verbatim. Loaded by atlas-data/ingest/src/sources/kartverket-fylke. Current state only, 15 rows — no SSB-style ''99 Uoppgitt'' sentinel exists in Kartverket''s own administrative geometry.';

comment on column raw.kartverket_fylke.fylke_navn is
  'Kartverket''s own combined display name, verbatim from the upstream fylkesnavn field — already hyphenated across official languages where more than one exists (e.g. "Troms - Romsa - Tromssa"), in rekkefolge order. The individual names are in the names column.';
comment on column raw.kartverket_fylke.names is
  'The full administrativenhetnavn array verbatim: [{navn, rekkefolge, sprak}, ...].';
