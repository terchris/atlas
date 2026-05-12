"""
Asset factory for ingest-source `@asset`s.

Every Atlas ingest source has the same Dagster shape: invoke
`npm run ingest:<source_id>` as a subprocess via PipesSubprocessClient.
Rather than hand-write 40 near-identical @asset functions, this factory
turns a source-id string into an asset.

Asset key convention: `["raw", source_id_with_underscores]`. For most
sources this also matches the underlying raw.* table name; for sources
that write multiple raw.* tables (e.g. redcross-branches writes both
raw.redcross_branches and raw.redcross_branch_activities), the asset
key represents the *ingest run* rather than a single table.

The Pipes wiring is centralised inside the TypeScript side (see
atlas-data/ingest/src/lib/ingest_run.ts) — every source already calls
recordIngestRun(), which opens Pipes + emits a materialisation event
on success. So the Python side here just needs to launch the subprocess
and surface the result.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from dagster import (
    AssetsDefinition,
    MaterializeResult,
    PipesSubprocessClient,
    asset,
)

# Resolve the ingest directory once at import time. Path resolution only —
# no file system reads — so this stays within the cheap-import discipline.
#
# Locally: <repo>/atlas-data/dagster/atlas_data/assets/_factory.py
#          → up 4 → <repo>/atlas-data → /ingest
# In the polyglot image: /app/dagster/atlas_data/assets/_factory.py
#                        → up 4 → /app → /ingest
# Same code, both layouts.
_HERE = Path(__file__).resolve()
_INGEST_DIR = (_HERE.parent.parent.parent.parent / "ingest").resolve()


def make_raw_ingest_asset(
    source_id: str,
    *,
    group_name: str,
    description: str | None = None,
) -> AssetsDefinition:
    """
    Build a Dagster @asset that materialises `raw.<source_id>` by shelling
    out to `npm run ingest:<source_id>`. The TypeScript side calls
    reportAssetMaterialization via the centralised Pipes wrapper in
    lib/ingest_run.ts; we just need to launch the subprocess.
    """
    asset_name = source_id.replace("-", "_")
    auto_description = (
        f"Atlas ingest source `{source_id}`. Materialised by shelling out to "
        f"`npm run ingest:{source_id}` via Dagster Pipes."
    )

    @asset(
        name=asset_name,
        key_prefix=["raw"],
        group_name=group_name,
        description=description or auto_description,
    )
    def _ingest_asset(
        context,
        pipes_subprocess_client: PipesSubprocessClient,
    ) -> MaterializeResult:
        database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
            "DATABASE_URL"
        )
        if not database_url:
            raise RuntimeError(
                f"ATLAS_DATABASE_URL (or DATABASE_URL) must be set for "
                f"`npm run ingest:{source_id}` to reach Postgres. For local "
                f"dev, source atlas-data/ingest/.env."
            )
        return pipes_subprocess_client.run(
            command=["npm", "run", f"ingest:{source_id}"],
            context=context,
            cwd=str(_INGEST_DIR),
            env={"DATABASE_URL": database_url},
        ).get_materialize_result()

    return _ingest_asset


def make_raw_ingest_assets(
    source_ids: Iterable[str],
    *,
    group_name: str,
) -> list[AssetsDefinition]:
    """Bulk-version of make_raw_ingest_asset for a list of source ids."""
    return [make_raw_ingest_asset(sid, group_name=group_name) for sid in source_ids]


def pipes_subprocess_client() -> PipesSubprocessClient:
    """Single shared resource for every subprocess-Pipes asset in this package."""
    return PipesSubprocessClient()
