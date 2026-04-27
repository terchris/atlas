#!/usr/bin/env bash
# check-osmosis.sh — verify schema.yml hygiene per PLAN-001.
#
# Two modes, both run:
#
# 1. STRICT on models/marts/api/ — fails (exit 1) if any column in any
#    mart_<feature> view is missing a description. The new mart_* views
#    landed via PLAN-001 must be fully documented (per its [Q5] resolution)
#    because they are the public OpenAPI surface.
#
# 2. LENIENT report on existing models — prints the count of columns with
#    bare data_type entries (no description) per file. These are pre-existing
#    gaps surfaced by the initial dbt-osmosis baseline run; tracked for
#    incremental fixing in:
#    docs/ai-developer/plans/backlog/PLAN-002-fill-schema-yml-description-gaps.md
#
# Usage (run from atlas-data/dbt/):
#   ./check-osmosis.sh             — strict + report
#   ./check-osmosis.sh --strict-only  — just the strict check (CI-friendly)
#
# Prerequisites: uv venv set up per atlas-data/dbt/README.md, ingest/.env
# present with PG* vars.

set -euo pipefail
cd "$(dirname "$0")"

STRICT_ONLY=false
[[ "${1:-}" == "--strict-only" ]] && STRICT_ONLY=true

# ── Strict check: models/marts/api/ must be fully documented ─────────────
if [[ -d models/marts/api ]]; then
  echo "→ strict check: models/marts/api/ (PLAN-001 mart_* views)"
  if uv run --env-file ../ingest/.env dbt-osmosis yaml document \
       --dry-run --check -f marts.api. >/dev/null 2>&1; then
    echo "  ✓ all marts/api/ columns documented"
  else
    echo "  ✗ marts/api/ has missing descriptions"
    echo "    Re-run without --check to see what would change:"
    echo "    uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run -f marts.api."
    exit 1
  fi
else
  echo "→ strict check: models/marts/api/ does not exist yet (skipping)"
fi

# ── Lenient report: existing schema.yml gap count ────────────────────────
[[ "$STRICT_ONLY" == "true" ]] && exit 0

echo
echo "→ backlog report: pre-existing undocumented columns"
echo "  (tracked in docs/ai-developer/plans/backlog/PLAN-002-fill-schema-yml-description-gaps.md)"
echo

total=0
for f in models/dimensions/schema.yml \
         models/indicators/schema.yml \
         models/marts/schema.yml \
         models/private_marts/schema.yml \
         models/supply/schema.yml \
         seeds/schema.yml; do
  [[ -f "$f" ]] || continue
  # Heuristic: dbt-osmosis adds bare `data_type:` entries for columns it
  # discovered in the warehouse but were never documented in schema.yml.
  # Counting those lines approximates the gap. Imperfect (a column with
  # both data_type and description still gets counted) but useful as a
  # trend signal.
  n=$(grep -c "^        data_type:" "$f" 2>/dev/null) || n=0
  if [[ "$n" -gt 0 ]]; then
    printf "  %-50s %4d columns\n" "$f" "$n"
    total=$((total + n))
  fi
done

echo
printf "  %-50s %4d columns\n" "TOTAL" "$total"
echo
echo "  Pick one schema.yml at a time and fill descriptions; re-run to track progress."
