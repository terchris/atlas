"""
`raw.*` schema migrations, as the root of the asset graph.

The 51 numbered SQL files in atlas-data/migrations/ create the `raw.*` and
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

⚠️ **The runner does NOT track applied files.** This docstring claimed it kept a
`schema_migrations` table and skipped what was already applied. It does not, and
never has — `scripts/migrate.ts` says so in its own header: *"this runner does
not track state (no `schema_migrations` table). Re-running applies every file
again."* Every materialisation re-applies all 51 files.

That is safe, but it is safe for a different reason than the one this file used
to give: the files are individually idempotent, and (since `051`) the set
converges on the first run. Corrected 2026-09-09 — the false claim had already
propagated into a platform design question about who owns migrations once UIS
installs atlas from the catalogue (urb-agents #362).
"""

import os

from atlas_data.paths import ingest_dir
from dagster import (
    AssetExecutionContext,
    AutomationCondition,
    MaterializeResult,
    PipesSubprocessClient,
    asset,
)

MIGRATIONS_ASSET_KEY = ["raw", "_migrations"]


@asset(
    name="_migrations",
    key_prefix=["raw"],
    group_name="raw_infrastructure",
    # ⚠️ This condition is load-bearing, and its absence is the trap the
    # declarative-automation pilot found.
    #
    # `AutomationCondition.on_cron` expands to "cron tick passed AND all deps
    # updated since that tick". Every ingest asset depends on this one. If this
    # asset has no condition of its own it is never updated by the daemon, so
    # that dep clause can never be satisfied and **all 40 automated sources
    # silently never run** — no failed run, no error, just nothing.
    #
    # `any_downstream_conditions` is the answer: migrations materialise whenever
    # any downstream asset is about to, whatever that downstream's cadence.
    # One upstream serving weekly, monthly and scraper cadences without
    # enumerating any of them.
    automation_condition=AutomationCondition.any_downstream_conditions(),
    description=(
        "Applies atlas-data/migrations/*.sql via `npm run migrate`, creating the "
        "raw.* and private_raw.* tables every ingest writes into. The runner "
        "keeps no bookkeeping table: every run re-applies all 51 files. That is "
        "safe because each file is idempotent and the set converges on the first "
        "run. Upstream of every raw ingest asset."
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
