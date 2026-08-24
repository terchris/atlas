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

# ⚠️ `frr` deliberately gets NO freshness policy and NO automation condition.
# It reads atlas-private-data-repo/, which is absent from the image by design,
# so on any public deployment it materialises zero rows and only when a human
# runs it locally with the private data present. A freshness policy would be
# permanently violated — an alarm that is always on, which is the same as no
# alarm at all. See dbt/models/private_marts/sources.yml for the contract.
UNSCHEDULED_SOURCES = {"frr"}
