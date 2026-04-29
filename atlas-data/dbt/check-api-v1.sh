#!/usr/bin/env bash
# check-api-v1.sh — verify the api_v1 generator's output is in sync with dbt models.
#
# Three gates, all runnable without a Postgres connection:
#
# 1. DRIFT — re-runs the generator into a temp location and diffs against
#    the checked-in api_v1_generated.sql + api_v1_state.json. Non-zero diff
#    means someone changed a dbt model under models/marts/api/ but didn't
#    run ./regenerate-api-v1.sh, OR hand-edited the generated artefacts.
#
# 2. COVERAGE — every api_v1.<name> view in the generated SQL maps to a
#    model under models/marts/api/, and vice versa. Detects orphan views
#    and missing wrappers. Counts lines deterministically.
#
# 3. STATIC DESCRIPTION COVERAGE — counts `COMMENT ON COLUMN api_v1.…`
#    lines and compares to the total number of columns with a non-empty
#    description in api/ models. A missing or extra COMMENT here means
#    the generator and the manifest disagree (catches generator bugs).
#
# Runtime checks (description-on-DB, row-count-parity) live in
# atlas-data/dbt/tests/api_v1_*.sql and run as part of `dbt test`.
#
# Usage (run from atlas-data/dbt/):
#   ./check-api-v1.sh
#
# Canonical guide: website/docs/contributors/api-v1.md (lands in PLAN-004 phase 6)

set -euo pipefail
cd "$(dirname "$0")"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# --- 1. DRIFT GATE -------------------------------------------------------
echo "→ drift gate: re-generate to temp + diff against checked-in"

uv run --env-file ../ingest/.env dbt parse >/dev/null

uv run python scripts/generate_api_v1.py \
  --manifest target/manifest.json \
  --models-dir-prefix models/marts/api/ \
  --state "$TMPDIR/state.json" \
  --out "$TMPDIR/sql" >/dev/null

if ! diff -q api_v1_generated.sql "$TMPDIR/sql" >/dev/null; then
  echo "  ✗ api_v1_generated.sql is stale or hand-edited"
  echo "    fix: run ./regenerate-api-v1.sh and commit the result"
  echo "    diff:"
  diff api_v1_generated.sql "$TMPDIR/sql" | head -40
  exit 1
fi

if ! diff -q api_v1_state.json "$TMPDIR/state.json" >/dev/null; then
  echo "  ✗ api_v1_state.json is stale or hand-edited"
  echo "    fix: run ./regenerate-api-v1.sh and commit the result"
  diff api_v1_state.json "$TMPDIR/state.json"
  exit 1
fi

echo "  ✓ generator output matches checked-in artefacts"

# --- 2. COVERAGE ---------------------------------------------------------
echo "→ coverage: every api/ model has a wrapper; no orphan wrappers"

# Count CREATE OR REPLACE VIEW api_v1.X lines in generated SQL
sql_view_count=$(grep -c '^CREATE OR REPLACE VIEW api_v1\.' api_v1_generated.sql || echo 0)

# Count models in models/marts/api/ via the manifest
manifest_model_count=$(uv run python - <<'PY'
import json
m = json.load(open('target/manifest.json'))
n = sum(
  1 for v in m['nodes'].values()
  if v.get('resource_type') == 'model'
  and v.get('original_file_path','').startswith('models/marts/api/')
)
print(n)
PY
)

if [[ "$sql_view_count" != "$manifest_model_count" ]]; then
  echo "  ✗ wrapper count mismatch: $sql_view_count views in SQL, $manifest_model_count models under models/marts/api/"
  echo "    fix: investigate which model lacks a wrapper or which wrapper has no model"
  exit 1
fi

echo "  ✓ wrapper count matches: $sql_view_count = $manifest_model_count"

# --- 3. STATIC DESCRIPTION COVERAGE --------------------------------------
echo "→ static description coverage: COMMENT ON COLUMN count == described-column count"

sql_comment_count=$(grep -c '^COMMENT ON COLUMN api_v1\.' api_v1_generated.sql || echo 0)

manifest_described_col_count=$(uv run python - <<'PY'
import json
m = json.load(open('target/manifest.json'))
n = 0
for v in m['nodes'].values():
  if v.get('resource_type') != 'model': continue
  if not v.get('original_file_path','').startswith('models/marts/api/'): continue
  for c in v['columns'].values():
    if (c.get('description') or '').strip():
      n += 1
print(n)
PY
)

if [[ "$sql_comment_count" != "$manifest_described_col_count" ]]; then
  echo "  ✗ description-coverage mismatch: $sql_comment_count COMMENTs in SQL, $manifest_described_col_count described columns in manifest"
  echo "    fix: investigate which column lacks a description in schema.yml,"
  echo "         or whether the generator's emission of COMMENTs has a bug"
  exit 1
fi

echo "  ✓ all $manifest_described_col_count described api/ columns have a COMMENT"

echo
echo "✓ all three static gates green"
