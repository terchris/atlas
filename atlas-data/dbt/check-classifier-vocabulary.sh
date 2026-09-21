#!/usr/bin/env bash
#
# Every value classify_region_code can emit must exist in ref_region_kind.
#
# 🔴 WHY. I wrote an `else 'unknown'` branch into the classifier — deliberately,
# so a new upstream code shape would be visible rather than quietly becoming a
# municipality — and never added `unknown` to the seed it is tested against.
# The first time the dbt check suite ran, the relationships test failed on
# 24,178 rows across ten models (urb-agents #1313).
#
# ⚠️ Nothing reached a consumer: every `unknown` row carries a null kommune_nr.
# The cost was a nightly suite that would have been red indefinitely, because
# `transform_and_publish` runs `dbt build --exclude-resource-type test` and the
# green PASS count everyone quotes does not include tests.
#
# A relationships test already asserts this — against the DATABASE, in a job
# nobody watches. This asserts it against the FILES, in CI, before merge.
set -euo pipefail
cd "$(dirname "$0")"

MACRO=macros/classify_region_code.sql
SEED=seeds/ref_region_kind.csv
for f in "$MACRO" "$SEED"; do [ -f "$f" ] || { echo "✗ CANNOT CHECK: no $f" >&2; exit 2; }; done

EMITTED="$(grep -oE "(then|else) '[a-z_]+'" "$MACRO" | grep -oE "'[a-z_]+'" | tr -d "'" | sort -u)"
VOCAB="$(tail -n +2 "$SEED" | cut -d, -f1 | sort -u)"

[ -n "$EMITTED" ] || { echo "✗ CANNOT CHECK: no emitted values parsed from $MACRO — the pattern stopped matching." >&2; exit 2; }
[ -n "$VOCAB" ]   || { echo "✗ CANNOT CHECK: no members parsed from $SEED." >&2; exit 2; }

MISSING="$(comm -23 <(printf '%s\n' "$EMITTED") <(printf '%s\n' "$VOCAB"))"
if [ -n "$MISSING" ]; then
  echo "✗ classify_region_code emits a value that is not in ref_region_kind."
  echo "  Every relationships test on region_kind will fail against the database."
  printf '    %s\n' $MISSING
  exit 1
fi

echo "✓ all $(printf '%s\n' "$EMITTED" | wc -l | tr -d ' ') classifier values exist in ref_region_kind"
