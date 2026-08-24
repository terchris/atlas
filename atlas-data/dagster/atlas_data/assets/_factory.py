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

from atlas_data.assets.migrations import MIGRATIONS_ASSET_KEY
from atlas_data.paths import ingest_dir
from dagster import (
    AssetKey,
    AutomationCondition,
    FreshnessPolicy,
    AssetsDefinition,
    MaterializeResult,
    PipesSubprocessClient,
    asset,
)

# Resolved via atlas_data.paths, NOT by counting parents up from __file__.
# The image pip-installs this package into site-packages while the ingest lives
# at /app/ingest, so a positional walk lands in the wrong tree entirely — see
# paths.py for the full story and the CrashLoopBackOff it caused.
_INGEST_DIR = ingest_dir()


def make_raw_ingest_asset(
    source_id: str,
    *,
    group_name: str,
    description: str | None = None,
    automation_condition: "AutomationCondition | None" = None,
    freshness_policy: "FreshnessPolicy | None" = None,
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
        # Pilot (2026-08-24): when set, the asset declares its own cadence and
        # the daemon decides when to run it — no job, no schedule, nothing to
        # edit when a source is added. None keeps the existing cron behaviour.
        # See assets/raw_ssb.py and PLAN-declarative-automation-pilot.
        automation_condition=automation_condition,
        # Declares what "fresh" MEANS for this source, so staleness is a
        # monitored property rather than something a human notices. Needs no
        # sensor — the daemon evaluates policies directly.
        freshness_policy=freshness_policy,
        # The raw.* tables this writes into are created by the migrations asset.
        # Declared as lineage so the graph shows why an ingest into a fresh
        # database fails; it does not make a single-asset materialisation run
        # migrations behind your back.
        deps=[AssetKey(MIGRATIONS_ASSET_KEY)],
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
    automation_condition: "AutomationCondition | None" = None,
    freshness_policy: "FreshnessPolicy | None" = None,
) -> list[AssetsDefinition]:
    """Bulk-version of make_raw_ingest_asset for a list of source ids."""
    return [
        make_raw_ingest_asset(
            sid,
            group_name=group_name,
            automation_condition=automation_condition,
            freshness_policy=freshness_policy,
        )
        for sid in source_ids
    ]


def pipes_subprocess_client() -> PipesSubprocessClient:
    """Single shared resource for every subprocess-Pipes asset in this package."""
    return PipesSubprocessClient()
