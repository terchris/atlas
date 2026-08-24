"""
Declarative automation — notes on how it is wired, now that the migration is done.

The pilot (PLAN-declarative-automation-pilot) needed an explicit
`AutomationConditionSensorDefinition` scoped to two assets, so it could evaluate
that slice without touching the rest of the graph.

**That scoped sensor is gone.** Now that every ingest asset carries a condition,
Dagster supplies `default_automation_condition_sensor` automatically, covering
every asset that has one. A second, narrower sensor over the same assets would
be two things deciding when Klass runs.

Verified: the default sensor ships **STOPPED**, like every other automation in
this code location. Nothing starts itself on deploy; enabling it is a
deliberate act.

Cadence and freshness live in `atlas_data/cadence.py`, declared on the assets
themselves. There is nothing left in this module but this explanation, and it is
kept because "why is there no automation sensor here?" is a reasonable question
to have answered.
"""

automation_sensors: list = []
