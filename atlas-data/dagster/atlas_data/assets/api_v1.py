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

from dagster import AssetExecutionContext, AssetKey, MaterializeResult, asset

from atlas_data.assets.dbt import DBT_MANIFEST_PATH, DBT_PROJECT_DIR

API_V1_SQL_PATH = DBT_PROJECT_DIR / "api_v1_generated.sql"


def _api_model_asset_keys() -> list[AssetKey]:
    """
    The marts this surface wraps, read from the baked dbt manifest.

    Derived rather than hardcoded: the api surface has already grown from 9
    wrappers to 13, and a hand-maintained list here would be one more thing to
    forget when the 14th lands.
    """
    if not DBT_MANIFEST_PATH.exists():
        return []
    manifest = json.loads(DBT_MANIFEST_PATH.read_text())
    keys: list[AssetKey] = []
    for node in manifest.get("nodes", {}).values():
        if node.get("resource_type") != "model":
            continue
        path = node.get("original_file_path", "").replace("\\", "/")
        if path.startswith("models/marts/api/"):
            keys.append(AssetKey([node["name"]]))
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
