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

-- 🔴 SET ONLY IF THE SCHEMA HAS NO DESCRIPTION YET. THIS USED TO CLOBBER.
--
-- This file is the FRESH-INSTALL copy. api_v1_generated.sql emits a much
-- longer COMMENT ON SCHEMA (2417 chars against this one's 464) which PostgREST
-- splits into the OpenAPI info.title and info.description — the root document
-- that indexes all 19 relations (urb-agents #382, #1335).
--
-- ⚠️ THE MIGRATION RUNNER TRACKS NO STATE. It re-applies every file on every
-- run, by design, and that is safe for CREATE ... IF NOT EXISTS. It was NOT
-- safe for an unconditional COMMENT: the statement is idempotent in the sense
-- that re-running it gives the same result, and that result is the STUB.
--
-- 🔴 AND ALL SIX INGEST JOBS RUN MIGRATIONS. _asset_selection() in
-- schedules.py always includes the migrations asset, so annual_sources_refresh,
-- klass_refresh, seed_sources_refresh, brreg_bootstrap, brreg_change_feed and
-- redcross_branches_refresh each reset the root document to this stub — and
-- NONE of them republishes api_v1. Only transform_and_publish or
-- publish_api_v1 puts the real one back. An ingest run therefore leaves the
-- public API's front page truncated until the next publish.
--
-- 🔵 Two independent parties read the stub and neither recognised it: a
-- consumer at 22:30Z on 2026-09-21, and ops-dev at 16:33Z on 2026-09-22 —
-- minutes after that deploy's annual_sources_refresh. Both reported it as
-- something else. The consumer went further and RETIRED a correct lesson about
-- discoverability on the strength of it (urb-agents #1393).
--
-- ⚠️ The titles are identical in both copies, so nothing looks truncated.
-- Only the description differs, which is why this survived so long.
--
-- 🔵 The conditional keeps both purposes: a fresh install still gets a usable
-- pointer before any transform has run, and an existing database keeps the
-- generated one. Guarded by the drift check added in atlas#411, which compares
-- COMMENT ON SCHEMA against the generated text — the first check that could
-- see this at all.
DO $$
BEGIN
  IF (SELECT obj_description(oid, 'pg_namespace')
        FROM pg_namespace WHERE nspname = 'api_v1') IS NULL THEN
    COMMENT ON SCHEMA api_v1 IS
      'Atlas — open semantic layer over Norwegian public data

Curated wrapper views over marts.*, served by PostgREST. Start at
meta_endpoints (the index), then meta_sources (per ingest source) and
meta_dimensions (per source x upstream dimension: what each coded column
means). Views are generated (atlas-data/dbt/api_v1_generated.sql) and applied
after dbt run; the schema itself is created here so a fresh install can
configure PostgREST before any transform has run.

This is the FRESH-INSTALL placeholder. If you are reading it on a database
that has run a transform, the generated root document has been lost and a
publish_api_v1 will restore it.';
  END IF;
END $$;
