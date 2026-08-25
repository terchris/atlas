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
    name="descriptions_complete",
    description=(
        "Every column in api_v1.* carries a Postgres COMMENT. PostgREST sources "
        "the OpenAPI spec's column descriptions from pg_description, so an "
        "undescribed column becomes an empty entry in the public API docs."
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

    return AssetCheckResult(
        passed=not undocumented,
        severity=AssetCheckSeverity.ERROR,
        metadata={
            "columns_checked": total_columns,
            "undocumented": ", ".join(undocumented) if undocumented else "none",
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
