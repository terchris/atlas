#!/usr/bin/env bash
#
# Every model's COMPILED SQL must be parseable Postgres.
#
# 🔴 WHY THIS EXISTS. On 2026-09-21 a comment block in dim_brreg_enhet carried
# `--` on its FIRST LINE ONLY. Everything after it was prose sitting in the
# middle of a select. dbt parse passed, every gate in this repo passed, CI was
# green, and the model failed at model 1 of 90 in production — where CASCADE
# took three published relations dark for the second time that day.
#
# ⚠️ `dbt parse` CANNOT CATCH THIS. Parse renders Jinja and builds the
# manifest; it never looks at whether the SQL it produced is SQL. The defect
# is invisible until Postgres reads it, which by then is production.
#
# I named this gap twice on urb-agents #1328 without closing it. This closes
# the specific hole — prose, unbalanced parens, a stray token — not semantics.
# A model that parses can still reference a column that does not exist.
#
# 🔵 WHY A PARSER AND NOT A DATABASE. Validating against a real Postgres would
# catch more, but needs the marts to exist, which needs raw data, which needs
# the ingest to have run. A parser needs nothing and runs in seconds, so it can
# be unfiltered and unconditional. Measured against this repo on 2026-09-21:
# 1182 compiled model files, zero false positives.
set -euo pipefail
cd "$(dirname "$0")"

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

[ -d target/compiled ] || {
  echo "✗ CANNOT CHECK: no target/compiled — run 'dbt compile' first." >&2
  echo "  (dbt compile needs a reachable database to connect to, even though" >&2
  echo "   it does not read the marts. dbt parse is NOT enough: parse is what" >&2
  echo "   passed while the model was broken.)" >&2
  exit 2
}

"$PY" - <<'PYEOF'
import pathlib, sys
try:
    import sqlglot
except ImportError:
    print("✗ CANNOT CHECK: sqlglot is not installed. Without it this gate "
          "would pass by checking nothing.", file=sys.stderr)
    sys.exit(2)

# 🔴 CONTROLS FIRST. A parser that accepts everything reports a clean repo and
# is indistinguishable from a clean repo. These two are the exact defect and
# its correct form, so a green result below means something.
KNOWN_BAD = """select a, b
-- this comment marker covers only its own line and the
   next two lines are raw prose in the middle of a select
from t"""
KNOWN_GOOD = """select a, b
-- this comment marker
-- covers every line
from t"""

def parses(sql):
    try:
        sqlglot.parse(sql, dialect="postgres"); return True
    except Exception:
        return False

if parses(KNOWN_BAD):
    print("✗ CANNOT CHECK: the parser ACCEPTED the known-bad statement — the "
          "exact defect this gate exists for. It would pass anything.",
          file=sys.stderr)
    sys.exit(2)
if not parses(KNOWN_GOOD):
    print("✗ CANNOT CHECK: the parser REJECTED the known-good statement, so "
          "every finding below would be noise.", file=sys.stderr)
    sys.exit(2)

root = pathlib.Path("target/compiled")
models = [f for f in sorted(root.rglob("*.sql"))
          if "/models/" in f.as_posix() and "/tests/" not in f.as_posix()]

if not models:
    print("✗ CANNOT CHECK: zero compiled model files. It would have passed "
          "without checking anything.", file=sys.stderr)
    sys.exit(2)

bad = []
for f in models:
    try:
        sqlglot.parse(f.read_text(), dialect="postgres")
    except Exception as e:
        bad.append((f, str(e).splitlines()[0][:160]))

if bad:
    print(f"✗ {len(bad)} compiled model(s) are not parseable Postgres.")
    print("  This is what reaches the database. dbt parse does not look at it.")
    for f, e in bad:
        print(f"    {f}\n      {e}")
    sys.exit(1)

print(f"✓ all {len(models)} compiled model files are parseable Postgres")
print("  (parser verified against a known-bad and a known-good statement first)")
PYEOF
