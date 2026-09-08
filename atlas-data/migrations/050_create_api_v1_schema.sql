-- 050_create_api_v1_schema.sql
-- Create the api_v1 namespace empty, at migration time.
--
-- WHY THIS IS A MIGRATION AND NOT A dbt/GENERATOR CONCERN
--
-- api_v1.* views are built by atlas-data/dbt/api_v1_generated.sql, applied by
-- ./apply-api-v1.sh *after* `dbt run` — the wrappers select from marts.mart_*,
-- which do not exist until dbt has built them. That is correct and unchanged.
--
-- But a UIS install runs migrations and then configures PostgREST, long before
-- any transform has run. `configure-postgrest.sh` checks for the *schema*, not
-- for views:
--
--     SELECT 1 FROM pg_namespace WHERE nspname='api_v1'
--
-- and refuses a schema that is not there. Without this file the install fails
-- at `uis configure postgrest` and never reaches a first materialisation —
-- the transform that would have created the schema can never run.
--
-- An empty schema is enough to satisfy it, and it is not a stopgap. The same
-- configure step emits, per schema:
--
--     GRANT USAGE ON SCHEMA api_v1 TO <app>_web_anon;
--     GRANT SELECT ON ALL TABLES IN SCHEMA api_v1 TO <app>_web_anon;
--     ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1 GRANT SELECT ON TABLES TO <app>_web_anon;
--
-- The default-privileges line means every view apply-api-v1.sh creates later is
-- readable with no re-grant and no second configure pass.
--
-- CONSEQUENCE, NAMED DELIBERATELY: between install and the first ingest the API
-- answers healthily with zero endpoints. That is why data freshness is a
-- monitor rather than an install-time verify — `uis verify postgrest` proves the
-- pipe with a probe row it owns; the freshness check proves the data and is
-- correctly red until the first ingest lands.
--
-- api_v1_generated.sql also opens with CREATE SCHEMA IF NOT EXISTS api_v1, so
-- the two are idempotent in either order and neither depends on the other.
--
-- Context: urb-agents #323 (tor-agent, UIS maintainer); supersedes the ordering
-- fix proposed in #159. raw and marts are already created by 001.

CREATE SCHEMA IF NOT EXISTS api_v1;

COMMENT ON SCHEMA api_v1 IS
  'Atlas published API contract — curated wrapper views over marts.*, served by PostgREST. Views are generated (atlas-data/dbt/api_v1_generated.sql) and applied after dbt run; the schema itself is created here so a fresh install can configure PostgREST before any transform has run.';
