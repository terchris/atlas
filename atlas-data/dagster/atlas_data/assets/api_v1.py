"""
The api_v1.* public API surface, as the terminal asset of the graph.

`api_v1.*` is a set of thin wrapper views over the `models/marts/api/` marts —
the public contract PostgREST serves at api-atlas.helpers.no. The SQL is
generated at development time (dbt/scripts/generate_api_v1.py, committed as
dbt/api_v1_generated.sql) and applied AFTER `dbt run`, because the wrappers
reference marts tables that must already exist.

Applying it is what makes a refresh visible to API consumers: the generated SQL
re-creates the views, re-applies the per-column COMMENTs the OpenAPI spec is
built from, grants SELECT to the PostgREST anon role, and issues
`NOTIFY pgrst, 'reload schema'` so a running PostgREST picks the change up.
Without this asset the pipeline stops one step short of the thing anyone
outside Atlas can actually see.

Applied with psycopg2 rather than by shelling out to apply-api-v1.sh: that
script runs psql inside `docker run`, and there is no Docker daemon inside a
Dagster run pod. The SQL is idempotent (CREATE OR REPLACE / IF NOT EXISTS /
DROP IF EXISTS throughout), so re-running is a no-op.
"""

import json
import re
import os
from pathlib import Path

from dagster import (
    AssetCheckResult,
    AssetCheckSeverity,
    AssetExecutionContext,
    AssetKey,
    MaterializeResult,
    asset,
    asset_check,
)

from atlas_data.assets.dbt import (
    DBT_MANIFEST_PATH,
    DBT_PROJECT_DIR,
    dbt_translator,
)

API_V1_SQL_PATH = DBT_PROJECT_DIR / "api_v1_generated.sql"


def _api_model_asset_keys() -> "list[AssetKey]":
    """
    The marts this surface wraps, read from the baked dbt manifest.

    Derived rather than hardcoded: the api surface has already grown from 9
    wrappers to 13, and a hand-maintained list here would be one more thing to
    forget when the 14th lands.

    ⚠️ Keys come from the dbt translator, NOT from `AssetKey([node["name"]])`.
    dbt models inherit a key prefix from their configured schema, so the real
    key is `marts/mart_activity_catalog`, not `mart_activity_catalog`. Building
    them by hand silently produced 13 phantom upstream assets that nothing
    materialised — api_v1 looked wired and was not actually downstream of
    anything. Ask the translator; it is the same one @dbt_assets uses.
    """
    if not DBT_MANIFEST_PATH.exists():
        return []
    manifest = json.loads(DBT_MANIFEST_PATH.read_text())
    translator = dbt_translator()
    keys = []
    for node in manifest.get("nodes", {}).values():
        if node.get("resource_type") != "model":
            continue
        path = node.get("original_file_path", "").replace("\\", "/")
        if path.startswith("models/marts/api/"):
            keys.append(translator.get_asset_key(node))
    return sorted(keys, key=lambda k: k.to_user_string())


@asset(
    name="api_v1",
    group_name="api",
    deps=_api_model_asset_keys(),
    description=(
        "Applies dbt/api_v1_generated.sql — the api_v1.* wrapper views PostgREST "
        "serves, their column COMMENTs, the anon-role grant, and the PostgREST "
        "schema-cache reload. Terminal asset of the Atlas graph."
    ),
)
def api_v1_surface(context: AssetExecutionContext) -> MaterializeResult:
    import psycopg2  # imported here, not at module scope — cheap-import discipline

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to apply the "
            "api_v1 surface. For local dev, source atlas-data/ingest/.env."
        )
    if not API_V1_SQL_PATH.exists():
        raise FileNotFoundError(
            f"{API_V1_SQL_PATH} not found. Regenerate it with "
            f"`cd {DBT_PROJECT_DIR} && ./regenerate-api-v1.sh` and commit the result."
        )

    sql = API_V1_SQL_PATH.read_text()
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute(
                "select count(*) from information_schema.views "
                "where table_schema = 'api_v1'"
            )
            view_count = cur.fetchone()[0]
        conn.commit()

    context.log.info(f"api_v1 surface applied: {view_count} views")
    return MaterializeResult(
        metadata={
            "views": view_count,
            "sql_file": str(API_V1_SQL_PATH),
        }
    )


@asset_check(
    asset=api_v1_surface,
    name="rowcount_matches_marts",
    description=(
        "Every api_v1.<view> returns the same row count as its underlying "
        "marts.mart_<view>. Catches generator bugs — a wrong source relation, a "
        "stray WHERE, a projection that drops rows — and permission-related "
        "silent filtering."
    ),
)
def api_v1_rowcount_matches_marts():
    """
    The Dagster-side home of dbt's tests/api_v1_rowcount_matches_marts.sql.

    Two reasons it lives here rather than in dbt:

    1. **Ordering.** The dbt test hardcodes `api_v1.<view>` rather than using
       ref(), so dbt infers no dependencies and runs it early — while the same
       `dbt build` is dropping and recreating the marts tables those views
       depend on. As an asset check on api_v1 it runs after the views have been
       re-applied, which is the only moment the comparison means anything.
    2. **Drift.** The dbt version is a hand-maintained `union all` per view and
       its own header admits it: "when adding a new mart_<name> view ... add a
       corresponding union all line below". This version enumerates api_v1 from
       the catalog, so a new wrapper is covered the moment it exists.
    """
    import psycopg2

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to check the "
            "api_v1 surface."
        )

    mismatches = []
    checked = 0
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select table_name from information_schema.views "
                "where table_schema = 'api_v1' order by table_name"
            )
            views = [r[0] for r in cur.fetchall()]
            for view in views:
                # The generator's naming rule: api_v1.<name> wraps
                # marts.mart_<name>. A view whose mart is missing is itself a
                # finding, not something to skip past.
                cur.execute(
                    "select to_regclass(%s) is not null", (f"marts.mart_{view}",)
                )
                if not cur.fetchone()[0]:
                    mismatches.append(f"{view}: marts.mart_{view} does not exist")
                    continue
                cur.execute(f'select count(*) from api_v1."{view}"')
                api_count = cur.fetchone()[0]
                cur.execute(f'select count(*) from marts."mart_{view}"')
                mart_count = cur.fetchone()[0]
                checked += 1
                if api_count != mart_count:
                    mismatches.append(
                        f"{view}: api_v1={api_count} vs marts={mart_count}"
                    )

    return AssetCheckResult(
        passed=not mismatches,
        severity=AssetCheckSeverity.ERROR,
        metadata={
            "views_checked": checked,
            "mismatches": ", ".join(mismatches) if mismatches else "none",
        },
    )


@asset_check(
    asset=api_v1_surface,
    name="descriptions_match_the_running_build",
    blocking=False,
    description=(
        "The COMMENTs served as OpenAPI descriptions match the ones in the image "
        "that is running. They can differ for up to a day after an upgrade, in "
        "either direction, and nothing else notices."
    ),
)
def api_v1_descriptions_match_the_running_build():
    """
    🔴 THE DOCUMENTED CONTRACT TRACKS THE LAST PUBLISH, NOT THE RUNNING BUILD.

    `COMMENT`s live in the database, not the image. Only `transform_and_publish`
    applies them — `brreg_transform` runs 48 times a day and applies none of it.
    So an operator can install a build that fixes a published contract and keep
    serving the broken documentation until the next daily publish, with every
    signal green: exit status, `verify dagster`, and a 200 from the endpoint.

    ⚠️ imac measured all four states on 2026-09-13 (urb-agents #865), and every
    one is reachable by ordinary install and rollback:

        02:30  d78141a installed       CORRECTED   build had the fix
        02:40  rolled back to eba547e  SURVIVED    NEW docs on an OLD build
        03:00  transform on eba547e    REVERTED    old build overwrote the fix
        08:09  restored to e0ef430     still OLD   OLD docs on a NEW build  <- the operator case
        08:2x  transform on e0ef430    CORRECTED   agreement restored

    🔴 `e0ef430` was pinned specifically to correct `chapter_data_shape`. An
    operator installing it serves three values the column rejects for up to ~24
    hours, depending when they install relative to 05:00.

    It is the same class as the bootstrap blind spot, one layer out: no status
    signal answers "did the output reflect the input". There the gap was raw →
    marts; here it is image → public API.

    WHY THIS IS A CHECK AND NOT A FIX

    A per-run NOTIFY was falsified by imac — 14 reloads mid-run against
    half-torn-down state. Making `brreg_transform` apply comments pays the publish
    cost 48 times a day for something that changes on upgrade. The remedy is a
    one-time application at the moment it matters, and the operator-facing half of
    that is in `operational.install.note`.

    ⚠️ WARN, NOT ERROR, AND DELIBERATELY. The mismatch is a normal transient
    between an upgrade and the next publish, and it is fixed by a documented
    action. Failing the publish gate would make every upgrade look broken, and a
    gate that cries wolf on a healthy state is how a gate gets muted.

    🔵 It is useful precisely because `api_v1_checks` can run WITHOUT
    materialising the asset — so an operator who has just upgraded can ask "is my
    served documentation the one my build ships?" and get an answer without
    running a publish, which would destroy the evidence by fixing it.
    """
    import psycopg2

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to check the "
            "api_v1 surface."
        )

    # Expected state = what the RUNNING IMAGE ships. api_v1_generated.sql is
    # regenerated from the dbt manifest and committed, so it is the build's own
    # statement of what the documentation should say.
    #
    # ⚠️ Parsed rather than executed. Executing it would APPLY the comments,
    # which is the repair, not the check — and would make the drift unobservable
    # by fixing it. A check that cannot observe the state it reports on is the
    # failure this whole finding is about.
    expected: "dict[tuple[str, str], str]" = {}
    # A proper SQL string literal, not a non-greedy `(.*?)';`. Both parse today's
    # 124 statements identically and round-trip, but they differ on a comment
    # whose text contains `';` — escaped as `'';` — where the non-greedy form
    # stops at the first `'` and truncates the body silently.
    #
    # ⚠️ That would not fail. It would report the column as DRIFTED against a
    # database that is perfectly correct, and a check that invents drift is worse
    # than no check: it teaches the reader to disbelieve it. Tested against the
    # adversarial case rather than assumed.
    pattern = re.compile(
        r"COMMENT ON COLUMN api_v1\.(\w+)\.(\w+) IS '((?:[^']|'')*)';",
        re.DOTALL,
    )
    generated_sql = API_V1_SQL_PATH.read_text()
    for view, column, body in pattern.findall(generated_sql):
        expected[(view, column)] = body.replace("''", "'")

    # 🔴 AND THE VIEW-LEVEL DESCRIPTIONS, WHICH THIS CHECK USED TO IGNORE.
    #
    # Until 2026-09-20 the parser above was the whole of it: 148 COMMENT ON
    # COLUMN statements compared, and the file's 17 COMMENT ON VIEW statements
    # read by nothing. A view description could drift arbitrarily far from the
    # running image and this check reported `drifted: none`.
    #
    # ⚠️ That is not hypothetical, and it is not old. urb-agents #1271 was
    # exactly this: 864fb52 and 646b68c changed ONLY view descriptions — both
    # diff hunks land inside COMMENT ON VIEW api_v1.kommune_ngo_summary and
    # _totals — the API served the previous text until imac noticed by hand,
    # and this check was green throughout. It is the third occurrence in eight
    # days of an operator not knowing a publish was needed (#1253, #1267,
    # #1271), and the machine meant to make knowing unnecessary was blind to
    # the half of the surface that changed.
    #
    # 🔵 PostgREST renders obj_description as the OpenAPI *tag* description —
    # the paragraph a consumer reads before any column — so this half is not a
    # lesser one. It is the first thing anyone reads.
    #
    # `None` as the column half of the key: views and columns share one
    # namespace here, so one comparison covers both and the label reads
    # `view kommune_ngo_totals` rather than `kommune_ngo_totals.None`.
    view_pattern = re.compile(
        r"COMMENT ON VIEW api_v1\.(\w+) IS '((?:[^']|'')*)';",
        re.DOTALL,
    )
    for view, body in view_pattern.findall(generated_sql):
        expected[(view, None)] = body.replace("''", "'")

    if not expected:
        raise RuntimeError(
            f"no COMMENT ON COLUMN statements parsed from {API_V1_SQL_PATH} — "
            "the check cannot pass vacuously, so it fails instead. Regenerate "
            "with ./regenerate-api-v1.sh, or fix this parser if the emitted "
            "shape changed."
        )
    if not any(col is None for _, col in expected):
        raise RuntimeError(
            f"no COMMENT ON VIEW statements parsed from {API_V1_SQL_PATH} — "
            "the view half of this check would pass vacuously, which is the "
            "defect it was added to fix (urb-agents #1273). Same remedy."
        )

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select c.table_name,
                       c.column_name,
                       col_description(pgc.oid, c.ordinal_position)
                from information_schema.columns c
                join pg_class pgc on pgc.relname = c.table_name
                join pg_namespace pgn
                  on pgn.oid = pgc.relnamespace and pgn.nspname = 'api_v1'
                where c.table_schema = 'api_v1'
                """
            )
            actual = {(v, col): body for v, col, body in cur.fetchall()}
            cur.execute(
                """
                select pgc.relname, obj_description(pgc.oid, 'pg_class')
                from pg_class pgc
                join pg_namespace pgn on pgn.oid = pgc.relnamespace
                where pgn.nspname = 'api_v1' and pgc.relkind = 'v'
                """
            )
            actual.update({(v, None): body for v, body in cur.fetchall()})

    drifted = [
        f"view {v}" if c is None else f"{v}.{c}"
        for (v, c), want in sorted(
            expected.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")
        )
        if (v, c) in actual and actual[(v, c)] != want
    ]
    # Columns the image expects that the database has not got at all are the
    # `descriptions_complete` check's subject, not this one's. Two questions,
    # two checks — reporting both here would make each harder to act on.

    return AssetCheckResult(
        passed=not drifted,
        severity=AssetCheckSeverity.WARN,
        metadata={
            "columns_compared": sum(1 for _, c in expected if c is not None),
            "views_compared": sum(1 for _, c in expected if c is None),
            "drifted": ", ".join(drifted[:20]) if drifted else "none",
            "drifted_count": len(drifted),
            "remedy": (
                "Materialise the api_v1 asset. It re-applies every COMMENT and "
                "emits NOTIFY pgrst, 'reload schema' — no dbt build required, so "
                "it is far cheaper than transform_and_publish and is the whole "
                "of what an upgrade needs."
            ),
        },
    )


@asset_check(
    asset=api_v1_surface,
    name="descriptions_complete",
    description=(
        "Every column AND every view in api_v1.* carries a Postgres COMMENT. "
        "PostgREST sources the OpenAPI spec's descriptions from pg_description, "
        "so an undescribed column or view becomes an empty entry in the public "
        "API docs."
    ),
)
def api_v1_descriptions_complete():
    """
    The Dagster-side home of dbt's tests/api_v1_descriptions_complete.sql.

    That test existed for months and **never ran in a cluster**. First
    `dbt/tests/` was not copied into the image at all, so it was absent from the
    compiled manifest. Once that was fixed it was in the manifest but still
    unreachable: it has no `ref()`, so dbt infers no parent, so dagster-dbt makes
    no asset check from it — and the only things that invoke dbt are
    `transform_and_publish` (which excludes tests) and `transform_checks` (which
    selects asset checks). In the manifest and executed are two different things.

    As a check on `api_v1` it has an owner and a run: the asset whose surface it
    describes, in the job that verifies that surface after publishing.
    """
    import psycopg2

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to check the "
            "api_v1 surface."
        )

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select c.table_name, c.column_name
                from information_schema.columns c
                join pg_class pgc on pgc.relname = c.table_name
                join pg_namespace pgn
                  on pgn.oid = pgc.relnamespace and pgn.nspname = c.table_schema
                left join pg_description pgd
                  on pgd.objoid = pgc.oid and pgd.objsubid = c.ordinal_position
                where c.table_schema = 'api_v1'
                  and pgd.description is null
                order by c.table_name, c.ordinal_position
                """
            )
            undocumented = [f"{t}.{c}" for t, c in cur.fetchall()]
            cur.execute(
                "select count(*) from information_schema.columns "
                "where table_schema = 'api_v1'"
            )
            total_columns = cur.fetchone()[0]
            # The views themselves, for the same reason as above: PostgREST
            # renders obj_description as the OpenAPI tag description, and it was
            # outside every check until urb-agents #1273.
            cur.execute(
                """
                select pgc.relname
                from pg_class pgc
                join pg_namespace pgn on pgn.oid = pgc.relnamespace
                where pgn.nspname = 'api_v1' and pgc.relkind = 'v'
                  and obj_description(pgc.oid, 'pg_class') is null
                order by pgc.relname
                """
            )
            undocumented += [f"view {v}" for (v,) in cur.fetchall()]
            cur.execute(
                "select count(*) from pg_class pgc "
                "join pg_namespace pgn on pgn.oid = pgc.relnamespace "
                "where pgn.nspname = 'api_v1' and pgc.relkind = 'v'"
            )
            total_views = cur.fetchone()[0]

    return AssetCheckResult(
        passed=not undocumented,
        severity=AssetCheckSeverity.ERROR,
        metadata={
            "columns_checked": total_columns,
            "views_checked": total_views,
            "undocumented": ", ".join(undocumented) if undocumented else "none",
        },
    )


@asset_check(
    asset=api_v1_surface,
    name="embedding_fk_is_registered",
    description=(
        "The foreign key PostgREST derives resource embedding from is present. "
        "Without it ?select=...,meta_sources(...) returns PGRST200 and the "
        "schema map a consumer renders has no edges."
    ),
)
def api_v1_embedding_fk_is_registered():
    """
    🔴 THE CONSTRAINT IS DROPPED BY AN ORDINARY REBUILD, SO ITS PRESENCE IS A
    FACT TO CHECK AND NOT A FACT TO ASSUME.

    dbt's table materialization renames the old table aside and drops it
    `cascade`, which takes any FK pointing at it. `register_source_id_fk()` is
    a post-hook on BOTH sides for that reason — but a partial run
    (`dbt run --select mart_meta_sources`) rebuilds one side and not the other,
    so the constraint goes and nothing puts it back until the next full build.

    ⚠️ The failure is invisible from every other signal. Rows are correct, the
    endpoints answer 200, the transform is green; only an embedded select
    returns PGRST200, and only a consumer trying to use it finds out. That is
    the same shape as urb-agents #1271 — a change that reaches the public API
    through a path no gate watched.

    🔵 The macro also swallows two DDL failures by design (an orphan source_id,
    a non-unique target) so that a referential defect degrades embedding rather
    than killing the nightly transform. That deliberate softness is exactly why
    this check has to exist: a warning in a run log is not a signal anyone
    reads, and "the macro warned and continued" and "the macro never ran" look
    identical from outside.

    ERROR rather than WARN. Unlike the description drift, this has no healthy
    transient state: a full transform either leaves the FK registered or it has
    hit a defect worth stopping for.
    """
    import psycopg2

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to check the "
            "api_v1 surface."
        )

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select c.conname,
                       c.conrelid::regclass::text,
                       c.confrelid::regclass::text
                from pg_constraint c
                where c.contype = 'f'
                  and c.conrelid = to_regclass('marts.mart_indicator_summary')
                  and c.confrelid = to_regclass('marts.mart_meta_sources')
                """
            )
            fks = cur.fetchall()
            # The orphans that would have stopped it being registered, so the
            # check reports the cause rather than only the symptom.
            cur.execute(
                """
                select count(distinct s.source_id)
                from marts.mart_indicator_summary s
                left join marts.mart_meta_sources m on m.source_id = s.source_id
                where m.source_id is null
                """
            )
            orphans = cur.fetchone()[0]

    return AssetCheckResult(
        passed=bool(fks),
        severity=AssetCheckSeverity.ERROR,
        metadata={
            "constraint": fks[0][0] if fks else "MISSING",
            "orphan_source_ids": orphans,
            "remedy": (
                "If orphan_source_ids is 0, the constraint was dropped by a "
                "partial rebuild — run transform_and_publish, or materialise "
                "mart_indicator_summary, and register_source_id_fk() puts it "
                "back. If it is not 0, those source_ids are in "
                "indicator_summary and not in meta_sources; fix that first, "
                "because the constraint cannot be created while they exist."
            ),
        },
    )


# The PostgREST anonymous role, by UIS convention `<app>_web_anon`. Overridable
# because the convention is the platform's, not Atlas's, and a rename should not
# require an Atlas rebuild.
ANON_ROLE_ENV = "ATLAS_POSTGREST_ANON_ROLE"
DEFAULT_ANON_ROLE = "atlas_web_anon"


@asset_check(
    asset=api_v1_surface,
    name="public_role_reaches_only_api_v1",
    description=(
        "The PostgREST anonymous role can read every api_v1 view and nothing "
        "else. Audits the actual grants rather than assuming them."
    ),
)
def api_v1_public_role_scope():
    """
    Makes Phase 4.2 of the asgard deployment plan runnable instead of manual.

    That gate requires the anonymous role be "read-only on api_v1 only —
    **audited, not assumed**", before a public hostname exists. This is that
    audit, owned by the asset that publishes the surface.

    Two failure directions, and both matter:

    - **Over-exposure**: the role can read something outside api_v1. PostgREST
      reaches other schemas via the `Accept-Profile` header, so a stray grant on
      `marts` or `raw` is not theoretical — it is an unauthenticated read of
      Atlas's internals. `private_raw` would be worse.
    - **Under-exposure**: the role can read none of api_v1, so the public API
      serves nothing. This has a real cause: `dbt run` drops the api_v1 views by
      CASCADE, and it is the re-apply that re-grants them.

    Checks relation-level SELECT, not schema USAGE. Postgres grants USAGE on
    `public` to everyone by default, so a schema-level test reports a false
    positive on every database in existence.

    Passes when the role does not exist, which is normal local dev — PostgREST is
    a platform component and nobody configures it to run dbt. A check that fails
    on every contributor's laptop is one they learn to ignore, and this one needs
    to be believed the day it fires.
    """
    import psycopg2

    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to audit the "
            "api_v1 grants."
        )
    role = os.getenv(ANON_ROLE_ENV, DEFAULT_ANON_ROLE)

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from pg_roles where rolname = %s", (role,))
            if cur.fetchone() is None:
                return AssetCheckResult(
                    passed=True,
                    severity=AssetCheckSeverity.WARN,
                    metadata={
                        "anon_role": role,
                        "status": (
                            "role does not exist — PostgREST is not configured "
                            "against this database (expected in local dev)"
                        ),
                    },
                )

            cur.execute(
                """
                select count(*) from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'api_v1'
                  and has_table_privilege(%s, c.oid, 'SELECT')
                """,
                (role,),
            )
            readable_in_api_v1 = cur.fetchone()[0]

            cur.execute(
                """
                select n.nspname || '.' || c.relname
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where c.relkind in ('r', 'v', 'm', 'p', 'f')
                  and n.nspname not in ('pg_catalog', 'information_schema', 'api_v1')
                  and has_table_privilege(%s, c.oid, 'SELECT')
                order by 1
                """,
                (role,),
            )
            leaked = [r[0] for r in cur.fetchall()]

    problems = []
    if leaked:
        problems.append(f"readable outside api_v1: {', '.join(leaked)}")
    if readable_in_api_v1 == 0:
        problems.append("no api_v1 relation is readable — the API would serve nothing")

    return AssetCheckResult(
        passed=not problems,
        severity=AssetCheckSeverity.ERROR,
        metadata={
            "anon_role": role,
            "readable_in_api_v1": readable_in_api_v1,
            "readable_outside_api_v1": ", ".join(leaked) if leaked else "none",
            "problems": "; ".join(problems) if problems else "none",
        },
    )
