"""
`raw.*` schema migrations, as the root of the asset graph.

The 49 numbered SQL files in atlas-data/migrations/ create the `raw.*` and
`private_raw.*` tables every ingest writes into. Nothing in Dagster used to run
them: the graph started at the ingests and simply assumed the tables existed.
The imac tester hit that in round 2 — the first ingest attempt in a fresh cluster
died on `relation "raw.ingest_runs" does not exist` — and asked, fairly, who runs
`migrate` and when.

Making it an asset is the answer. It puts the dependency in the graph instead of
in a runbook step someone has to remember, and it means "can this pipeline build
a database from nothing?" is a question the graph can answer.

Every raw ingest asset declares this as an upstream (see _factory.py). That is
lineage, not automatic execution: materialising a single `raw/*` asset will not
silently run migrations behind your back. The scheduled jobs include it, so a
scheduled refresh is self-sufficient.

The runner is idempotent — it tracks applied files in `schema_migrations` and
skips them — so re-running is cheap and safe.
"""

import os

from atlas_data.paths import ingest_dir
from dagster import AssetExecutionContext, MaterializeResult, PipesSubprocessClient, asset

MIGRATIONS_ASSET_KEY = ["raw", "_migrations"]


@asset(
    name="_migrations",
    key_prefix=["raw"],
    group_name="raw_infrastructure",
    description=(
        "Applies atlas-data/migrations/*.sql via `npm run migrate`, creating the "
        "raw.* and private_raw.* tables every ingest writes into. Idempotent — "
        "already-applied files are skipped. Upstream of every raw ingest asset."
    ),
)
def raw_migrations(
    context: AssetExecutionContext,
    pipes_subprocess_client: PipesSubprocessClient,
) -> MaterializeResult:
    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set to apply migrations. "
            "For local dev, source atlas-data/ingest/.env."
        )
    # `npm run migrate` does not use the Pipes wrapper (it is not an ingest
    # source), so there is no materialisation event coming back from the
    # subprocess — a clean exit is the signal.
    pipes_subprocess_client.run(
        command=["npm", "run", "migrate"],
        context=context,
        cwd=str(ingest_dir()),
        env={"DATABASE_URL": database_url},
    )
    return MaterializeResult(metadata={"runner": "npm run migrate"})
