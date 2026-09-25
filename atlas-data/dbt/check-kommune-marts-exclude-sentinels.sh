#!/usr/bin/env bash
#
# Every published relation whose grain is "one row per kommune" must exclude
# SSB's 9999 'Uoppgitt'.
#
# 🔴 WHY THIS EXISTS. Terje's decision on urb-agents #1301 (2026-09-21) was
# option B: dim_kommune KEEPS 9999, because Klass 131 publishes it and Atlas
# does not drop what SSB publishes, while the analytical marts exclude it
# because their grain is a municipality and 9999 is not one.
#
# The objection to that split is that it is a filter in five places instead of
# one, so a mart added later can forget. This is the answer to that objection.
# The list is DERIVED from the dbt manifest — every model in models/marts/api/
# documenting a kommune_nr column is checked, including ones not yet written.
#
# ⚠️ WHY A SHELL GATE AND NOT A dbt TEST. I wrote the dbt test first. It built
# its model list from `graph`, which is empty during parse, so it registered no
# ref() calls, so dbt inferred no parents, so dagster-dbt would have made no
# asset check from it and NOTHING WOULD HAVE RUN IT. That exact failure is
# already documented in assets/api_v1.py: "in the manifest and executed are two
# different things". A gate that cannot be forgotten beats a test that can.
#
# ⚠️ Static text matching, so it is a floor: it proves the filter is WRITTEN,
# not that it WORKS. What it catches is the failure this split introduces — a
# new mart that never considered the question.
#
# ⚠️ No `mapfile` (bash 4+; macOS ships 3.2) and no `mktemp -t` (BSD-only). The
# neighbouring gate shipped the latter and died on its first CI run.
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST=target/manifest.json
[ -f "$MANIFEST" ] || { echo "✗ CANNOT CHECK: no $MANIFEST — run 'dbt parse' first." >&2; exit 2; }

# Named with reasons, because a gate that is mostly exemptions is a list
# wearing a rule's clothes.
#   mart_dim_kommune             deliberately keeps it; it mirrors Klass 131
#   mart_unattributed_totals     reports the remainder; the sentinel is its
#                                subject, so filtering it would empty the view
#   mart_brreg_enhet             VERBATIM register mirror. Its grain is one row
#                                per organisation and kommune_nr is an
#                                attribute of that organisation, not the grain.
#                                Filtering it would curate Brreg's own register,
#                                which is the thing this repo does not do.
#   mart_distrikt_summary        grain is chapters. kommune_nr is a
#   mart_kommune_local_chapters  dim_postnummer lookup on a chapter's postal
#                                address and cannot be 9999.
#   mart_dim_postnummer          IT IS THE LOOKUP THE TWO ABOVE ARE EXEMPT FOR.
#                                Grain is one row per postal code; kommune_nr
#                                is the attribute, not the grain. Bring's
#                                register contains ZERO 9999 rows (counted in
#                                the seed, 2026-09-25) — so a filter here would
#                                remove nothing today, and on the day upstream
#                                did emit one it would silently DROP A POSTAL
#                                CODE from a register Atlas republishes
#                                verbatim. That is editing source data to
#                                satisfy a gate.
EXEMPT="mart_dim_kommune mart_unattributed_totals mart_brreg_enhet mart_distrikt_summary mart_kommune_local_chapters mart_dim_postnummer"

CANDIDATES="$(./.venv/bin/python -c '
import json, sys
m = json.load(open("target/manifest.json"))
for n in m["nodes"].values():
    if (n["resource_type"] == "model"
            and "/marts/api/" in n["original_file_path"]
            and "kommune_nr" in n.get("columns", {})):
        print(n["name"], n["original_file_path"])
')"

[ -n "$CANDIDATES" ] || { echo "✗ CANNOT CHECK: zero models matched — it would have passed without checking anything." >&2; exit 2; }

missing=""
checked=0
skipped=0
while IFS=' ' read -r name path; do
  [ -n "$name" ] || continue
  case " $EXEMPT " in *" $name "*) skipped=$((skipped+1)); continue ;; esac
  checked=$((checked+1))
  # A sentinel filter, a kommune_nr that is null by construction, or it reads a
  # relation that already filters. All three are stated in the file itself.
  if ! grep -qE "is_sentinel|region_code_to_kommune_nr|mart_kommune_ngo_summary|postal lookup" "$path"; then
    missing="${missing}    ${name}  (${path})
"
  fi
done <<CANDIDATE_LIST
$CANDIDATES
CANDIDATE_LIST

if [ -n "$missing" ]; then
  echo "✗ a published per-kommune relation does not exclude SSB's 9999 sentinel."
  echo "  Filter it, or add it to EXEMPT in this script WITH A REASON."
  printf '%s' "$missing"
  exit 1
fi

echo "✓ all ${checked} published per-kommune relations exclude the 9999 sentinel"
echo "  (${skipped} exempt by name and reason; list derived from the dbt manifest)"
