#!/usr/bin/env bash
#
# check-raw-is-read-only.sh — no dbt model, macro or test may WRITE to a source.
#
# 🔴 WHY THIS IS A GATE AND NOT A SENTENCE IN CLAUDE.md.
#
# Atlas republishes Norwegian public data — SSB, FHI, Brønnøysundregistrene,
# NLOD-licensed. The single property that makes it worth using is that a figure
# here is the figure upstream published: a consumer can check it and get the
# same number. Altering what we republish, or dropping part of it, destroys that
# and cannot be detected by anyone downstream.
#
# CLAUDE.md has said so since 2026-09-21. A rule in a file is a rule somebody
# has to read — and on 2026-09-20 this repo learned, three times in eight days,
# that a rule three readers failed to apply is a missing gate rather than a
# knowledge problem (urb-agents #1273). So this is the gate.
#
# WHAT IT ALLOWS, deliberately:
#   - DML against `{{ this }}` — a model managing its OWN output. dbt's
#     incremental materialisation is built on it, and dim_brreg_enhet uses it to
#     apply Brreg's own Sletting/Fjernet change feed. Deleting a row because
#     upstream says the unit is deleted is fidelity, not editing.
#   - derived columns computed however the model likes. `kommune_nr` is Atlas's
#     to get right; `region_code` and `value` are not Atlas's at all.
#
# WHAT IT REFUSES:
#   - any delete / update / insert / truncate / drop / alter naming a `raw.`
#     relation or a `source(...)` reference.
#
# ⚠️ It is static text matching, so it is a floor and not a proof: SQL built by
# string concatenation at runtime would pass. It catches the way someone would
# actually write it, which is the failure worth catching.
set -euo pipefail
cd "$(dirname "$0")"

DML='(delete[[:space:]]+from|update[[:space:]]|insert[[:space:]]+into|truncate|drop[[:space:]]+table|alter[[:space:]]+table)'
TARGET='(raw\.|\{\{[[:space:]]*source\()'

hits="$(grep -rniE "${DML}[^;]*${TARGET}" --include='*.sql' models/ macros/ tests/ seeds/ 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "✗ a dbt object writes to a SOURCE relation. Atlas republishes other"
  echo "  people's data and does not edit it — see CLAUDE.md."
  echo "$hits" | sed 's/^/    /'
  exit 1
fi

# Not a vacuous pass: prove the pattern can still fire.
probe="$(mktemp -t rawprobe)"
printf 'delete from raw.ssb_07459 where value is null;\n' > "$probe"
if ! grep -qniE "${DML}[^;]*${TARGET}" "$probe"; then
  echo "✗ CANNOT CHECK: the detector no longer matches a known-bad statement."
  echo "  It would have reported a clean project whatever the project contained."
  rm -f "$probe"; exit 2
fi
rm -f "$probe"

n=$(grep -rlniE "^[[:space:]]*(delete[[:space:]]+from|update[[:space:]])" --include='*.sql' models/ macros/ 2>/dev/null | wc -l | tr -d ' ')
echo "✓ no dbt object writes to a source relation"
echo "  (detector verified against a known-bad statement; ${n} file(s) contain DML, all against {{ this }})"
