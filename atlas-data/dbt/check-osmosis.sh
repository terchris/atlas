#!/usr/bin/env bash
# check-osmosis.sh — verify schema.yml hygiene.
#
# As of PLAN-002 phase 6 (2026-04-28), the strict gate covers the WHOLE
# project — every column in every model + seed + source must have a
# description. New columns added without a description will fail this
# gate and block the PR.
#
# Two checks, both run by default:
#
# 1. STRICT — `dbt-osmosis yaml document --dry-run --check` across the
#    full project. Fails (exit 1) if any column in models/, seeds/, or
#    sources/ is missing a description.
#
# 2. LENIENT report — heuristic count of bare `data_type:` lines per
#    schema.yml. Useful as a trend signal but not authoritative; a
#    column with both `description:` and `data_type:` still gets
#    counted. Should report TOTAL = 0 when fully documented.
#
# Usage (run from atlas-data/dbt/):
#   ./check-osmosis.sh                — strict + lenient report
#   ./check-osmosis.sh --strict-only  — just the strict check (CI-friendly)
#
# Prerequisites: uv venv set up per atlas-data/dbt/README.md, ingest/.env
# present with PG* vars.

set -euo pipefail
cd "$(dirname "$0")"

STRICT_ONLY=false
[[ "${1:-}" == "--strict-only" ]] && STRICT_ONLY=true

# ── Strict check: whole project must be fully documented ─────────────────
echo "→ strict check: every column in every schema.yml must have a description"
if uv run --env-file ../ingest/.env dbt-osmosis yaml document \
     --dry-run --check >/dev/null 2>&1; then
  echo "  ✓ all columns documented"
else
  echo "  ✗ project has missing descriptions"
  echo "    Re-run without --check to see what would change:"
  echo "    uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run"
  exit 1
fi

# ── Lenient report: heuristic gap count per file ────────────────────────
[[ "$STRICT_ONLY" == "true" ]] && exit 0

echo
echo "→ backlog report (heuristic — bare data_type: lines per schema.yml)"
echo "  Should be 0 when fully documented; reports >0 if a new column"
echo "  was added without a description (the strict check above will"
echo "  also fail in that case)."
echo

total=0
for f in models/dimensions/schema.yml \
         models/indicators/schema.yml \
         models/marts/schema.yml \
         models/marts/api/schema.yml \
         models/private_marts/schema.yml \
         models/supply/schema.yml \
         seeds/schema.yml; do
  [[ -f "$f" ]] || continue
  n=$(grep -c "^        data_type:" "$f" 2>/dev/null) || n=0
  if [[ "$n" -gt 0 ]]; then
    printf "  %-50s %4d columns\n" "$f" "$n"
    total=$((total + n))
  fi
done

echo
printf "  %-50s %4d columns\n" "TOTAL" "$total"
