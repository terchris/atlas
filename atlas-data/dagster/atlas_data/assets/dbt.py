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

from atlas_data.db import libpq_env_from_url
from atlas_data.paths import dbt_project_dir
from dagster import AssetExecutionContext, AssetKey, asset
from dagster_dbt import (
    DagsterDbtTranslator,
    DagsterDbtTranslatorSettings,
    DbtCliResource,
    dbt_assets,
)

# Resolved via atlas_data.paths, NOT by counting parents up from __file__.
# The image pip-installs this package into site-packages while the dbt project
# lives at /app/dbt; the old positional walk resolved to
# /usr/local/lib/python3.11/dbt and crash-looped the code-location pod. See
# paths.py.
DBT_PROJECT_DIR = dbt_project_dir()
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


def dbt_translator() -> AtlasDbtTranslator:
    """
    The single translator instance shared by @dbt_assets and anything that needs
    to derive a dbt asset key (see assets/api_v1.py). Deriving keys any other
    way drifts the moment a model's schema config changes.
    """
    return AtlasDbtTranslator(settings=_TRANSLATOR_SETTINGS)


# Both api_v1 singular tests have been retired from dbt and re-homed as Python
# asset checks on the api_v1 asset (see assets/api_v1.py). They could not work
# as dbt tests: neither uses ref(), so dbt inferred no parent, so dagster-dbt
# built no asset check — and nothing in the pipeline invokes bare `dbt test`.
# One of them additionally ran BEFORE the views it inspected existed, because
# dbt scheduled it early while the same build was dropping them via CASCADE.
#
# Nothing to exclude here any more; the list is kept empty and named so the
# next person to add a singular test finds this explanation.
_MISORDERED_TESTS: list[str] = []


def _dbt_command_for(context: AssetExecutionContext) -> list:
    """
    Pick the dbt verb from what Dagster actually selected.

    Excluding checks from a job's *selection* is not enough on its own: a
    hardcoded `dbt build` would still run all 784 tests inside the step and
    report them as untyped observations — the behaviour we left behind in round
    2. The split has to happen in the dbt command as well as the selection.

    - assets only  → `build --exclude-resource-type test`
    - checks only  → `test`
    - both         → `build` (materialising everything locally, one invocation)

    ⚠️ The assets-only case is `build --exclude-resource-type test`, NOT `run`.
    `dbt run` builds models and skips **seeds**, and Atlas has 16 seed assets
    (ref_*, dim_postnummer, the sources manifest) that models join against. On a
    fresh database — exactly the state the integration tester starts from — `run`
    would leave those tables missing and the models that reference them would
    fail. `build` minus tests keeps seeds and snapshots while dropping the 644
    test events that made the plan unstartable.
    """
    has_assets = bool(context.selected_asset_keys)
    has_checks = bool(context.selected_asset_check_keys)
    if has_checks and not has_assets:
        return ["test"]
    if has_assets and not has_checks:
        return ["build", "--exclude-resource-type", "test"]
    return ["build"]


@dbt_assets(
    manifest=_require_manifest(),
    dagster_dbt_translator=dbt_translator(),
    exclude=DBT_EXCLUDE,
)
def atlas_dbt_models(context: AssetExecutionContext, dbt: DbtCliResource):
    """Every dbt model in the Atlas project, as Dagster assets."""
    # dbt's profiles.yml reads five libpq env vars, which locally come from
    # ingest/.env. In a run pod nothing sets them and dbt fails at PARSE time
    # with "Env var required but not provided: 'PGHOST'" — test round 3,
    # criteria 10-12. The platform supplies one secret, ATLAS_DATABASE_URL, so
    # derive the five from it here rather than asking for five more secrets.
    #
    # os.environ rather than a per-call env argument: DbtCliResource has no env
    # parameter, and the dbt subprocess inherits this process's environment.
    # Safe here — a run pod executes one step per process.
    database_url = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get(
        "DATABASE_URL"
    )
    if not database_url:
        raise RuntimeError(
            "ATLAS_DATABASE_URL (or DATABASE_URL) must be set for dbt to reach "
            "Postgres. For local dev, source atlas-data/ingest/.env."
        )
    os.environ.update(libpq_env_from_url(database_url))

    args = list(_dbt_command_for(context))
    context.log.info(f"dbt args for this selection: {' '.join(args)}")
    if "--exclude-resource-type" not in args:
        # Only meaningful when tests are actually being run.
        for test in _MISORDERED_TESTS:
            args += ["--exclude", test]
    yield from dbt.cli(args, context=context).stream()


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
