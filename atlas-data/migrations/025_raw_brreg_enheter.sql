-- raw.brreg_enheter — cross-NGO Brreg Enhetsregister landing.
--
-- One row per Brreg `enhet` pulled for any NGO Atlas tracks. Populated by the
-- generic ingest at atlas-data/ingest/src/seed-sources/brreg-enheter/,
-- which iterates through a per-NGO config (ngos.json) and upserts every
-- matching enhet into this single table. No ngo_slug column — the `navn` and
-- orgnr self-identify, and downstream queries match on name prefix (same way
-- the scrape match-logic will work).
--
-- API-sourced (not a scrape). INVESTIGATE-ngo-scraping-infrastructure §C.5
-- mandatory scraper columns (url, record_hash, html_raw_hash, is_active) do
-- NOT apply here — follows the existing raw.<source> convention for API-
-- sourced ingests.
--
-- Status columns (konkurs, under_avvikling, under_tvangsavvikling) come
-- directly from Brreg's Enhet response. Downstream "is this NGO active?"
-- queries filter on these; we don't maintain a synthetic is_active flag
-- because Brreg already owns that concept.

create table if not exists raw.brreg_enheter (
  orgnr                          text        not null,
  navn                           text        not null,
  organisasjonsform              text        not null,          -- e.g. 'FLI' for NGO foreninger
  registrert_dato                date,                           -- registreringsdatoEnhetsregisteret
  i_frivillighetsreg             boolean     not null default false,
  antall_ansatte                 integer,
  konkurs                        boolean     not null default false,
  under_avvikling                boolean     not null default false,
  under_tvangsavvikling          boolean     not null default false,  -- underTvangsavviklingEllerTvangsopplosning
  raw_payload                    jsonb       not null,           -- full Brreg Enhet entity; forward-compat
  loaded_at                      timestamptz not null default now(),
  primary key (orgnr)
);

comment on table raw.brreg_enheter is
  'Cross-NGO Brreg Enhetsregister landing. Populated by ingest/src/seed-sources/brreg-enheter/ via the shared typed client at src/lib/brreg/. One row per Brreg orgnr; navn/orgnr self-identify which NGO the row belongs to. Status flags (konkurs, under_avvikling, under_tvangsavvikling) come verbatim from Brreg.';
comment on column raw.brreg_enheter.orgnr is
  '9-digit Brreg organisasjonsnummer. Primary key.';
comment on column raw.brreg_enheter.organisasjonsform is
  'Brreg organisasjonsform kode (e.g. FLI, ORGL, AS). Matches ingest config filter.';
comment on column raw.brreg_enheter.raw_payload is
  'Full Brreg Enhet entity as returned by data.brreg.no/enhetsregisteret/api/enheter. Kept for audit and fields we did not promote to dedicated columns (naeringskode, sektorkode, postadresse, etc.).';
