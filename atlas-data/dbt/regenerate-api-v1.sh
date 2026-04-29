#!/usr/bin/env bash
# regenerate-api-v1.sh — refresh the api_v1.* wrapper SQL from dbt's manifest.
#
# Run this after any change under models/marts/api/ (add / remove / column edit).
# The drift gate (atlas-data/dbt/check-api-v1.sh, lands in PLAN-004 phase 3)
# fails CI if the generated artefacts on disk are stale.
#
# Output paths are fixed:
#   atlas-data/dbt/api_v1_generated.sql   ← apply via apply-api-v1.sh after dbt run
#   atlas-data/dbt/api_v1_state.json      ← view-list snapshot for [Q17]
#
# This script PRODUCES the SQL; it does NOT apply it. The wrapper views
# reference marts.mart_* tables that only exist after `dbt run`, so applying
# is a separate step (apply-api-v1.sh) that runs after the dbt build.
# All emitted SQL is idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).
#
# Workflow: npm run migrate  →  npm run ingest:*  →  dbt run  →  apply-api-v1.sh
#
# Canonical guide: website/docs/contributors/api-v1.md (lands in PLAN-004 phase 6)

set -euo pipefail
cd "$(dirname "$0")"

uv run --env-file ../ingest/.env dbt parse >/dev/null

uv run python scripts/generate_api_v1.py \
  --manifest target/manifest.json \
  --models-dir-prefix models/marts/api/ \
  --state api_v1_state.json \
  --out api_v1_generated.sql
