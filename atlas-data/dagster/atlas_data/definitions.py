"""
Dagster code-location entrypoint for Atlas.

CRITICAL DISCIPLINE — keep this module cheap to import.

Every Dagster run pod cold-starts by importing this module to find the asset
it was asked to materialise. Anything you do at module scope (DB connections,
file I/O, eager catalog loads, heavy framework initialisation) pays its full
cost on EVERY materialisation. The dev.to scaling analysis cited in the UIS
Dagster INVESTIGATE flags this as the most common cause of slow Dagster pods.

Rules:
- No DB connections at module scope. Open them inside @asset function bodies.
- No expensive file I/O at module scope (no eager manifest loads, no fetching
  credentials from secret managers eagerly, no parsing big JSON files).
- No environment-variable lookups that fail loudly. Use os.getenv(..., default)
  not os.environ[...].
- dagster-dbt's manifest parsing is the one expensive thing we accept — Dagster
  needs it to expose dbt models as assets at all. It is precomputed: `dbt parse`
  runs at image build time and the manifest ships inside the image, so a run pod
  loads it rather than generating it. See assets/dbt.py.

Cross-references:
- urbalurba-infrastructure/.../INVESTIGATE-dagster.md (the authoritative source
  on how Dagster runs in UIS, what the two-pod model means, and why this
  discipline matters)
- website/docs/ai-developer/plans/completed/PLAN-dagster-codelocation-image.md
  (the original Atlas-side implementation; this file extends it to all sources)
"""

import os

from dagster import Definitions, load_asset_checks_from_modules

from atlas_data.assets import (
    api_v1,
    validation,
    migrations,
    raw_brreg,
    raw_fhi,
    raw_other,
    raw_seeds,
    raw_ssb,
)
from atlas_data.assets._factory import pipes_subprocess_client
from atlas_data.assets.dbt import atlas_dbt_models, dbt_cli_resource
from atlas_data.automation import automation_sensors
from atlas_data.schedules import _ingest_executor, jobs, schedules, sensors

# Surfaced in the Dagster UI on the code location, so "which commit is asgard
# actually running?" is a question the orchestrator answers rather than one
# someone answers from a tag they typed. See the Dockerfile's provenance block.
_GIT_SHA = os.getenv("ATLAS_GIT_SHA", "unknown")

defs = Definitions(
    metadata={"atlas_git_sha": _GIT_SHA},
    assets=[
        # raw.* schema DDL — the root of the graph.
        migrations.raw_migrations,
        # raw.* — one asset per ingest source, via Dagster Pipes.
        *raw_ssb.assets,
        *raw_fhi.assets,
        *raw_other.assets,
        *raw_seeds.assets,
        # raw.brreg_enheter_snapshot — the full register. No automation
        # condition by design; see assets/raw_brreg.py.
        *raw_brreg.assets,
        # marts.* — the dbt project, with the ingest assets as real upstreams.
        atlas_dbt_models,
        # api_v1.* — the public PostgREST surface. Terminal asset.
        api_v1.api_v1_surface,
    ],
    # 🔴 ENUMERATED FROM THE MODULE, NOT LISTED BY HAND — and the hand-written
    # list is why.
    #
    # This used to name three checks explicitly. On 2026-09-13 a fourth,
    # `api_v1_descriptions_match_the_running_build`, was added to assets/api_v1.py
    # and NOT added here, so it was defined, imported, decorated — and never ran.
    # Nothing failed. `dagster definitions validate` passes, the module imports,
    # the check simply does not exist as far as any run is concerned.
    #
    # ⚠️ That is the second time this exact thing has happened in this file's
    # neighbourhood. `api_v1_descriptions_complete` carries a docstring about the
    # first: a dbt test that "existed for months and never ran in a cluster …
    # in the manifest and executed are two different things." The new check was
    # written directly above that paragraph and repeated it.
    #
    # 🔵 A guard would have to be maintained and, with no dagster test suite in
    # CI, would not run. Enumerating removes the class of error instead: a check
    # decorated in assets/api_v1.py is registered by existing.
    # ⚠️ validation's two checks are attached to api_v1_surface but are NOT part
    # of the publish gate — they leave the process and dereference external URLs,
    # so they run daily after ingest rather than after every publish. The
    # exclusion is in schedules.py where _API_V1_CHECKS is built.
    asset_checks=load_asset_checks_from_modules([api_v1, validation]),
    jobs=jobs,
    # Cadence comes from each source's declared periodicity — see schedules.py.
    # They ship stopped; turning them on is a go-live decision.
    schedules=schedules,
    # Chains the checks after the transform build — see schedules.py.
    sensors=[*sensors, *automation_sensors],
    # Declarative automation launches runs that belong to no job, so a
    # job-level executor cannot bound them. Setting it here keeps the
    # ATLAS_MAX_CONCURRENT_INGESTS bound the tester verified in round 4 —
    # without this, migrating to automation would have quietly discarded it and
    # let 38 assets open as many concurrent writers as the pod has CPUs.
    executor=_ingest_executor(),
    resources={
        "pipes_subprocess_client": pipes_subprocess_client(),
        "dbt": dbt_cli_resource(),
    },
)
