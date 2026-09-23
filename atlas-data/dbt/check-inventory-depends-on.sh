#!/usr/bin/env bash
# mart_atlas_inventory's `-- depends_on:` hints must equal the published
# relations seed, minus itself.
#
# 🔴 WHY A HAND-LIST EXISTS AT ALL. dbt cannot infer a ref() inside an
# execute-guarded block, so the model names its 19 dependencies explicitly.
# Without them it builds BEFORE the marts it counts and reports zeros — which
# would look like data loss and be neither an error nor a failure.
#
# ⚠️ A hand-maintained list that nothing checks is the defect this repo has
# fixed four times this week: the sources seed (#1407), the snapshot defaults
# (#1417), the dataset page list (#1428), the URL sweep (#1420). This gate is
# the difference between "a list" and "a checked list".
#
# 🔵 It must EXCLUDE mart_atlas_inventory itself: the model is published, so it
# appears in the seed it reads, and ref()-ing itself is circular.
set -euo pipefail
cd "$(dirname "$0")"

MODEL=models/marts/api/mart_atlas_inventory.sql
SEED=seeds/sources/api_v1_relations.csv
for f in "$MODEL" "$SEED"; do
  [ -f "$f" ] || { echo "✗ CANNOT CHECK: $f not found." >&2; exit 2; }
done

declared=$(grep -oE "depends_on: \{\{ ref\('mart_[a-z0-9_]+'\)" "$MODEL" \
           | sed "s/.*ref('//;s/'.*//" | sort -u)

# 🔵 AND THE STATIC RELATION LIST, which is what the model actually counts. The
# depends_on hints control BUILD ORDER; this list controls WHAT IS COUNTED. They
# are separate and both must equal the seed — a model that declares 19 marts and
# counts 18 would build correctly and under-report, silently.
counted=$(grep -oE "\{'relation': '[a-z0-9_]+', 'mart': '[a-z0-9_]+'\}" "$MODEL" \
          | sed "s/.*'mart': '//;s/'.*//" | sort -u)
expected=$(tail -n +2 "$SEED" | cut -d, -f2 | grep -v '^mart_atlas_inventory$' | sort -u)

if [ -z "$expected" ]; then
  echo "✗ CANNOT CHECK: parsed zero marts from $SEED — this check cannot pass" >&2
  echo "  by finding nothing to compare." >&2
  exit 2
fi

if [ "$counted" != "$expected" ]; then
  echo "✗ mart_atlas_inventory COUNTS a different set than $SEED publishes:"
  diff <(echo "$expected") <(echo "$counted") | sed 's/^/    /' | head -20
  echo "  The model would build fine and under-report. Regenerate the list."
  exit 1
fi

if [ "$declared" != "$expected" ]; then
  echo "✗ mart_atlas_inventory's depends_on list does not match $SEED:"
  diff <(echo "$expected") <(echo "$declared") | sed 's/^/    /' | head -20
  echo "  < missing from the model   > declared but not published"
  echo "  The model counts what it declares. A missing hint means it may build"
  echo "  before that mart and report 0 rows for it."
  exit 1
fi

echo "  ✓ mart_atlas_inventory declares AND counts all $(echo "$expected" | wc -l | tr -d ' ') published marts (itself correctly excluded)"
