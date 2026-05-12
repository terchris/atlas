"""
Dagster `@asset` wrappers for SSB ingest sources.

Each asset invokes the existing TypeScript ingest as a subprocess via Dagster
Pipes. The TS side calls `openDagsterPipes()` + `reportAssetMaterialization`
(no-ops when env vars are absent, so `npm run ingest:*` still works locally).

Pattern is the same for every source — copy the `raw_ssb_08764` body and
change the script name. Future PLAN rolls out the remaining ~40 sources.
"""

from __future__ import annotations

import os
from pathlib import Path

from dagster import (
    MaterializeResult,
    PipesSubprocessClient,
    asset,
)


# Resolve the in-repo ingest directory once at import time. This *is* an
# import-time file system op, but it's just resolving a path, no I/O — keeps
# us within the cheap-to-import discipline.
#
# Resolution: assets/raw_ssb.py → assets/ → atlas_data/ → dagster/ → atlas-data/
# then into ingest/. In the polyglot Docker image, this same relative
# resolution lands at /app/ingest. Same code, both environments.
_HERE = Path(__file__).resolve()
_INGEST_DIR = (_HERE.parent.parent.parent.parent / "ingest").resolve()


def pipes_subprocess_client() -> PipesSubprocessClient:
    """Single shared resource for all subprocess-Pipes assets in this module."""
    return PipesSubprocessClient()


@asset(
    key=["raw", "ssb_08764"],
    group_name="raw_ssb",
    description=(
        "Personer under 18 år i husholdninger med lavinntekt (EU- og OECD-skala). "
        "Source: SSB table 08764. Ingested by atlas-data/ingest/src/sources/ssb-08764."
    ),
)
def raw_ssb_08764(
    context,
    pipes_subprocess_client: PipesSubprocessClient,
) -> MaterializeResult:
    """
    Materialises `raw.ssb_08764` by shelling out to `npm run ingest:ssb-08764`.

    The TypeScript ingest calls `reportAssetMaterialization()` via Pipes; the
    subprocess client reads the structured event and returns it as the result.
    """
    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set for the ingest "
            "subprocess to reach Postgres. For local dev, source "
            "atlas-data/ingest/.env or pass --env-file."
        )

    return pipes_subprocess_client.run(
        command=["npm", "run", "ingest:ssb-08764"],
        context=context,
        cwd=str(_INGEST_DIR),
        env={"DATABASE_URL": database_url},
    ).get_materialize_result()
