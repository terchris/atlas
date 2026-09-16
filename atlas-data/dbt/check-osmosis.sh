#!/usr/bin/env bash
# check-osmosis.sh — verify schema.yml hygiene (strict gate + lenient report).
#
# Canonical guide: website/docs/contributors/check-osmosis.md
# Sister guide:    website/docs/contributors/dbt-osmosis.md
#
# Usage:
#   ./check-osmosis.sh                — strict + lenient report
#   ./check-osmosis.sh --strict-only  — just the strict check (CI-friendly)
#
# Exit: 0 documented · 1 descriptions missing · 2 COULD NOT CHECK (see below).
#
# ⚠️ NOTHING RUNS THIS AUTOMATICALLY. It is not wired into CI or the image build,
# so it gates nothing on its own — a developer has to run it. CLAUDE.md claimed
# it "enforces" documentation repo-wide until 2026-09-16; it does not, and that
# claim is corrected there. Wiring it up is open work: it needs dbt-osmosis
# installed in CI, and whether `--check` can run without a live database has not
# been established.

set -euo pipefail
cd "$(dirname "$0")"

STRICT_ONLY=false
[[ "${1:-}" == "--strict-only" ]] && STRICT_ONLY=true

# ── Exit codes ───────────────────────────────────────────────────────────
#
# 🔴 THIS SCRIPT USED TO SAY "project has missing descriptions" WHATEVER WENT
# WRONG, AND THAT SENTENCE POINTED AT THE SCHEMA FILES FOR FAULTS THAT WERE NOT
# THERE (urb-agents #1039).
#
# It ran the check with `>/dev/null 2>&1` and branched on the exit status alone,
# so an uninstalled dbt-osmosis, a missing `../ingest/.env` and a genuinely
# undocumented column all produced the same verdict. On 2026-09-16 the same
# commit reported `✓ all columns documented` in a checkout that had the README's
# .venv and `✗ project has missing descriptions` in a clean one — opposite
# verdicts, and the ✗ had nothing to do with descriptions. The real error,
# unmasked, was `No environment file found at: ../ingest/.env`, a file that is
# gitignored and correctly absent from a fresh clone.
#
# ⚠️ This repo already owns the distinction: atlas-status.py documents
#     0 healthy · 1 looked and found fault · 2 could not look
# precisely so a broken check never reads as a finding. This gate collapsed them.
# Same scheme now, and the reason is checked BEFORE the verdict rather than
# guessed from its output — a signature match on an error string would be one
# more thing that rots when the tool rewords itself.
CANNOT=2

fail_cannot() {
  echo "  ⚠️ CANNOT CHECK — this is not a verdict about your schema.yml files."
  echo "     $1"
  echo
  echo "     Set up per atlas-data/dbt/README.md:"
  echo "       uv venv && uv pip install -r requirements.txt"
  exit "$CANNOT"
}

# ── Can we look at all? Established before anything is reported ──────────
command -v uv >/dev/null 2>&1 || fail_cannot "uv is not installed."

# `.env` carries the libpq vars profiles.yml interpolates. It is gitignored and
# absent from a fresh clone, so it is passed ONLY if it exists — its absence is
# not by itself a reason to refuse, because the vars may already be exported.
# ⚠️ `"${ENV_ARGS[@]}"` on an EMPTY array is an unbound-variable error under
# `set -u` in bash 3.2, which is what macOS ships and what most of this team
# runs. The `[@]+` form expands to nothing instead of exploding. Caught by
# running this script on a checkout with no .env — which is the case the whole
# change exists to handle, so it would have been an unusually embarrassing miss.
ENV_ARGS=()
[[ -f ../ingest/.env ]] && ENV_ARGS=(--env-file ../ingest/.env)

uv run ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} dbt-osmosis --version >/dev/null 2>&1 \
  || fail_cannot "dbt-osmosis could not be run (it is declared in requirements.txt; is the venv created and installed?)."

# ── Strict check: whole project must be fully documented ─────────────────
echo "→ strict check: every column in every schema.yml must have a description"
set +e
OUTPUT=$(uv run ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} dbt-osmosis yaml document --dry-run --check 2>&1)
RC=$?
set -e

# 🔴 A PASS THAT DISCOVERED NOTHING IS NOT A PASS, AND THIS IS THE DEFECT THAT
# MATTERED (found 2026-09-16 while testing the exit codes above).
#
# dbt-osmosis learns a model's columns by INTROSPECTING THE WAREHOUSE. Point it
# at a database that is not there and it logs
#
#     ⚠ Could not introspect columns for "…": 'NoneType' object has no attribute 'cursor'
#     🚫 No columns discovered for node => model.atlas.…
#
# discovers zero columns, finds nothing to document, and EXITS 0. The old script
# printed "✓ all columns documented" on the strength of that.
#
# ⚠️ Measured: with a placeholder connection, deleting a real column description
# from models/dimensions/schema.yml changed nothing — still ✓, still exit 0. The
# gate cannot fail while it cannot see, which is absence rendering as green, in
# the one script this repo points at when it claims its columns are documented.
#
# 🔵 This is a signature match on the tool's own wording and it will rot if
# dbt-osmosis rewords that warning. It is still right: the alternative is
# reporting a green that means nothing, and a gate that breaks loudly when the
# tool changes is better than one that passes silently when the database is
# absent. If it does rot, it rots INTO exit 2, not into a false pass.
if grep -q "Could not introspect columns" <<<"$OUTPUT"; then
  echo "  ⚠️ CANNOT CHECK — the warehouse could not be introspected, so"
  echo "     dbt-osmosis discovered NO columns and would have reported success"
  echo "     without checking anything."
  echo
  echo "     This check needs a reachable database holding the marts.* relations."
  echo "     A green result without one is meaningless, so it is refused."
  exit "$CANNOT"
fi

if [[ $RC -eq 0 ]]; then
  echo "  ✓ all columns documented"
else
  # 🔵 The tool ran and disagreed, so this IS a finding — and its own words are
  # printed rather than replaced with a guess at what it meant.
  echo "  ✗ project has missing descriptions"
  echo "    Re-run without --check to see what would change:"
  echo "    uv run ${ENV_ARGS[*]} dbt-osmosis yaml document --dry-run"
  echo
  echo "    dbt-osmosis said:"
  echo "$OUTPUT" | sed 's/^/      /' | tail -20
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
