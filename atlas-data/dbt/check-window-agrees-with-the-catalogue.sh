#!/usr/bin/env bash
#
# Every source in fact_kommune_indicators must treat its time dimension the
# way the published catalogue says it behaves.
#
# 🔴 WHY THIS EXISTS. `window_years` is derived per CTE: 20 sources compute it
# from their period columns, 11 get the literal 1. ⚠️ THE LITERAL 1 IS AN
# ASSERTION — "this source is not windowed" — and nothing checked it against
# anything. A windowed source added to the fact with a literal 1 would publish
# a confident, wrong number, which is the failure this whole column exists to
# prevent.
#
# 🔵 THE INDEPENDENT SOURCE WAS ALREADY PUBLISHED. `_sources_dimensions.csv`
# (served as api_v1.meta_dimensions, 228 rows) records what each upstream
# dimension means and its value format. It has said `fhi-selvmord AAR =
# "5-year rolling window"` all along. On 2026-09-21 a consumer, ops-dev and
# this agent all derived the windowing independently while that relation sat
# there — and ops-dev's "exactly two FHI sources are windowed" was wrong, as
# the catalogue would have shown: there are three in the fact, plus ssb-12944
# ("3-year rolling period") still in BACKLOG, which is the next one to get
# this wrong (urb-agents #1333).
#
# ⚠️ IT CHECKS ONE DIRECTION ONLY. Catalogue says windowed + CTE says literal
# 1 = failure. The reverse is fine: deriving from a single-year period just
# returns 1. This cannot tell you the derivation produces the RIGHT number —
# only real rows can, which is verify-release.py's job after a deploy.
#
# ⚠️ AND THE CATALOGUE IS HAND-AUTHORED. It is an editorial pass-through over
# a seed, so it is a second opinion, not ground truth. Two hand-written claims
# agreeing is weaker than a measurement. It is still the only cross-check
# available without a database.
set -euo pipefail
cd "$(dirname "$0")"

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

"$PY" - <<'PYEOF'
import csv, pathlib, re, sys

FACT = pathlib.Path("models/marts/fact_kommune_indicators.sql")
SEED = pathlib.Path("seeds/sources/_sources_dimensions.csv")
for p in (FACT, SEED):
    if not p.exists():
        print(f"✗ CANNOT CHECK: {p} is missing.", file=sys.stderr); sys.exit(2)

TIME_CODES = {"AAR", "TID", "YEAR"}

def is_windowed(meaning, fmt):
    """The catalogue's claim that this dimension can span more than one year."""
    if "single-year" in fmt:          # explicitly disclaimed, incl. kpr-1aar
        return False
    return bool(re.search(r"rolling|period|cohort|window", meaning, re.I)
                or "range" in fmt.lower())

# ---- controls. A classifier that answers the same way for everything would
# report a clean repo and look exactly like a clean repo.
CONTROLS = [
    ("3-year rolling period", '"YYYY-YYYY" period label',                      True),
    ("5-year rolling window (year-of-death)", '"YYYY1_YYYY5" 5-year period label', True),
    ("Year", "4-digit year as text",                                           False),
    ("Year", '"YYYY_YYYY" range string (single-year despite the range form)',  False),
]
for meaning, fmt, want in CONTROLS:
    if is_windowed(meaning, fmt) != want:
        print(f"✗ CANNOT CHECK: the classifier got a control wrong — "
              f"{meaning!r} / {fmt!r} should be windowed={want}.", file=sys.stderr)
        sys.exit(2)

seed = {r["source_id"]: r for r in csv.DictReader(SEED.open())
        if r["code"].upper() in TIME_CODES}
if not seed:
    print("✗ CANNOT CHECK: no time dimensions found in the seed.", file=sys.stderr)
    sys.exit(2)

def source_ids_of(model):
    p = pathlib.Path(f"models/indicators/{model}.sql")
    if not p.exists():
        return []
    return re.findall(r"'([a-z0-9][a-z0-9-]+)'::text\s+as\s+source_id", p.read_text())

fact_sql = FACT.read_text()

# 🔴 THE POPULATION IS THE UNION, NOT THE CTEs I CAN FIND WITH A REGEX.
# The first draft of this gate split on `\n<name> as (` and therefore could
# not see the FIRST cte, which is written `with ssb_08764 as (`. That is the
# identical blind spot that let ssb_08764 ship without window_years and break
# the build at model 85 — the check and the defect had the same cause
# (urb-agents #1332). Reading the union branch list makes the population the
# thing that actually has to be consistent.
branches = re.findall(r"select \* from (\w+)", fact_sql)
if not branches:
    print("✗ CANNOT CHECK: no union branches found in the fact.", file=sys.stderr)
    sys.exit(2)

def cte_body(name):
    m = re.search(r"(?m)^(?:with\s+)?" + re.escape(name) + r" as \(\n(.*?)\n\),",
                  fact_sql, re.S)
    return m.group(1) if m else None

pairs, bodyless, unwindowed = [], [], []
for name in branches:
    body = cte_body(name)
    if body is None:
        bodyless.append(name)
        continue
    derived = "window_years()" in body
    literal = "1::int as window_years" in body
    if not (derived or literal):
        # 🔴 This is the c445ac5 failure itself: a union branch with no
        # window_years at all, which Postgres reports as an arity error
        # naming a DIFFERENT branch.
        unwindowed.append(name)
        continue
    for ref in re.findall(r"ref\('(indicators__[a-z0-9_]+)'\)", body):
        for sid in source_ids_of(ref) or [None]:
            pairs.append((name, ref, sid, "derived" if derived else "literal-1"))

if bodyless or unwindowed:
    if bodyless:
        print(f"✗ {len(bodyless)} union branch(es) have no findable CTE body: "
              f"{', '.join(bodyless)}")
        print("  The gate cannot check what it cannot read; fix the pattern "
              "rather than the finding.")
    if unwindowed:
        print(f"✗ {len(unwindowed)} union branch(es) carry no window_years at "
              f"all: {', '.join(unwindowed)}")
        print("  Postgres will reject the UNION and name a DIFFERENT branch.")
    sys.exit(1)

if not pairs:
    print("✗ CANNOT CHECK: zero CTEs carry window_years. It would have passed "
          "without checking anything.", file=sys.stderr)
    sys.exit(2)

# 🔴 A source in the fact with no catalogue row is UNCHECKABLE, and silently
# skipping it is how this gate would rot into passing on the sources that
# matter most — the new ones.
unknown = [p for p in pairs if not p[2] or p[2] not in seed]
wrong   = [p for p in pairs if p[2] in seed and p[3] == "literal-1"
           and is_windowed(seed[p[2]]["meaning"], seed[p[2]]["value_format"])]

if unknown:
    print(f"✗ {len(unknown)} source(s) in the fact have no time dimension in "
          f"{SEED} — their window cannot be cross-checked.")
    print("  Add the AAR/Tid row to the seed. Do not remove them from the fact.")
    for cte, ref, sid, _ in unknown:
        print(f"    {cte}  ({ref})  source_id={sid}")
if wrong:
    print(f"✗ {len(wrong)} source(s) are windowed per the catalogue but publish "
          f"window_years = 1:")
    for cte, ref, sid, _ in wrong:
        s = seed[sid]
        print(f"    {cte}  {sid}\n      catalogue: {s['meaning']!r} / "
              f"{s['value_format']!r}\n      fact:      1::int as window_years")
    print("  Use {{ window_years() }}, or correct the catalogue if it is wrong.")
if unknown or wrong:
    sys.exit(1)

d = sum(1 for p in pairs if p[3] == "derived")
print(f"✓ all {len(pairs)} fact sources agree with the catalogue on windowing")
print(f"  ({d} derive window_years, {len(pairs) - d} assert 1; every one has a "
      f"time dimension in the seed, and the classifier passed 4 controls)")
PYEOF
