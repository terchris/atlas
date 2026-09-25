#!/usr/bin/env bash
#
# Every not_null asserted on a seed-backed published column must be TRUE IN THE
# COMMITTED CSV.
#
# 🔴 WHY THIS EXISTS. On 2026-09-25 I published mart_ref_brreg_icnpo with
# `data_tests: [not_null]` on label_en. All 46 rows are empty — Brreg publishes
# those ICNPO names in Norwegian only. transform_checks failed in production
# with 46 failing rows, on a release that had already failed once that day.
#
# ⚠️ I had checked the FHI seeds and seen empty label_en there, then asserted
# not_null on six others without looking. The seed's own schema.yml had it
# right all along: it tests label_no and deliberately leaves label_en untested.
#
# 🔵 The data needed to catch this is COMMITTED — the CSV and the schema.yml.
# No database, no dbt parse, no warehouse. That is the whole point: this is a
# claim about a file in the repo, so it is checkable in the repo, and CI builds
# against an empty database where a not_null on an empty column is invisible.
set -euo pipefail
cd "$(dirname "$0")"

# The repo's venv locally; in CI the parse step symlinks .venv/bin/python to
# the runner's interpreter. Fall back rather than depend on either existing.
PY_BIN="./.venv/bin/python"
[ -x "$PY_BIN" ] || PY_BIN="$(command -v python3)"
[ -n "$PY_BIN" ] || { echo "\u2717 CANNOT CHECK: no python interpreter found." >&2; exit 2; }

exec "$PY_BIN" - "$@" <<'PY'
import csv, io, os, re, sys, yaml

SCHEMA = "models/marts/api/schema.yml"
doc = yaml.safe_load(io.open(SCHEMA, encoding="utf-8"))

# Published model -> the seed it wraps, for the bare `select * from ref('x')`
# and `from {{ ref('x') }}` passthrough shapes only. Anything that projects or
# joins can legitimately differ from its seed and is not judged here.
def seed_for(model_name):
    path = "models/marts/api/%s.sql" % model_name
    if not os.path.exists(path):
        return None
    body = re.sub(r"--.*", "", io.open(path, encoding="utf-8").read())
    m = re.search(r"from\s+\{\{\s*ref\(\s*'([a-z0-9_]+)'\s*\)\s*\}\}\s*(order\s+by[^;]*)?$",
                  body.strip(), re.I | re.S)
    if not m:
        return None
    csv_path = None
    for root, _dirs, files in os.walk("seeds"):
        if "%s.csv" % m.group(1) in files:
            csv_path = os.path.join(root, "%s.csv" % m.group(1))
            break
    return csv_path

checked = 0
bad = []
for model in doc.get("models", []):
    seed = seed_for(model["name"])
    if not seed:
        continue
    rows = list(csv.DictReader(io.open(seed, encoding="utf-8")))
    for col in model.get("columns", []):
        tests = col.get("data_tests") or col.get("tests") or []
        flat = [t if isinstance(t, str) else next(iter(t)) for t in tests]
        if "not_null" not in flat:
            continue
        name = col["name"]
        if rows and name not in rows[0]:
            continue
        checked += 1
        empty = sum(1 for r in rows if not (r.get(name) or "").strip())
        if empty:
            bad.append((model["name"], name, empty, len(rows), os.path.basename(seed)))

if not checked:
    print("✗ CANNOT CHECK: no seed-backed not_null assertions found at all.", file=sys.stderr)
    print("  It would have passed without checking anything.", file=sys.stderr)
    sys.exit(2)

if bad:
    print("✗ not_null asserted on a column that is EMPTY in its committed seed:")
    for m, c, e, n, s in bad:
        print("    %s.%s  %d of %d rows empty  (%s)" % (m, c, e, n, s))
    print("  Either the seed should carry the values, or the assertion is wrong.")
    print("  ⚠️ A not_null on an empty column passes every CI build, because CI")
    print("     builds from an empty database. It fails in production, on real rows.")
    sys.exit(1)

print("✓ all %d seed-backed not_null assertions hold in the committed CSVs" % checked)
PY
