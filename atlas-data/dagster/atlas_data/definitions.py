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

from dagster import Definitions

from atlas_data.assets import api_v1, raw_fhi, raw_other, raw_ssb
from atlas_data.assets._factory import pipes_subprocess_client
from atlas_data.assets.dbt import atlas_dbt_models, dbt_cli_resource

defs = Definitions(
    assets=[
        # raw.* — one asset per ingest source, via Dagster Pipes.
        *raw_ssb.assets,
        *raw_fhi.assets,
        *raw_other.assets,
        # marts.* — the dbt project, with the ingest assets as real upstreams.
        atlas_dbt_models,
        # api_v1.* — the public PostgREST surface. Terminal asset.
        api_v1.api_v1_surface,
    ],
    resources={
        "pipes_subprocess_client": pipes_subprocess_client(),
        "dbt": dbt_cli_resource(),
    },
)
