-- raw.kartverket_kommune — Kartverket's current municipality boundaries,
-- verbatim, one row per kommune. urb-agents #2098/#2099 (R4).
--
-- ⚠️ CURRENT STATE ONLY, UNLIKE dim_kommune. Kartverket's "Administrative
-- enheter" whole-country download returns only units valid right now — every
-- one of the 357 features measured 2026-11-08 had gyldigTil = null. This is
-- NOT the KLASS full-history series dim_kommune builds from (raw.ssb_klass_kommuner);
-- a kommune that merged out of existence is not retrievable from this table
-- at all. gyldigFra/gyldigTil are stored verbatim because the request asks
-- for them, not because this table can answer "what did this look like
-- before".
--
-- names is a jsonb array, not a single text column, because 22 of 357
-- kommuner (measured 2026-11-08) carry more than one official name — Sami
-- and/or Kven forms alongside Norwegian. Flattening to one column would
-- have to pick one and discard the others, which this repo does not do to
-- upstream data.
create table if not exists raw.kartverket_kommune (
  kommune_nr   text        not null,
  kommune_navn text        not null,   -- Kartverket's own combined display name (kommunenavn field) — see column comment
  names        jsonb       not null,   -- the full administrativenhetnavn array, verbatim
  gyldig_fra   date,
  gyldig_til   date,
  geometry     geometry(MultiPolygon, 4258) not null,
  loaded_at    timestamptz not null default now(),
  primary key (kommune_nr)
);

comment on table raw.kartverket_kommune is
  'Kartverket''s current municipality boundaries (Geonorge dataset 041f1e6e-bdbc-4091-b48f-8a5990f3cc5b), one row per kommune, verbatim. Loaded by atlas-data/ingest/src/sources/kartverket-kommune. Current state only — see this migration''s own header for why dim_kommune (built from SSB Klass) is the one to use for history.';

comment on column raw.kartverket_kommune.kommune_navn is
  'Kartverket''s own combined display name, verbatim from the upstream kommunenavn field. ⚠️ NOT just the primary/rekkefolge=1 name: for a kommune with more than one official name this is ALREADY the hyphenated combination (e.g. "Loabák - Lavangen"), in rekkefolge order — which itself is not always Norwegian-first (checked live 2026-11-08: kommune 5518''s rekkefolge=1 is Loabák, Sami). The individual names are in the names column.';
comment on column raw.kartverket_kommune.names is
  'The full administrativenhetnavn array verbatim: [{navn, rekkefolge, sprak}, ...]. 22 of 357 kommuner (measured 2026-11-08) carry more than one entry.';
comment on column raw.kartverket_kommune.gyldig_til is
  'Null for every row in a whole-country pull, measured 2026-11-08 — this dataset returns current units only. Stored because the upstream carries the field and the request asks for it, not because a non-null value has been observed here.';
