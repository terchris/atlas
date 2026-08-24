"""
Declarative automation + freshness — the pilot slice.

## Why this exists

Atlas drives Dagster with hand-written jobs and cron schedules: the oldest,
most Airflow-shaped part of the API. Everything we have fought recently is
downstream of that — a 711-event job that could not start, and a requirement
("adding a source must touch zero job definitions") that cadence-bucket jobs
satisfy only by convention.

The idiomatic shape inverts it: each asset declares its own cadence, and the
daemon decides what to run. There are no job membership lists to edit because
there are no jobs. This module is the pilot that tests whether that is better
*for Atlas*, on one slice (SSB Klass, 2 assets), running beside the existing
cron job rather than replacing it.

## Freshness is the half that is about the product, not the plumbing

Atlas's public claim is that its data is current — that is what the website's
"recently refreshed" strip asserts. Today Atlas has 645 checks about data
*shape* and **no machine-readable definition of what fresh means**. A freshness
check answers "is Atlas stale?" without a human going to look.

These are deliberately WARN, not ERROR: an SSB table published late is not a
broken pipeline, and paging on it would train people to ignore checks. The
bound is generous for the same reason — it should fire when something is
genuinely wrong, not when an upstream is a few days behind schedule.
"""

from dagster import (
    AssetSelection,
    AutomationConditionSensorDefinition,
    DefaultSensorStatus,
)

from atlas_data.assets import raw_ssb

# The pilot slice: the two SSB Klass sources. Kept as one list so the pilot's
# blast radius is obvious and reversible.
PILOT_ASSET_KEYS = [
    ["raw", sid.replace("-", "_")] for sid in raw_ssb.SSB_KLASS_SOURCES
]

# ⚠️ Pilot finding: `build_last_update_freshness_checks` +
# `build_sensor_for_freshness_checks` — the obvious way in, and what most
# examples still show — are **superseded**. Dagster says so at import:
#
#   SupersessionWarning: Function `build_last_update_freshness_checks` is
#   superseded ... Attach `FreshnessPolicy` objects to your assets instead.
#
# The replacement is better for Atlas in two ways: the policy lives ON the
# asset, next to the source it describes (so a new source declares its own
# freshness and nothing central changes), and it needs **no sensor** — the
# daemon evaluates policies directly. So freshness now lives in raw_ssb.py,
# and this module only carries the automation sensor.

# The daemon-side half of declarative automation: evaluates the assets' own
# automation_conditions and launches what they ask for.
#
# Ships STOPPED, and scoped to the pilot assets only — an unscoped automation
# sensor would begin evaluating conditions across the whole graph, which is a
# far larger change than a pilot should make.
klass_automation_sensor = AutomationConditionSensorDefinition(
    name="klass_automation_sensor",
    target=AssetSelection.assets(*PILOT_ASSET_KEYS),
    default_status=DefaultSensorStatus.STOPPED,
    description=(
        "Declarative-automation pilot: evaluates the SSB Klass assets' own "
        "automation conditions instead of running them from klass_monthly. "
        "Enable this OR klass_monthly, never both."
    ),
)

automation_sensors = [klass_automation_sensor]
