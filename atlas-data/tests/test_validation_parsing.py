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

if failures:
    print("FAIL")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)
print(f"✓ validation response parsing: {14} cases, all pass")
