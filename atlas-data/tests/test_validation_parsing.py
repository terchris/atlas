#!/usr/bin/env python3
"""Response reading for every_endpoint_answers, tested without a server.

🔴 WHY THIS FILE EXISTS. The first run of daily_validation after deploy failed
17 of 20 relations and reported 0 of the 3 real empties — two bugs, in opposite
directions, in six lines of parsing that had never been executed (urb-agents
#1433). Both are shapes a live cluster shows immediately and no repo gate could
see, so they are pinned here instead.

🔵 Plain asserts, no pytest, matching test_atlas_status.py: a test needing a
dependency CI does not have is a test that does not run.
"""
import importlib.util
import os
import sys

# 🔵 Loaded BY PATH, not as a package import: atlas_data/__init__ reaches
# dagster, and a test that needs a dependency CI does not have is a test that
# does not run. http_range.py imports nothing, which is the point of it.
_MOD = os.path.join(os.path.dirname(__file__), "..", "dagster", "atlas_data", "http_range.py")
_spec = importlib.util.spec_from_file_location("http_range", _MOD)
http_range = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(http_range)
answered, read_count = http_range.answered, http_range.read_count
explain_empty = http_range.explain_empty
has_never_delivered = http_range.has_never_delivered

failures = []


def check(label, got, want):
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


# ── Content-Range shapes, all measured against the live API 2026-09-23 ────────
# KNOWN-GOOD: a real count must come back as that number.
check("non-empty, limit=0", read_count("*/1170"), 1170)
check("non-empty, limit=1", read_count("0-0/1170"), 1170)
check("non-empty, full body", read_count("0-1169/1170"), 1170)
check("single row", read_count("0-0/1"), 1)

# 🔴 KNOWN-BAD, and the bug that hid every empty relation: an empty relation
# answers `*/0` — which is a real, meaningful ZERO and must not be confused
# with `*/*`, which is NO COUNT AT ALL. Reading the second as zero reported
# "nothing is empty" while three relations were.
check("empty relation", read_count("*/0"), 0)
check("no count computed", read_count("*/*"), None)
check("header absent", read_count(""), None)
check("garbage", read_count("bananas"), None)

# ── Which statuses count as an answer ────────────────────────────────────────
# 🔴 PostgREST answers a PARTIAL collection with 206. Treating that as a
# failure failed every NON-EMPTY relation — 17 of 20.
check("206 answers", answered(206), True)
check("200 answers", answered(200), True)
check("404 does not", answered(404), False)
check("500 does not", answered(500), False)

# ── The regression, stated as the two live cases side by side ────────────────
# If either of these reverts, the check is back to the behaviour that failed
# at 06:00 on the day it shipped.
check("dim_kommune would pass", answered(206) and read_count("*/1170") == 1170, True)
check("activity_catalog reads empty, not broken",
      answered(200) and read_count("*/0") == 0, True)

# ── Why an empty relation is empty ───────────────────────────────────────────
# 🔴 The rule is asked ONLY of relations that already serve zero rows, because
# neither max nor min over contributing sources works. Measured 2026-09-23
# (urb-agents #1441): min would relabel brreg_enhet — 1,175,359 rows — as
# declared_no_ingest, along with three other populated relations.
REDCROSS = {"source_id": "redcross-branches", "total_runs": 0, "latest_row_count": None}
KLASS = {"source_id": "ssb-klass-kommuner", "total_runs": 3, "latest_row_count": 1170}
# ⚠️ A delta feed reporting zero rows on a quiet run is WORKING. It must never
# be allowed to account for a downstream relation serving nothing.
DELTA = {"source_id": "brreg-oppdateringer", "total_runs": 445, "latest_row_count": 0}

check("never-delivered source", has_never_delivered(REDCROSS), True)
check("healthy source", has_never_delivered(KLASS), False)
check("delta feed, quiet run, is NOT an excuse", has_never_delivered(DELTA), False)

by_id = {s["source_id"]: s for s in (REDCROSS, KLASS, DELTA)}

# distrikt_summary: the live case. Explained by redcross-branches even though
# its OTHER source is healthy — which is exactly what origin gets wrong.
check("distrikt_summary is explained",
      explain_empty(["redcross-branches", "ssb-klass-kommuner"], by_id), ["redcross-branches"])
check("single dead source", explain_empty(["redcross-branches"], by_id), ["redcross-branches"])

# 🔴 THE ONE THAT MUST BE LOUD: every source has delivered, relation still
# empty. This is the ssb-06913 shape.
check("all sources healthy -> UNEXPLAINED", explain_empty(["ssb-klass-kommuner"], by_id), [])
check("delta feed alone -> UNEXPLAINED", explain_empty(["brreg-oppdateringer"], by_id), [])

# An unknown source id cannot be vouched for, so it explains nothing away
# silently — it is returned, which routes it to the explained list with a name
# a reader can chase rather than to a bare pass.
check("unknown source is named", explain_empty(["nope"], by_id), ["nope"])

if failures:
    print("FAIL")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)
print(f"\u2713 validation response parsing: {14 + 8} cases, all pass")
