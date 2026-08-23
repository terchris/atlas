"""
dbt half of the Atlas asset graph.

The ingest assets in raw_ssb / raw_fhi / raw_other land data in `raw.*`. This
module loads Atlas's dbt project on top of them, so the graph runs
`raw.* → marts.* → api_v1.*` in one lineage rather than "Dagster orchestrates
ingest, a human remembers to run dbt".

Three things here are deliberate:

1. **The manifest is read, never generated.** `dbt parse` runs at image build
   time (see atlas-data/deploy/Dockerfile) and the manifest ships inside the
   image. Parsing dbt in a run pod would pay the cost on every materialisation,
   which is exactly what definitions.py's cheap-import discipline forbids.
   dagster-dbt's manifest *load* is the one expensive import the architecture
   accepts, and only because it is precomputed.

2. **dbt sources are mapped onto the ingest asset keys** where a producer
   exists, so the ingest asset is a real upstream dependency instead of two
   disconnected graphs. Most map by default (dbt source `raw.ssb_08764` →
   `raw/ssb_08764` → the existing @asset); the exceptions are listed in
   _SOURCE_KEY_OVERRIDES below.

3. **`private`-tagged models are excluded by default.** They read
   private_raw.frr_resources, which is empty on any public deployment (see
   dbt/models/private_marts/sources.yml). They materialise as empty tables by
   contract, and they should not be sitting in a shared cluster's asset list
   inviting a click. Set ATLAS_DAGSTER_INCLUDE_PRIVATE=1 for local work.
"""

import os
import sys
from pathlib import Path

from dagster import AssetExecutionContext, AssetKey, asset
from dagster_dbt import (
    DagsterDbtTranslator,
    DagsterDbtTranslatorSettings,
    DbtCliResource,
    dbt_assets,
)

# Path resolution only — no I/O at module scope beyond the manifest load that
# dagster-dbt requires. Mirrors _factory.py's up-4 walk so one code path serves
# both the local checkout and /app inside the polyglot image.
#   local: <repo>/atlas-data/dagster/atlas_data/assets/dbt.py → up 4 → atlas-data
#   image: /app/dagster/atlas_data/assets/dbt.py              → up 4 → /app
_HERE = Path(__file__).resolve()
_ATLAS_DATA_DIR = _HERE.parent.parent.parent.parent
DBT_PROJECT_DIR = (_ATLAS_DATA_DIR / "dbt").resolve()
DBT_MANIFEST_PATH = DBT_PROJECT_DIR / "target" / "manifest.json"

# dbt sources whose producing ingest asset has a different key than the
# dagster-dbt default (`<source_name>/<table_name>`).
#
# Anything NOT listed here and NOT matching an ingest asset stays an external
# asset with no upstream, which is honest: raw.ingest_runs and raw.sitemap_log
# are written by the ingest library itself rather than by any one source, and
# raw.brreg_enheter comes from `npm run refresh:brreg-enheter`, which is not a
# Dagster asset (yet).
#
# ⚠️ raw.redcross_branch_activities is NOT mapped here even though the
# redcross-branches ingest does write it. Dagster requires one dbt resource per
# asset key, so pointing both of that run's tables at raw/redcross_branches is
# rejected outright. Modelling it truthfully means turning that ingest into a
# multi_asset AND having the TypeScript side report a materialisation per table
# rather than per run — a change to the Pipes contract in
# ingest/src/lib/ingest_run.ts, not a mapping tweak. Left as a follow-up; the
# activities table therefore shows as an unproduced source, same as the three
# above.
_SOURCE_KEY_OVERRIDES: dict[tuple[str, str], AssetKey] = {
    # The frr ingest writes private_raw.frr_resources; its asset is raw/frr.
    # 1:1, so this one is safe to collapse.
    ("private_raw", "frr_resources"): AssetKey(["raw", "frr"]),
}


# enable_asset_checks: surface dbt tests as Dagster asset checks rather than
# untyped observations. Without it dbt's indirect selection still RUNS the
# tests but Dagster logs each one as an AssetObservation with a warning, so a
# failing test is buried in logs instead of marking the asset unhealthy. Atlas's
# dbt tests are the in-pipeline data-quality gate (conformance C11 tier 3), so
# they need to be visible as checks.
_TRANSLATOR_SETTINGS = DagsterDbtTranslatorSettings(enable_asset_checks=True)


class AtlasDbtTranslator(DagsterDbtTranslator):
    """Maps dbt source nodes onto the ingest assets that actually produce them."""

    def get_asset_key(self, dbt_resource_props: dict) -> AssetKey:
        if dbt_resource_props.get("resource_type") == "source":
            override = _SOURCE_KEY_OVERRIDES.get(
                (dbt_resource_props["source_name"], dbt_resource_props["name"])
            )
            if override is not None:
                return override
        return super().get_asset_key(dbt_resource_props)


def _include_private() -> bool:
    """os.getenv with a default — never os.environ[...] (definitions.py rules)."""
    return os.getenv("ATLAS_DAGSTER_INCLUDE_PRIVATE", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


# Excluding by tag rather than by path so a new private model is covered the
# moment it is tagged, without anyone remembering to edit this file.
DBT_EXCLUDE = None if _include_private() else "tag:private"


def _require_manifest() -> Path:
    """
    Fail loudly and actionably if the manifest is missing.

    Deliberately NOT a silent skip. A code location that quietly drops its dbt
    half would still show 41 healthy raw assets — it would look like a pass
    while half the pipeline had vanished. Better to refuse to load.
    """
    if not DBT_MANIFEST_PATH.exists():
        raise FileNotFoundError(
            f"dbt manifest not found at {DBT_MANIFEST_PATH}. In the polyglot "
            f"image this is baked at build time; locally, run:\n"
            f"  cd {DBT_PROJECT_DIR} && uv run --env-file ../ingest/.env dbt parse"
        )
    return DBT_MANIFEST_PATH


@dbt_assets(
    manifest=_require_manifest(),
    dagster_dbt_translator=AtlasDbtTranslator(settings=_TRANSLATOR_SETTINGS),
    exclude=DBT_EXCLUDE,
)
def atlas_dbt_models(context: AssetExecutionContext, dbt: DbtCliResource):
    """Every dbt model in the Atlas project, as Dagster assets."""
    yield from dbt.cli(["build"], context=context).stream()


def dbt_cli_resource() -> DbtCliResource:
    """
    Single shared dbt CLI resource. Constructed lazily by definitions.py.

    The dbt executable is resolved next to the running interpreter rather than
    left to PATH. In the polyglot image both live in the same prefix, so this is
    a no-op; locally it means `python -m ...` against the venv works without the
    venv being activated, instead of failing construction with "The dbt
    executable 'dbt' does not exist".
    """
    candidate = Path(sys.executable).parent / "dbt"
    kwargs = {"project_dir": str(DBT_PROJECT_DIR)}
    if candidate.exists():
        kwargs["dbt_executable"] = str(candidate)
    return DbtCliResource(**kwargs)
