"""
@asset wrapper for the full Enhetsregisteret bulk load.

One source, `brreg-enheter-alle`, materialising ~1.17M organisations into
`raw.brreg_enheter_snapshot`. PLAN-001 phase 3.

## 🔴 No automation condition and no freshness policy — deliberately

Re-running a bulk load against a populated database is the one genuinely
destructive operation in this design, and **it must never self-trigger**. The
loader is written so that a re-run is safe (upsert on `organisasjonsnummer`, no
DELETE, no TRUNCATE, guarded by a test over the module source), but "safe if the
code is correct" is not a reason to let a daemon do it unattended at 02:00. There
is no upside: keeping the register current is the change feed's job (PLAN-002),
which touches only what moved and costs a few hundred rows instead of 1.17M.

No freshness policy for the matching reason. A policy would declare this asset
permanently stale between bootstraps, and an alarm that is always on is the same
as no alarm, burying the ones that mean something.

## This is a THIRD category, not the parked one

`cadence.UNSCHEDULED_SOURCES` means *cannot run*: `frr` has no private data on a
public deployment, `redcross-branches` has no credential. Both are correctly
absent from any first-day sequence.

`brreg-enheter-alle` is the opposite — it **must** run, exactly once, on a fresh
install, and then be left alone. So it stays out of UNSCHEDULED_SOURCES (which
would exclude it from the install's first-data instructions and leave a new user
with an empty register and no signal why) and is instead reached by its own named
job, `brreg_bootstrap`, which is listed in `template-info.yaml`'s
`operational.first_data.jobs`.

The coverage checker (`uis/check-first-data-coverage.py`) enforces exactly that:
a source that is neither parked nor covered by a first-data job fails the build.
That is the property that matters here, and it is why this file does not take the
easy route of parking the source to keep the gate quiet.

## Running it costs ~210 MB over the wire

Measured 2026-09-11: 210,132,682 bytes compressed, 2,005,028,121 uncompressed,
1,173,878 records, ~33 MB resident. The download is 52 s; the parse is seconds.
The database write time on a cluster is not yet measured — see PLAN-001 phase 2's
validation section for what imac is verifying.
"""

from atlas_data.assets._factory import make_raw_ingest_assets
from atlas_data import cadence

BRREG_BULK_SOURCES = [
    "brreg-enheter-alle",
]

# The daily Brreg sources. Opposite treatment to the bootstrap above, and the
# contrast is the point:
#
#   the bootstrap  runs once, by hand, and must never self-trigger
#   these          run every day, unattended, and must never be forgotten
#
# They are safe to automate precisely because they are small and additive.
#
#   brreg-oppdateringer — the change feed (PLAN-002). ~3,000 changes a day
#     (measured median over 30 days), appended to raw.brreg_oppdateringer and
#     raw.brreg_enheter_versions, never touching the 1.17M-row snapshot. A bug
#     here cannot damage the expensive table.
#
#   brreg-frivillige — Frivillighetsregisteret (PLAN-003 phase 3). Daily for a
#     different reason: it has NO change feed and no bulk download of its own, so
#     a full re-walk is the only option. ~727 requests, a few minutes, upserting.
#     🔴 It does not supply NGO membership — that flag is already on every
#     Enhetsregisteret record. It supplies icnpoKategorier, which nothing else
#     does.
#
# ⚠️ ONE FLAT LIST OF STRING LITERALS, DELIBERATELY. uis/check-first-data-coverage.py
# parses this file rather than importing it (it runs in CI without dagster), and it
# resolves `NAME = ["a", "b"]` literals. An expression — two lists concatenated at
# the call site — resolves to nothing, and the gate then reports the sources as
# uncovered. That is the gate failing safe, and it is still a gate you have to go
# and fix. Keep the literal.
BRREG_DAILY_SOURCES = [
    "brreg-oppdateringer",
    "brreg-frivillige",
]

# No automation_condition and no freshness_policy arguments at all — see the
# module docstring. Their absence is the design, so do not "fix" it by adding
# cadence.monthly_polled() to match the neighbouring source families.
assets = [
    *make_raw_ingest_assets(
        BRREG_BULK_SOURCES,
        group_name="raw_brreg",
    ),
    *make_raw_ingest_assets(
        BRREG_DAILY_SOURCES,
        group_name="raw_brreg",
        automation_condition=cadence.daily_polled(),
        freshness_policy=cadence.DAILY_FRESHNESS,
    ),
]
