-- 026_private_schemas.sql
-- Create the schema namespaces for Layer 2 conformed private marts
-- (private_raw / private_marts) per the three-layer model in
-- INVESTIGATE-private-atlas-deployments.md §C.1 and the same-Postgres dev mode
-- documented in private-marts-shapes.md.
--
-- In dev these schemas live in the same Postgres as the public marts.* —
-- separation is by schema namespace + Postgres role. In production each NGO's
-- private deployment has its own Postgres.
--
-- Role intent (not enforced here; configured per-deployment):
--   atlas_public_read   — SELECT on marts.* only
--   atlas_private_read  — SELECT on marts.* + private_raw.* + private_marts.*

CREATE SCHEMA IF NOT EXISTS private_raw;
CREATE SCHEMA IF NOT EXISTS private_marts;

COMMENT ON SCHEMA private_raw IS
  'Layer 2 raw landing zone — Atlas-defined shape, NGO-ingested data.';

COMMENT ON SCHEMA private_marts IS
  'Layer 2 conformed marts — Atlas owns the shape (per docs/stack/private-marts-shapes.md), NGO ingests the data.';
