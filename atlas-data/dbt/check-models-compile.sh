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
from collections import Counter
try:
    import sqlglot
    from sqlglot import exp
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

# ---------------------------------------------------------------- pass 2
# 🔴 PARSING IS NOT ENOUGH, AND THE SECOND RELEASE PROVED IT WHILE THIS GATE
# WATCHED. `c445ac5` failed at model 85 with "each UNION query must have the
# same number of columns" — one branch of a 32-way union was missing a column.
# That is a SEMANTIC error: it parses perfectly, and pass 1 returned exit 0
# against the exact build that broke (measured, urb-agents #1328).
#
# ⚠️ AND THE OBVIOUS FIX DOES NOT WORK. The branches are `select * from <cte>`,
# so in the AST every branch is one "column" and counting them catches nothing.
# The stars must be resolved against the CTE definitions first.
#
# ⚠️ NOR DOES sqlglot's QUALIFIER, THOUGH IT LOOKED LIKE IT DID. It raised
# `Unknown column: window_years` on the real file, which is why it was tried —
# but that was INCIDENTAL: the outer select happened to name the missing
# column. Given `select * from u` it resolves the mismatch happily. A control
# caught that before this shipped, which is the only reason it is not the
# gate. The width comparison below is the actual check.
from collections import Counter


def _sole_table(select):
    """The one table a `select * from X` reads, or None.

    ⚠️ Not `select.args["from"]`: sqlglot 30 keys it `from_`, and the earlier
    draft of this used `from` and silently resolved nothing. The pass-2
    control is what caught it — the check reported a clean repo against its
    own known-bad. Walking for the Table node works across versions.
    """
    tables = list(select.find_all(exp.Table))
    return tables[0].name if len(tables) == 1 else None


def _cte_widths(tree):
    """Output width of each CTE, resolving `select * from <other cte>`."""
    bodies = {c.alias_or_name: c.this for c in tree.find_all(exp.CTE)}
    widths = {}

    def width(name, seen=frozenset()):
        if name in widths:
            return widths[name]
        body = bodies.get(name)
        if body is None or name in seen:
            return None
        sels = getattr(body, "named_selects", None)
        if sels == ["*"]:
            src = _sole_table(body) if isinstance(body, exp.Select) else None
            widths[name] = width(src, seen | {name}) if src else None
        elif sels:
            widths[name] = len(sels)
        else:
            widths[name] = None
        return widths[name]

    for n in bodies:
        width(n)
    return widths


def _mismatched_unions(tree):
    """[(branch_name, width)] that disagree with their union's majority."""
    widths = _cte_widths(tree)
    found = []
    for u in tree.find_all(exp.Union):
        branches = []
        for side in (u.left, u.right):
            if isinstance(side, exp.Select) and side.named_selects == ["*"]:
                n = _sole_table(side)
                if n and widths.get(n) is not None:
                    branches.append((n, widths[n]))
        found.extend(branches)
    if len(found) < 2:
        return [], None
    common = Counter(w for _, w in found).most_common(1)[0][0]
    return sorted({b for b in found if b[1] != common}), common


# 🔴 CONTROLS FOR PASS 2. The line this gate prints claims both checks were
# verified, and a claim like that has to be true. The known-bad is the shape
# of the c445ac5 defect: two CTEs of different widths unioned behind `select
# *`, which parses cleanly and which the qualifier accepts.
_BAD = ("with a as (select x, y from t1), b as (select x, y, z from t2), "
        "u as (select * from a union all select * from b) select * from u")
_GOOD = ("with a as (select x, y, z from t1), b as (select x, y, z from t2), "
         "u as (select * from a union all select * from b) select * from u")

if not _mismatched_unions(sqlglot.parse_one(_BAD, dialect="postgres"))[0]:
    print("✗ CANNOT CHECK: the width comparison ACCEPTED a union of mismatched "
          "width — the exact c445ac5 defect. Pass 2 would catch nothing.",
          file=sys.stderr)
    sys.exit(2)
if _mismatched_unions(sqlglot.parse_one(_GOOD, dialect="postgres"))[0]:
    print("✗ CANNOT CHECK: the width comparison REJECTED a well-formed union, "
          "so every finding below would be noise.", file=sys.stderr)
    sys.exit(2)

uneven = []
for f in models:
    tree = sqlglot.parse_one(f.read_text(), dialect="postgres")
    odd, common = _mismatched_unions(tree)
    if odd:
        uneven.append((f, odd, common))

if uneven:
    print(f"✗ {len(uneven)} compiled model(s) union branches of different "
          f"widths. Postgres rejects this; it parses fine.")
    for f, odd, common in uneven:
        print(f"    {f}")
        for n, w in odd:
            print(f"      branch `{n}` has {w} columns; the others have {common}")
    print("  ⚠️ Postgres names the branch it compared AGAINST, not the odd one.")
    print("     The branch named above is the one to fix.")
    sys.exit(1)

print(f"✓ all {len(models)} compiled model files are parseable Postgres, "
      f"and every UNION's branches agree in width")
print("  (both checks verified against known-bad and known-good statements "
      "first)")
PYEOF
