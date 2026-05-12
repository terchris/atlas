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
- dagster-dbt's manifest parsing is the one expensive thing we accept later —
  Dagster needs it to expose dbt models as assets at all. It's not present yet.

Cross-references:
- urbalurba-infrastructure/.../INVESTIGATE-dagster.md (the authoritative source
  on how Dagster runs in UIS, what the two-pod model means, and why this
  discipline matters)
- website/docs/ai-developer/plans/active/PLAN-dagster-codelocation-image.md
  (the Atlas-side implementation plan; mirrors UIS PLAN-002)
"""

from dagster import Definitions

from atlas_data.assets import raw_ssb

defs = Definitions(
    assets=[raw_ssb.raw_ssb_08764],
    resources={
        "pipes_subprocess_client": raw_ssb.pipes_subprocess_client(),
    },
)
