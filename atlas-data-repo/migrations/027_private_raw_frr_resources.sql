-- 027_private_raw_frr_resources.sql
-- Raw landing zone for FRR (Felles Ressursregister) resources.
--
-- FRR is a Norwegian government-shared registry. The schema is defined by FRR
-- and adopted verbatim — see the FRR OpenAPI spec (kept under each NGO's
-- private docs folder, e.g. atlas-private-data-repo/<ngo>/docs/, and a
-- synthetic version under atlas-private-data-repo/sample-ngo/frr/).
-- See docs/stack/private-marts-shapes.md for the Layer-2 contract the dbt
-- staging produces from this raw table.
--
-- Atlas owns this table because FRR is a standards-based source consumed by
-- multiple NGOs in the same shape. Per-NGO data is distinguished by the
-- ngo_orgnr column.
--
-- Design notes:
--   raw_payload is the full FRR JSON record verbatim — preserves audit trail
--   and lets us re-parse without re-ingesting if staging logic changes.
--   id is FRR's own identifier (verbatim, not renamed).
--   ngo_orgnr is Atlas-introduced for multi-NGO coexistence (Brreg orgnr).

CREATE TABLE IF NOT EXISTS private_raw.frr_resources (
  id               TEXT        PRIMARY KEY,                       -- FRR id verbatim
  ngo_orgnr        TEXT        NOT NULL,                          -- Brreg orgnr (e.g. '864139442' for Red Cross)
  raw_payload      JSONB       NOT NULL,                          -- full FRR record
  sist_oppdatert   TIMESTAMPTZ,                                   -- denormalised from raw_payload->>'sistOppdatert' for indexing
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frr_resources_ngo_orgnr_idx
  ON private_raw.frr_resources (ngo_orgnr);

CREATE INDEX IF NOT EXISTS frr_resources_sist_oppdatert_idx
  ON private_raw.frr_resources (sist_oppdatert);

COMMENT ON TABLE private_raw.frr_resources IS
  'FRR resource records, one row per resource. Verbatim FRR JSON in raw_payload; dbt staging shreds into typed columns in private_marts.frr_resources.';

COMMENT ON COLUMN private_raw.frr_resources.id IS
  'FRR resource identifier (verbatim from FRR API).';

COMMENT ON COLUMN private_raw.frr_resources.ngo_orgnr IS
  'NGO Brreg orgnr (Atlas-introduced for multi-NGO coexistence; matches dim_ngo.orgnr).';

COMMENT ON COLUMN private_raw.frr_resources.raw_payload IS
  'Full FRR JSON record. Source of truth for re-parsing if staging logic evolves.';
