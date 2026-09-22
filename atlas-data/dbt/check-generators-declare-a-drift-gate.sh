#!/usr/bin/env bash
# Every script that writes a COMMITTED file must either have a drift gate or
# say, in its own source, why it cannot have one.
#
# 🔴 WHY. A generated file that is committed can go stale, and the pipeline
# stays green because nothing fails — it loads the stale input faithfully.
# atlas#422 was exactly that: #416 updated a manifest and not the seed
# meta_sources is built from, and the catalogue published a 404 upstream_url
# as the provenance of correct data (urb-agents #1407).
#
# 🔴 AND THE ADJACENT GATES WERE NO HELP, WHICH IS THE ARGUMENT FOR THIS ONE.
# check-source-ids-are-real and check-every-source-is-served both READ that
# seed and TRUST it. A stale input made two checks agree with it, and their
# green was evidence of nothing. Adding gates one at a time cannot tell you
# about the generator nobody gated.
#
# 🔵 SO: ENUMERATE, DO NOT LIST — the principle from #419. A new script in a
# generator directory FAILS by default until someone decides. The decision is
# cheap; not noticing is what costs.
#
# 🔵 THE EXEMPTION LIVES IN THE GENERATOR, NOT IN THIS FILE. ops-dev's design,
# and the reason is sharp: a list of exemptions here is a hand-maintained file
# that drifts from what it describes — the very defect this exists to catch,
# one level up. A line next to the generator moves when the generator moves.
#
#     # DRIFT-GATE: none — <why>
#
# ⚠️ TWO REAL REASONS SO FAR, and they are different:
#   needs a database   regenerate-erd.sh runs `dbt docs generate`
#   snapshots LIVE state   website/scripts/snapshot-*.mjs capture the running
#                          API. A repo diff cannot gate them because their
#                          input is not in the repo; they need a LIVENESS
#                          comparison instead, which is a different check and
#                          is not written yet. atlas#423 is what happens
#                          without one: 13 of 19 relations served publicly.
set -euo pipefail
cd "$(dirname "$0")/../.."

PY=./atlas-data/dbt/.venv/bin/python
[ -x "$PY" ] || PY=python3

"$PY" - <<'PYEOF'
import pathlib, re, sys

root = pathlib.Path(".")
DIRS = [
    ("atlas-data/dbt/scripts", ("*.py",)),
    ("atlas-data/uis", ("generate-*.py", "render-*.sh")),
    ("atlas-data/dbt", ("regenerate-*.sh",)),
    ("website/scripts", ("*.mjs",)),
]
gens = []
for d, pats in DIRS:
    base = root / d
    if not base.is_dir():
        sys.exit(f"✗ CANNOT CHECK: {d} not found — run from the repo root.")
    for pat in pats:
        gens += sorted(p for p in base.glob(pat) if p.is_file())

if not gens:
    sys.exit("✗ CANNOT CHECK: enumerated zero generators. This check cannot pass "
             "by finding nothing — fix the patterns if the layout changed.")

# Anything that could reference a generator by filename and thereby gate it.
# 🔴 EXCLUDE THIS SCRIPT FROM ITS OWN WATCHER LIST. On its first run it
# reported regenerate-erd.sh as "gated by check-generators-declare-a-drift-gate.sh"
# — because the comment block above mentions that filename. A check that
# satisfies itself by talking about the thing is worse than no check: it is
# green, specific, and wrong. Caught by reading the first output instead of
# the exit code.
SELF = "check-generators-declare-a-drift-gate.sh"
watchers = []
for pat in ("atlas-data/dbt/check-*.sh", "atlas-data/uis/check-*.sh",
            ".github/workflows/*.yml", ".github/workflows/*.yaml"):
    watchers += sorted(p for p in root.glob(pat) if p.name != SELF)
watch_text = {w: w.read_text() for w in watchers}

EXEMPT = re.compile(r"DRIFT-GATE:\s*none\s*[—\-–]\s*(\S.*)")

undeclared = []
gated, exempt = [], []
for g in gens:
    name = g.name
    src = g.read_text()
    m = EXEMPT.search(src)
    if m:
        exempt.append((name, m.group(1).strip()[:60]))
        continue
    who = [w.name for w, t in watch_text.items() if name in t]
    if who:
        gated.append((name, who[0]))
        continue
    undeclared.append(name)

print(f"  enumerated {len(gens)} generators in {len(DIRS)} directories")
for n, w in gated:
    print(f"    gated    {n:<34} {w}")
for n, why in exempt:
    print(f"    exempt   {n:<34} {why}")

if undeclared:
    print()
    print(f"✗ {len(undeclared)} generator(s) neither gated nor declared exempt:")
    for n in undeclared:
        print(f"    {n}")
    print()
    print("  A script that writes a committed file must either be checked for drift")
    print("  or say why it cannot be. Add a gate, or put this line in the script:")
    print()
    print("      # DRIFT-GATE: none — <reason>")
    sys.exit(1)

print(f"  ✓ all {len(gens)} generators are gated ({len(gated)}) or declare an exemption ({len(exempt)})")
PYEOF
