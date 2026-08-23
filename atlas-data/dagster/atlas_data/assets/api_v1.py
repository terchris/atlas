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
