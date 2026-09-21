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
