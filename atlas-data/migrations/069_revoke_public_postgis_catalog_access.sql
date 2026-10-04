-- 069_revoke_public_postgis_catalog_access.sql
--
-- 🔴 A NON-OWNER REVOKE OF AN ALREADY-REVOKED PUBLIC GRANT IS NOT A NO-OP —
-- IT IS A HARD ERROR. READ THIS BEFORE TOUCHING THE DO BLOCK BELOW.
--
-- `public_role_reaches_only_api_v1` was red after this migration first ran
-- (imac, urb-agents #1834): the migration runner connects as the `atlas`
-- role; PostGIS's install script creates these three objects owned by
-- whoever ran `CREATE EXTENSION postgis` — `postgres` on this cluster, not
-- `atlas`. A `REVOKE` issued by a role that is neither the object's owner nor
-- a superuser and holds no GRANT OPTION silently no-ops *while PUBLIC still
-- holds the grant*: the command returns `REVOKE` with only a WARNING (which
-- a migration runner's success/fail logging does not surface), and the ACL
-- is unchanged.
--
-- imac then applied the real fix as the Postgres superuser directly
-- (#1835) — and the next ingest job's migration step broke the entire
-- cluster: `annual_sources_refresh` failed in 31.4s with
-- `ERROR: permission denied for table geometry_columns` (SQLSTATE 42501) on
-- this exact migration, taking every downstream `raw__*` asset down with it
-- (urb-agents #1841). **The REVOKE's behavior under non-owner privilege is
-- NOT uniform — it depends on whether PUBLIC currently holds the grant**:
-- while PUBLIC still has it, the statement WARNs and no-ops (as above); once
-- PUBLIC's grant is actually gone, the identical statement raises a hard
-- `insufficient_privilege` error instead. Reproduced directly, not guessed
-- (imac against the real cluster roles in both states; this agent against a
-- throwaway Postgres 15 with plain objects of the same kind — a table and a
-- view, owned by a superuser-equivalent role, REVOKE attempted by a second
-- non-owner role with no GRANT OPTION — same WARNING-then-ERROR transition
-- both times, confirmed SQLSTATE 42501 via `\set VERBOSITY verbose`).
--
-- **THE FIX: each REVOKE is now wrapped in its own `BEGIN...EXCEPTION WHEN
-- insufficient_privilege THEN NULL; END;` block.** Verified end to end
-- against the throwaway Postgres in all three states a stateless,
-- every-job-reapplies migration runner will actually hit: (1) PUBLIC still
-- holds the grant — WARNING, silent no-op, ACL unchanged, exit 0; (2)
-- PUBLIC's grant just removed by the superuser — the exception is caught,
-- silent, ACL stays correctly revoked (does NOT regrant anything), exit 0;
-- (3) re-run again immediately after in the same (2) state — still silent,
-- still exit 0. This is the fix imac asked for on #1841 without attempting
-- themselves ("that's your code"), applied and tested before being merged
-- rather than reasoned about in the abstract — the first version of this
-- file shipped from exactly that kind of reasoning gap (see below) and this
-- is the second one, so both fixes here were verified against a real
-- non-owner role before being trusted.
--
-- This is why the throwaway-Postgres test this file originally shipped with
-- did not catch the FIRST defect: that test ran as the Postgres superuser
-- throughout, so it owned the object it was revoking on. Testing the
-- REVOKE's SQL semantics is not the same as testing it under the PRIVILEGE
-- the migration runner actually holds in production — that gap was the
-- whole defect, and the second defect above is the same family one layer
-- deeper: testing a non-owner REVOKE against only ONE of the two ACL states
-- it will actually run under in production.
--
-- THE REAL REVOKE STILL HAPPENS OUTSIDE THIS REPO'S PIPELINE: this REVOKE
-- needs to run once, for real, as the Postgres superuser (or as these
-- objects' owner), by whoever administers the cluster — not by widening
-- `atlas`'s own role (transferring ownership of `geometry_columns`/
-- `geography_columns` to `atlas` so a future migration-as-`atlas` REVOKE
-- would work was considered and rejected: those two are PostGIS's own
-- shared system VIEWS, not atlas's objects, and handing the `atlas` role
-- DROP/ALTER rights over them to buy one convenience is a larger privilege
-- expansion than the one-time manual step it would replace). This file's
-- job is only ever to (a) no-op harmlessly before that manual step happens,
-- and (b) no-op harmlessly forever after, confirming the fix stays applied
-- and catching a regression if PostGIS is ever reinstalled and the PUBLIC
-- grant reappears — never to apply the real fix itself.
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
-- WHY A DO BLOCK WITH to_regclass GUARDS, AND A NESTED EXCEPTION BLOCK PER REVOKE
--
-- The three views only exist if `CREATE EXTENSION postgis` has run. REVOKE on
-- a relation that does not exist is an error, not a no-op, so each is
-- guarded by `to_regclass`. That guard alone is not enough: REVOKE on a
-- privilege PUBLIC still holds is a no-op in Postgres (WARNING, no error),
-- but REVOKE on a privilege PUBLIC no longer holds, run by a non-owner role,
-- is a hard `insufficient_privilege` error (#1841, see above) — so each
-- REVOKE additionally gets its own `BEGIN...EXCEPTION WHEN
-- insufficient_privilege THEN NULL; END;` block. This is what makes the
-- migration safe to re-apply on every single job regardless of which of the
-- two ACL states the real superuser-applied fix has reached.
--
-- Tested end to end against a throwaway Postgres 15, as a NON-OWNER,
-- NON-SUPERUSER role (not the superuser that owned the test objects — that
-- was the first version's gap): confirmed WARNING + silent no-op while
-- PUBLIC holds the grant; confirmed the superuser's real revoke is correctly
-- preserved (not re-granted) and the migration itself raises nothing once
-- PUBLIC's grant is gone; confirmed re-running it again immediately after,
-- in that same state, is still a harmless no-op. All three states a
-- stateless, every-job migration runner will actually encounter in
-- production, not just the one state the first version happened to ship
-- having tested.

DO $$
BEGIN
  IF to_regclass('public.geometry_columns') IS NOT NULL THEN
    BEGIN
      REVOKE SELECT ON public.geometry_columns FROM PUBLIC;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
  IF to_regclass('public.geography_columns') IS NOT NULL THEN
    BEGIN
      REVOKE SELECT ON public.geography_columns FROM PUBLIC;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    BEGIN
      REVOKE SELECT ON public.spatial_ref_sys FROM PUBLIC;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
END $$;
