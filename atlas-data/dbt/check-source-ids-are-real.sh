#!/usr/bin/env bash
#
# Every source_id an indicator model emits must exist in the source manifest.
#
# 🔴 WHY. On 2026-09-21 I generated nine Ungdata models from a Python dict and
# used the DICT KEY as the source_id literal. Four keys contain underscores and
# the real source ids use hyphens:
#
#     emitted  fhi-mediebruk_some      manifest  fhi-mediebruk-some
#
# Nothing failed. The five single-word sources matched, the four others joined
# to nothing — no error, just provenance that is silently never there. The
# subject fields, the licence, the refresh date: all null, for four of the nine
# series this release exists to publish.
#
# ⚠️ AN accepted_values TEST EXISTS AND WOULD HAVE CAUGHT IT. It did not,
# because catching it needs `dbt build` against a database and nobody had run
# one — the transform was failing earlier for an unrelated reason. ops-dev
# found it by reading the live API. "A test exists" and "a test ran" are
# different claims, and this repo has made that mistake before
# (api_v1_descriptions_complete: in the manifest and executed are two different
# things).
#
# So this is the static half: no database, no dbt run, no cluster. It cannot
# check values, only that the identifier a model claims is one Atlas knows.
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST=seeds/sources/_sources_manifest.csv
[ -f "$MANIFEST" ] || { echo "✗ CANNOT CHECK: no $MANIFEST" >&2; exit 2; }

KNOWN="$(tail -n +2 "$MANIFEST" | cut -d, -f1 | tr -d '"' | sort -u)"
[ -n "$KNOWN" ] || { echo "✗ CANNOT CHECK: no source ids parsed from $MANIFEST" >&2; exit 2; }

bad=""
n=0
for f in models/indicators/indicators__*.sql; do
  # the literal each model stamps onto every row
  for sid in $(grep -oE "'[a-z0-9]+-[a-z0-9_-]+'::text[[:space:]]+as source_id" "$f" \
               | grep -oE "'[^']+'" | tr -d "'"); do
    n=$((n+1))
    printf '%s\n' "$KNOWN" | grep -qx "$sid" || bad="${bad}    ${sid}  emitted by ${f}
"
  done
done

[ "$n" -gt 0 ] || { echo "✗ CANNOT CHECK: zero source_id literals found — the pattern stopped matching." >&2; exit 2; }

if [ -n "$bad" ]; then
  echo "✗ an indicator model emits a source_id that is not in the manifest."
  echo "  It will join to nothing in meta_sources — silently, with no error."
  printf '%s' "$bad"
  exit 1
fi

echo "✓ all ${n} emitted source_ids exist in the source manifest"

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

# ── and every source the FACT emits must be in accepted_values ───────────────
#
# 🔴 A HAND-MAINTAINED LIST THAT MUST AGREE WITH THE FACT'S CTEs, AND NOTHING
# CROSS-CHECKED IT. models/marts/schema.yml carries an accepted_values test
# naming every source_id allowed in fact_kommune_indicators. On 2026-09-22
# `3086c46` added fhi-innvandrere to the fact and not to that list, and
# transform_checks failed on the cluster with 2 NEW failures (urb-agents
# #1389).
#
# ⚠️ FOURTH INSTANCE THIS WEEK of a predicate updated in one place and not its
# sibling — after latest_year vs the counts, the null-filter vs the subject,
# and the counts vs the range. ⚠️ And the FIFTH was already written: the held
# PR serving ssb-12944 had the same gap, and this check found it before it
# shipped rather than after.
#
# 🔵 The dbt test is right and stays. What was missing is a check that runs
# BEFORE a deploy rather than during one — a failure on the cluster costs a
# transform; a failure here costs nothing.
LIST="$("$PY" - <<'PYEOF'
import re, pathlib
t = pathlib.Path("models/marts/schema.yml").read_text()
m = re.search(r"- accepted_values:\n\s+values: \[([^\]]*)\]", t, re.S)
print("\n".join(x.strip() for x in m.group(1).replace("\n", " ").split(",") if x.strip()) if m else "")
PYEOF
)"
[ -n "$LIST" ] || { echo "✗ CANNOT CHECK: could not parse the accepted_values list." >&2; exit 2; }

FACT_IDS="$("$PY" - <<'PYEOF'
import re, pathlib
fact = pathlib.Path("models/marts/fact_kommune_indicators.sql").read_text()
out = set()
for branch in re.findall(r"select \* from (\w+)", fact):
    m = re.search(r"(?m)^(?:with\s+)?" + re.escape(branch) + r" as \(\n(.*?)\n\),", fact, re.S)
    if not m:
        continue
    for ref in re.findall(r"ref\('(indicators__[a-z0-9_]+)'\)", m.group(1)):
        f = pathlib.Path(f"models/indicators/{ref}.sql")
        if f.exists():
            out |= set(re.findall(r"'([a-z0-9][a-z0-9-]+)'::text\s+as\s+source_id", f.read_text()))
print("\n".join(sorted(out)))
PYEOF
)"
[ -n "$FACT_IDS" ] || { echo "✗ CANNOT CHECK: zero source_ids resolved from the fact." >&2; exit 2; }

missing=""
while IFS= read -r sid; do
  [ -n "$sid" ] || continue
  printf '%s\n' "$LIST" | grep -qx "$sid" || missing="${missing}    ${sid}
"
done <<FACT_LIST
$FACT_IDS
FACT_LIST

if [ -n "$missing" ]; then
  echo "✗ the fact emits source_ids that accepted_values does not allow:"
  printf '%s' "$missing"
  echo "  Add them to models/marts/schema.yml. Never widen the test to pass —"
  echo "  it is the thing that notices a source entering the fact unannounced."
  exit 1
fi
echo "✓ all $(printf '%s\n' "$FACT_IDS" | grep -c .) fact source_ids are in accepted_values"
