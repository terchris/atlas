#!/usr/bin/env bash
# Every directory under atlas-data/ingest/src/sources/ is run by Dagster via
# `npm run ingest:<source_id>` (atlas_data/assets/_factory.py). That mapping
# is hand-maintained in package.json's `scripts` block — nothing generates it
# — so adding a source and forgetting the entry compiles, typechecks, passes
# every local test (which calls index.ts directly, not `npm run`), and only
# fails at RUNTIME, in the deployed pod, as `npm error Missing script:
# "ingest:<source_id>"`.
#
# 🔴 THIS IS NOT HYPOTHETICAL. husbanken-bostotte shipped exactly this way
# (PR #509, 2026-10-02): the module, tests and dbt layer were all real and
# all green; the npm script was the one line nobody ran locally, because
# every local check this project has invokes `tsx src/sources/<id>/index.ts`
# directly, same as this gate's own author did while validating the ingest.
# imac caught it on the real cluster — 40/41 sources succeeded, this one
# failed with the missing-script error, raw.husbanken_bostotte landed with
# zero rows, and the deploy had to be redone. This gate exists so the next
# one is caught before merge, not after a deploy.
#
# ⚠️ WHAT THIS DELIBERATELY DOES NOT CHECK: src/seed-sources/* uses a
# different prefix (`refresh:`, not `ingest:`) and a different invocation
# model (bootstrap.ts's seed phase, not Dagster's per-source ingest assets)
# — out of scope here, same boundary check-every-raw-table-has-a-producer.sh
# already draws between ingest/src and seed-sources.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC=atlas-data/ingest/src/sources
PKG=atlas-data/ingest/package.json
for f in "$SRC" "$PKG"; do [ -e "$f" ] || { echo "✗ CANNOT CHECK: no $f" >&2; exit 2; }; done

DIRS="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -u)"
[ -n "$DIRS" ] || { echo "✗ CANNOT CHECK: no source directories found under $SRC" >&2; exit 2; }

SCRIPTED="$(grep -oE '"ingest:[a-z0-9-]+":' "$PKG" | sed -E 's/"ingest:(.*)":/\1/' | sort -u)"
[ -n "$SCRIPTED" ] || { echo "✗ CANNOT CHECK: no ingest:* scripts parsed from $PKG — the pattern stopped matching." >&2; exit 2; }

# Known-bad probe: the check must be able to go red. Prove it in-process
# rather than trusting that it would.
PROBE="zz_probe_source_with_no_npm_script"
if ! printf '%s\n' "$DIRS" "$PROBE" | sort -u | comm -23 - <(printf '%s\n' "$SCRIPTED") | grep -qx "$PROBE"; then
  echo "✗ CANNOT CHECK: the probe source did not register as missing — this checker cannot detect an unscripted source" >&2
  exit 2
fi

MISSING="$(comm -23 <(printf '%s\n' "$DIRS") <(printf '%s\n' "$SCRIPTED"))"
if [ -n "$MISSING" ]; then
  echo "✗ source director(ies) under $SRC have no matching ingest:<id> script in $PKG:"
  printf '    %s\n' $MISSING
  echo "  Dagster calls \`npm run ingest:<source_id>\` (atlas_data/assets/_factory.py) — this will"
  echo "  fail at deploy time with \"npm error Missing script\", not in any local test."
  exit 1
fi

echo "✓ all $(printf '%s\n' "$DIRS" | wc -l | tr -d ' ') ingest source directories have a matching ingest:<id> npm script"
echo "  (verified against a known-bad probe)"
