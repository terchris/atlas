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

# Brreg's change feed, and the Brreg-only transform that follows it.
#
# 🔴 */30, AND THE DECIDING NUMBER IS DUTY CYCLE, NOT POD COUNT.
#
# tor-agent and ops independently chose */30 by different routes (urb-agents
# #766), both conditional on the Brreg-only transform job existing first. Against
# the transform's measured 524 s run on asgard:
#
#     */30    29% duty     fine
#     */15    58% duty     working more than half the time
#     */5    175% duty     🔴 cannot finish before the next tick
#
# At */5 runs queue, the concurrency cap binds, and lag GROWS — the cadence would
# make the API staler, not fresher. ops: "freshness is bounded by how long the
# work takes, not by how often you ask for it."
#
# ⚠️ If the Brreg-only transform job is ever removed, this must go back to hourly.
# Most of that 524 s is rebuilding SSB, FHI and Bufdir models that change once a
# year, and raising the cron without the split "buys freshness at 1.57 h/day of
# pure waste — and it would work, which is what makes it tempting" (ops).
BRREG_FEED_CRON = "0,30 * * * *"

# 🔴 TEN MINUTES AFTER THE FEED, NOT ALONGSIDE IT.
#
# Both on */30 would fire simultaneously and the transform would reconcile data
# the feed had not written yet — every cycle, silently, producing a dimension
# permanently one cycle behind a feed that is itself current. The offset is the
# whole reason this is not `*/30` twice.
#
# Ten minutes is generous against the work: a 30-minute window holds ~114 changes
# at the measured 3.8/minute, each costing one entity fetch at four concurrent.
# Generous on purpose — the cost of being early is a stale cycle, and the cost of
# being late is nothing at all.
BRREG_TRANSFORM_CRON = "10,40 * * * *"

# 🔴 Frivillighetsregisteret stays DAILY, and must not inherit the feed's cadence.
#
# It has no change feed and no bulk download (all three paths 404, verified
# 2026-09-12), so the only way to refresh it is to re-walk the whole register:
# ~727 requests at the API's size cap of 100. At the feed's half-hourly cadence
# that is ~35,000 requests a day against a public-sector API, to observe a
# register that changes a few times a day.
#
# ⚠️ This nearly shipped. Both Brreg ingests were in one list with one condition,
# so raising the feed to */30 silently raised this too — a 48x increase in load on
# someone else's service, invisible in the diff, and it would have worked.
FRIVILLIG_CRON = "0 4 * * *"


def weekly_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(WEEKLY_CRON, TIMEZONE)


def monthly_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(MONTHLY_CRON, TIMEZONE)


def scraper_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(SCRAPER_CRON, TIMEZONE)


def brreg_feed_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(BRREG_FEED_CRON, TIMEZONE)


def frivillig_polled() -> AutomationCondition:
    return AutomationCondition.on_cron(FRIVILLIG_CRON, TIMEZONE)


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

# Brreg-polled: by far the tightest bound in Atlas, and the only source that
# earns one. At a 30-minute cadence the old 3-day warn was 144 missed cycles
# before anyone was told — imac's acceptance host sat 13.5 hours behind Brreg
# with every check green, which is exactly that gap.
#
# Two hours warns after four missed cycles; six hours fails after twelve. Still
# room to miss a cycle without crying wolf, on the same principle as the others,
# but measured against a half-hour cadence rather than a daily one.
BRREG_FRESHNESS = FreshnessPolicy.time_window(
    fail_window=timedelta(hours=6),
    warn_window=timedelta(hours=2),
)

# Frivillighetsregisteret: daily-polled, so bounded like the other daily sources
# rather than like the feed. Three days warns, a week fails.
FRIVILLIG_FRESHNESS = FreshnessPolicy.time_window(
    fail_window=timedelta(days=7),
    warn_window=timedelta(days=3),
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
