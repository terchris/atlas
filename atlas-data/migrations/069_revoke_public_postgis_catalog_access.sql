-- 069_revoke_public_postgis_catalog_access.sql
--
-- WHAT THIS FIXES
--
-- `public_role_reaches_only_api_v1` (atlas-data/dagster/atlas_data/assets/api_v1.py)
-- has reported the PostgREST anonymous role able to read three PostGIS catalog
-- views outside api_v1: public.geometry_columns, public.geography_columns,
-- public.spatial_ref_sys. Red across every run checked (urb-agents #1830,
-- #1832, #1833).
--
-- WHY THE ANON ROLE CAN READ THEM WITHOUT ATLAS EVER GRANTING IT
--
-- Nothing in this repo grants anything on them. PostGIS's own extension
-- install script grants SELECT on all three TO PUBLIC — by design, because
-- PostGIS's own functions (ST_Transform and friends) need any calling role,
-- including unprivileged ones, to read spatial_ref_sys for CRS lookups.
-- `PUBLIC` is a pseudo-role every role belongs to, so atlas_web_anon inherits
-- this the moment it exists, with no GRANT naming it.
--
-- 🔴 A FIRST FIX ATTEMPT (REVOKE FROM THE ANON ROLE SPECIFICALLY) WAS TRIED
-- AND FOUND NOT TO WORK, TESTED RATHER THAN ASSUMED (urb-agents #1833).
-- Postgres privilege checks are the UNION of direct grant, role-membership
-- grant, and PUBLIC grant — revoking a privilege from one specific role has
-- no effect when PUBLIC already grants it to everyone, which includes that
-- role. There is no "deny this one role a PUBLIC privilege" in standard SQL
-- GRANT/REVOKE. The only way to actually remove the access is to revoke it
-- from PUBLIC itself.
--
-- WHY REVOKING FROM PUBLIC IS SAFE HERE, CHECKED RATHER THAN ASSUMED
--
-- Revoking from PUBLIC is scoped to objects and roles reachable from the
-- DATABASE this migration runs against — PostgreSQL extensions (and the
-- objects they create) are per-database, not cluster-wide. Confirmed directly
-- (two throwaway databases, same PostGIS table name, REVOKE FROM PUBLIC run
-- in one: the other was provably unaffected afterward) rather than assumed
-- from general Postgres knowledge.
--
-- Within the `atlas` database specifically (imac, urb-agents #1833, checked
-- live): PostGIS 3.6.2 is installed but UNUSED — zero geometry/geography-typed
-- columns anywhere in any of this cluster's 4 databases, zero real ST_*
-- function calls in atlas's own dbt models/macros/seeds/tests (grep hits were
-- README prose and one false-positive inside a vendored dbt_utils macro). The
-- ACL on atlas's own 3 objects today is only the owner grant plus PUBLIC's
-- `=r` — nothing else. The non-superuser roles that can connect to `atlas`
-- are `atlas` (app/owner), `atlas_authenticator`, `atlas_web_anon`; none of
-- them calls a PostGIS function anywhere in this schema. So revoking PUBLIC's
-- access within this database has no consumer to break.
--
-- WHY THIS CANNOT NAME THE ANON ROLE AND DOES NOT NEED TO
--
-- Unlike the first attempt, this fix does not need to know the PostgREST
-- anonymous role's name at all — it removes the PUBLIC grant that gave every
-- role (anon included) the access in the first place, so there is nothing
-- role-specific to discover or template.
--
-- WHY THIS IS NOT CURRENTLY URGENT, STATED SO THE SEVERITY IS NOT OVERSTATED
--
-- Confirmed live against the production API, independently, twice (this
-- agent and imac): `curl -H "Accept-Profile: public" .../spatial_ref_sys`
-- returns 406, identical to any other schema not in PostgREST's configured
-- `PGRST_DB_SCHEMAS=api_v1` list (website/docs/contributors/setup.md). So this
-- grant is real at the Postgres ACL layer and the check is right to flag it
-- as a defense-in-depth gap, but it is NOT reachable over the public HTTP API
-- today regardless of this grant. This migration closes the gap anyway,
-- because a check that is right should be made to pass rather than argued
-- around, and because defense-in-depth exists precisely for the day the
-- PostgREST schema config changes and this would otherwise become live with
-- no further warning.
--
-- WHY A DO BLOCK WITH to_regclass GUARDS
--
-- The three views only exist if `CREATE EXTENSION postgis` has run. REVOKE on
-- a relation that does not exist is an error, not a no-op, so each is
-- guarded. REVOKE on a privilege PUBLIC was never granted IS a no-op in
-- Postgres (no error), so this is safe to run every time the migration runner
-- re-applies every file (by design, per migration 050's own note) — a
-- database where the fix is already applied sees no change on reapply.
--
-- Tested end to end against a throwaway Postgres 15: a `public.spatial_ref_sys`
-- table GRANTed to PUBLIC exactly as PostGIS's own install script does,
-- confirmed readable by PUBLIC before this migration, confirmed unreadable
-- after, confirmed the revoke in one database leaves an identically-named
-- table in a second database on the same cluster untouched, and confirmed
-- re-running the migration is a harmless no-op.

DO $$
BEGIN
  IF to_regclass('public.geometry_columns') IS NOT NULL THEN
    REVOKE SELECT ON public.geometry_columns FROM PUBLIC;
  END IF;
  IF to_regclass('public.geography_columns') IS NOT NULL THEN
    REVOKE SELECT ON public.geography_columns FROM PUBLIC;
  END IF;
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    REVOKE SELECT ON public.spatial_ref_sys FROM PUBLIC;
  END IF;
END $$;
