-- raw.brreg_frivillige — Frivillighetsregisteret, the voluntary-organisation register.
-- Populated by atlas-data/ingest/src/sources/brreg-frivillige. PLAN-003 phase 3.
--
-- WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
--
-- 🔴 Not membership. Whether an organisation is in Frivillighetsregisteret is
-- already on 100% of Enhetsregisteret's bulk records as
-- `registrertIFrivillighetsregisteret`, true for ~72,798 of them. So
-- marts.dim_brreg_enhet carries membership on day one from the snapshot alone,
-- with no second API call.
--
-- This table is only for the FRR-SPECIFIC attributes, which Enhetsregisteret does
-- not have: icnpoKategorier (the registrant's own classification), grasrotandel,
-- innfoertDato, vedtekter, regnskapsrapportering.
--
-- That split is deliberate and was designed in after imac reported this endpoint
-- as 404 (urb-agents #711). It was not 404 — the report tested four paths, none
-- of them the hyphenated one — but the split is worth having regardless: if this
-- register does become unavailable, the membership half of Atlas's NGO population
-- survives untouched and only the enrichment half needs rethinking.
--
-- NO CHANGE FEED EXISTS FOR THIS REGISTER.
--
-- Verified 2026-09-12: /oppdateringer, /oppdateringer/frivillige-organisasjoner
-- and /frivillige-organisasjoner/lastned all return 404. So unlike
-- Enhetsregisteret there is no incremental path and no bulk download — the only
-- option is to re-walk the register. At ~72,798 records, a `size` cap of 100 and
-- ~4 requests a second, that is ~727 requests and a few minutes. Cheap enough
-- daily; the loader upserts, so a walk that finds nothing new is a no-op.

create table if not exists raw.brreg_frivillige (
  organisasjonsnummer text        not null primary key,
  icnpo_nummer        text,
  icnpo_kategori      text,
  doc                 jsonb       not null,
  loaded_at           timestamptz not null default now()
);

comment on table raw.brreg_frivillige is
  'Brønnøysundregistrene Frivillighetsregisteret — the ~72,800 organisations registered as voluntary, with the attributes Enhetsregisteret does not carry. Loaded by atlas-data/ingest/src/sources/brreg-frivillige. NOT the source of membership: that flag is already on every Enhetsregisteret record. See the migration header.';

comment on column raw.brreg_frivillige.icnpo_nummer is
  'Primary ICNPO code (rekkefoelge 1) from the registrant''s own icnpoKategorier, e.g. "9100". 🟢 The registrant''s classification of itself, which is better evidence than one derived from a NACE industry code — and the reason this register is worth a second call at all. The full array, including any secondary categories, stays in doc.';

comment on column raw.brreg_frivillige.icnpo_kategori is
  'Primary ICNPO category label, e.g. "ICNPOKategori.internasjonaleOrganisasjoner". Paired with icnpo_nummer from the same array element.';

comment on column raw.brreg_frivillige.doc is
  'The upstream record exactly as Brreg published it: frivilligOrganisasjonsstatus, kontonummer, innfoertDato, foersteGangInnfoert, grasrotandel, regnskapsrapportering, vedtekter, paategninger and the full icnpoKategorier array. Nothing dropped.';

comment on column raw.brreg_frivillige.loaded_at is
  'When Atlas last wrote this row. The register is re-walked in full each run — there is no change feed for it — so this tracks the walk rather than any upstream event.';
