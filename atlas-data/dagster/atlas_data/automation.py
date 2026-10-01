"""
Declarative automation — notes on how it is wired, now that the migration is done.

The pilot (PLAN-declarative-automation-pilot) needed an explicit
`AutomationConditionSensorDefinition` scoped to two assets, so it could evaluate
that slice without touching the rest of the graph.

**That scoped sensor is gone.** Now that every ingest asset carries a condition,
one explicit sensor covers the whole graph — see below. A second, narrower
sensor over the same assets would be two things deciding when Klass runs.

🔴 UNTIL 2026-10-01 THIS RELIED ON DAGSTER'S IMPLICIT `default_automation_condition_sensor`,
which Dagster supplies automatically when no user-defined automation sensor
exists. That sensor **ships STOPPED, like every other automation in this code
location** — confirmed live after the night's cluster reset: three ingest jobs
(`brreg_bootstrap`, `annual_sources_refresh`, `brreg_change_feed`) needed a
human to notice and trigger them, because nothing fires on its own until
someone turns the sensor on by hand in the UI. Terje's standing requirement
(urb-agents #1793): *"when someone installs it they should never need to
manually start something. It should just ingest the data fully
automatically."* That is the opposite of "enabling it is a deliberate act" —
a deliberate, explicit reversal, not an oversight, so it is recorded as one.

⚠️ THE TRADE THIS GIVES UP: the implicit sensor's STOPPED default existed on
purpose — so a fresh or local instance of this code location does not
immediately start firing real scrapers against Bufdir, Brreg, SSB and FHI the
moment someone points it at a database. There is no dev/prod split in this
module to gate on (checked 2026-10-01 — no `ATLAS_ENV` or equivalent exists),
so this now applies to every instance, not only the deployed cluster. If a
genuine need for a quiet local/test instance shows up, the fix is an
env-gated `default_status`, not reverting this.

Cadence and freshness live in `atlas_data/cadence.py`, declared on the assets
themselves. This module now holds one explicit sensor, replacing the implicit
default so the RUNNING default is a fact in code, not a UI setting a database
reset can discard.
"""

from dagster import (
    AssetSelection,
    AutomationConditionSensorDefinition,
    DefaultSensorStatus,
)

# Explicit, not implicit — the unscoped version Dagster would otherwise supply
# on its own, with the one line (`default_status`) that implicit version has
# no way to carry. `AssetSelection.all()` matches "every asset that has a
# condition" exactly, because `AutomationConditionSensorDefinition` only acts
# on assets within `target` that declare one; an asset with none is a no-op
# for this sensor, same as it always was for the implicit one.
automation_condition_sensor = AutomationConditionSensorDefinition(
    name="default_automation_condition_sensor",
    target=AssetSelection.all(),
    default_status=DefaultSensorStatus.RUNNING,
    description=(
        "Evaluates every asset's AutomationCondition and requests a run when "
        "one is due. Covers brreg_bootstrap, annual_sources_refresh and "
        "brreg_change_feed's cadence, among others — see atlas_data/cadence.py "
        "for what each asset's condition actually says. RUNNING by default "
        "(urb-agents #1793): an install or reset must not need a human to "
        "notice these haven't fired and turn this on by hand."
    ),
)

automation_sensors: list = [automation_condition_sensor]
