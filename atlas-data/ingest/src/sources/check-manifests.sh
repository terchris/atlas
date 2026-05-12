#!/usr/bin/env bash
# check-manifests.sh — verify source manifest hygiene (schema + cross-file).
#
# Canonical guide: website/docs/contributors/check-manifests.md
# Sister gate:     atlas-data/dbt/check-osmosis.sh
#
# Usage:
#   ./check-manifests.sh                — full check (schema + cross-file)
#   ./check-manifests.sh --strict-only  — schema-only (skips cross-file warnings)
#
# What this catches:
#   - manifest.yml shape violations (missing required fields, wrong types, bad enums)
#   - tags.topic values that don't resolve to source-categories.yaml entries
#   - publisher values that don't resolve to publishers.yaml entries
#
# Exit codes match the validator: 0 OK, 1 validation failure, 2 internal error.

set -euo pipefail
cd "$(dirname "$0")"

STRICT_ONLY=false
[[ "${1:-}" == "--strict-only" ]] && STRICT_ONLY=true

# Resolve repo root so we can invoke tsx via the workspace's binary.
# This script lives at: atlas-data/ingest/src/sources/check-manifests.sh
# Workspace tsx lives at: atlas-data/ingest/node_modules/.bin/tsx
INGEST_ROOT="$(cd ../.. && pwd)"
TSX="$INGEST_ROOT/node_modules/.bin/tsx"

if [[ ! -x "$TSX" ]]; then
  echo "✗ tsx not found at $TSX"
  echo "  Run 'npm install' under atlas-data/ingest first."
  exit 2
fi

if [[ "$STRICT_ONLY" == "true" ]]; then
  # Strict-only mode: still runs cross-file checks because the validator
  # always runs both — but suppresses the ⚠ "companion file missing"
  # warnings via grep so CI output stays clean when those files don't
  # exist yet. Real schema and cross-file *errors* still surface.
  "$TSX" validate-manifests.ts 2>&1 | grep -v "^  ⚠"
  exit "${PIPESTATUS[0]}"
fi

"$TSX" validate-manifests.ts
