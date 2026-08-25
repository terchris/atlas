"""
Cadence and freshness, declared once and shared by every source family.

## What "fresh" means here, and what it does not

`FreshnessPolicy.time_window` measures **time since this asset last
materialised** — "did our pipeline run recently?" It does *not* measure "is our
copy up to date with what the publisher released", which would need the
upstream's own publication date (Atlas records that as `upstream_updated_at` on
the materialisation, and comparing the two is a later piece of work).

That distinction matters when choosing bounds. An SSB table that publishes once
a year is still **polled weekly**, because publication dates drift and the
ingests upsert, so a poll that finds nothing is a no-op. So the freshness bound
follows the **polling** cadence, not the publication cadence: if an annual
source has not been fetched in a month, the pipeline is broken — regardless of
whether SSB has published anything new.

## Why WARN and FAIL rather than one threshold

WARN is "someone should look"; FAIL is "this is broken". An upstream publishing
a few days late should never page anyone — a check that cries wolf is one people
learn to ignore, and then the real failure is invisible too.
"""

from datetime import timedelta

from dagster import AutomationCondition, FreshnessPolicy

TIMEZONE = "Europe/Oslo"

# ── Cadences ─────────────────────────────────────────────────────────────────
# The same cron expressions the cadence-bucket jobs used, now declared on the
# assets themselves. Staggered exactly as before: sources land, then the heavy
# scraper, so they are not competing for run slots.
WEEKLY_CRON = "0 2 * * 0"  # Sunday 02:00 — the annual-source poll
MONTHLY_CRON = "0 1 1 * *"  # 1st of the month 01:00 — Klass classifications
SCRAPER_CRON = "30 3 * * 0"  # Sunday 03:30 — offset from the annual wave


def weekly_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(WEEKLY_CRON, TIMEZONE)


def monthly_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(MONTHLY_CRON, TIMEZONE)


def scraper_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(SCRAPER_CRON, TIMEZONE)


# ── Freshness ────────────────────────────────────────────────────────────────
# Bounds follow the POLLING cadence (see the module docstring), with room for a
# source to miss one cycle before anyone is told.

# Weekly-polled: a fortnight without a successful fetch is worth a look; a month
# means the pipeline has been broken for four cycles.
WEEKLY_FRESHNESS = FreshnessPolicy.time_window(
    fail_window=timedelta(days=30),
    warn_window=timedelta(days=14),
)

# Monthly-polled: one missed cycle warns, three fails.
MONTHLY_FRESHNESS = FreshnessPolicy.time_window(
    fail_window=timedelta(days=90),
    warn_window=timedelta(days=45),
)

# ── Sources that must never self-trigger ─────────────────────────────────────
#
# These get NO automation condition and NO freshness policy. Both omissions are
# deliberate and they are not the same omission:
#
#   - no condition  → the daemon never launches it, so an enabled automation
#                     sensor cannot inherit a guaranteed failure.
#   - no freshness  → it cannot run, so a freshness policy would be permanently
#                     violated. An alarm that is always on is the same as no
#                     alarm at all, and it would bury the ones that mean
#                     something.
#
# Both remain runnable by hand — the jobs are kept — which is how they get
# exercised the moment their blocker clears.
#
# `frr`: private by design. It reads atlas-private-data-repo/, deliberately
# absent from the image, so on any public deployment it materialises zero rows.
# See dbt/models/private_marts/sources.yml for the contract. This one is
# permanent, not a park.
#
# `redcross-branches`: **parked 2026-08-25** pending Terje's Red Cross API
# credential. It carried `on_cron(30 3 * * 0)`, so with the automation sensor
# enabled it would have failed every Sunday at 03:30 — and Phase 3's acceptance
# is "no orphaned or hung runs", which that would have compromised by design
# rather than by discovery. Unparking is: give it back
# `automation_condition=cadence.scraper_polled()` and
# `freshness_policy=cadence.WEEKLY_FRESHNESS` in assets/raw_other.py, one line
# each. See PLAN-redcross-branches-private-input.
UNSCHEDULED_SOURCES = {"frr", "redcross-branches"}
