#!/usr/bin/env python3
"""Assert that first_data.jobs actually COVERS every source a user needs.

Why this exists, in imac's words on urb-agents #507:

    "You wrote that the gate enforces 'every job in first_data must exist in
    schedules.py'. That is an EXISTENCE check. What first_data claims is
    COVERAGE — 'run these and you have the data'. Every job in that list
    exists, so the gate is green while the instruction is wrong."

It was. Running the three named jobs left `brreg-enheter` empty, because it is a
monthly seed source belonging to no named job — reachable only via
`__ASSET_JOB`, which nobody thinks to run. The artifact authoritatively
instructed a user into the exact state `raw_sources_were_refreshed_recently`
exists to catch.

The population is every source that has an automation condition, i.e. every
source NOT in UNSCHEDULED_SOURCES. Those two are parked by declaration and are
correctly excluded — the same population the dbt freshness test uses.

Parses rather than imports, because this runs in CI without dagster installed.
"""
import re
import sys
from pathlib import Path

dagster_dir = Path(sys.argv[1])
declared_jobs = set(sys.argv[2].split(","))

assets = dagster_dir / "assets"
schedules = (dagster_dir / "schedules.py").read_text()
cadence = (dagster_dir / "cadence.py").read_text()


def literal_lists(text: str) -> dict[str, list[str]]:
    """Every `NAME = [ "a", "b" ]` list of plain strings in a module."""
    out = {}
    for name, body in re.findall(r'^([A-Z_][A-Z0-9_]*)\s*=\s*\[(.*?)\]', text, re.S | re.M):
        out[name] = re.findall(r'"([^"]+)"', body)
    return out


# Every source id declared anywhere in assets/*.py
all_sources: set[str] = set()
per_module: dict[str, list[str]] = {}
for f in sorted(assets.glob("raw_*.py")):
    for name, ids in literal_lists(f.read_text()).items():
        if name.endswith("_SOURCES"):
            per_module[f"{f.stem}.{name}"] = ids
            per_module[name] = ids
            all_sources |= set(ids)

parked = set(re.findall(r'"([a-z-]+)"',
                        re.search(r'UNSCHEDULED_SOURCES\s*=\s*\{([^}]*)\}', cadence).group(1)))
must_be_reachable = all_sources - parked

# Selection constants defined in schedules.py, expanded through references.
sched_lists = literal_lists(schedules)
for name, body in re.findall(r'^(_[A-Z_]+)\s*=\s*\[(.*?)\]', schedules, re.S | re.M):
    ids: list[str] = []
    for ref in re.findall(r'\*([a-z_]+\.[A-Z_]+)', body):
        ids += per_module.get(ref, per_module.get(ref.split(".")[-1], []))
    ids += re.findall(r'^\s*"([^"]+)"', body, re.M)
    sched_lists[name] = ids

# `_KLASS_SOURCE_IDS = list(raw_ssb.SSB_KLASS_SOURCES)` — a reference, not a
# literal. Handled explicitly rather than by loosening the literal parser: a
# checker that silently resolves less than it thinks it does is the failure this
# whole script exists to prevent.
for name, ref in re.findall(r'^(_[A-Z_]+)\s*=\s*list\(([a-z_]+\.[A-Z_]+)\)', schedules, re.M):
    resolved = per_module.get(ref, per_module.get(ref.split(".")[-1]))
    if resolved is None:
        sys.exit(f"✗ cannot resolve {name} = list({ref}) — the checker would under-report coverage")
    sched_lists[name] = list(resolved)

# Every job defined in schedules.py. A job whose selection is not
# _asset_selection(...) — transform_and_publish selects dbt models, not raw
# sources — is a real job that contributes nothing to SOURCE coverage. That is
# legitimate, and different from naming a job that does not exist.
all_jobs = set(re.findall(r'define_asset_job\(\s*\n\s*name="([a-z_]+)"', schedules))

job_sources: dict[str, set[str]] = {j: set() for j in all_jobs}
for name, sel in re.findall(
        r'name="([a-z_]+)",\s*\n\s*selection=_asset_selection\(([^)]*)\)', schedules):
    sel = sel.strip()
    if sel.startswith("["):
        job_sources[name] = set(re.findall(r'"([^"]+)"', sel))
        continue
    # A bare reference — `raw_brreg.BRREG_DAILY_SOURCES` or a local constant.
    # ⚠️ Anything else is an EXPRESSION this parser cannot evaluate: two lists
    # concatenated, a comprehension, a slice. Resolving it to the empty set makes
    # the job look like it covers nothing, which fails safe but reports the wrong
    # thing — "source X is uncovered" when the truth is "the checker cannot read
    # this selection". Say which. That distinction cost a confusing minute on
    # 2026-09-12 and would cost worse on a day someone is rushing.
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?', sel):
        sys.exit(
            f"✗ job {name!r} has a selection this checker cannot resolve: "
            f"_asset_selection({sel})\n"
            f"  It reads plain list literals and single names, because it parses "
            f"rather than imports (CI has no dagster).\n"
            f"  Assign the sources to one flat list of string literals and pass "
            f"that name."
        )
    key = sel.split(".")[-1]
    resolved = sched_lists.get(sel, sched_lists.get(key, per_module.get(key)))
    if resolved is None:
        sys.exit(
            f"✗ job {name!r} selects {sel}, which this checker cannot find in "
            f"schedules.py or assets/*.py.\n"
            f"  It must be a list of string literals, or coverage is under-reported."
        )
    job_sources[name] = set(resolved)

unknown = declared_jobs - all_jobs
if unknown:
    sys.exit(f"✗ first_data.jobs names jobs not defined in schedules.py: {sorted(unknown)}")

covered: set[str] = set()
for j in declared_jobs:
    covered |= job_sources[j]

uncovered = must_be_reachable - covered
if uncovered:
    sys.exit(
        f"✗ first_data.jobs does not cover {len(uncovered)} automated source(s): "
        f"{sorted(uncovered)}\n"
        f"  A user following first_data would leave these empty. Add a named job "
        f"covering them, or say plainly in first_data that they are excluded."
    )

print(f"  ✓ first_data covers all {len(must_be_reachable)} automated sources "
      f"({len(parked)} parked and correctly excluded: {sorted(parked)})")
