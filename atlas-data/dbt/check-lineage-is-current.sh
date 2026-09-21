#!/usr/bin/env bash
#
# seeds/sources/lineage.csv is GENERATED. This fails when the committed copy
# no longer matches what the dbt manifest says.
#
# 🔴 WHY THIS EXISTS. `lineage.csv` is produced by scripts/extract_lineage.py
# from target/manifest.json, committed, and read by `mart_meta_sources`
# (downstream_model_count, served_as) and `mart_meta_endpoints`. Nothing
# regenerated it and nothing checked it: the script was referenced by no gate
# and no workflow.
#
# ⚠️ MEASURED 2026-09-21: 247 edges committed, 350 in the manifest. 35 were
# missing before that day's work — the `brreg-oppdateringer` case, which
# served five models while reporting downstream_model_count = 0 — and 68 more
# were added by a change that made mart_meta_sources read the fact and did not
# regenerate. The author of that change shipped the field that depends on the
# seed and left the seed stale in the same commit (urb-agents #1348).
#
# 🔵 THE FAILURE IS SILENT AND LOOKS LIKE DATA. A missing edge makes a served
# source report as unserved, and a consumer cannot tell "this source reaches
# nothing" from "nobody re-ran a script". The demo consumer read this field
# twice in one day, got 9 and 1, and could not tell an honest value change
# from an accuracy correction.
#
# ⚠️ NEEDS `dbt parse` FIRST, because the manifest is the comparison basis.
# Without it there is nothing to compare against and this exits 2 rather than
# passing.
set -euo pipefail
cd "$(dirname "$0")"

[ -f target/manifest.json ] || {
  echo "✗ CANNOT CHECK: no target/manifest.json — run 'dbt parse' first." >&2
  exit 2
}

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp seeds/sources/lineage.csv "$TMP/lineage.before"
cp seeds/sources/lineage_direct.csv "$TMP/direct.before"

"$PY" scripts/extract_lineage.py >/dev/null 2>&1 || {
  cp "$TMP/lineage.before" seeds/sources/lineage.csv
  cp "$TMP/direct.before" seeds/sources/lineage_direct.csv
  echo "✗ CANNOT CHECK: extract_lineage.py failed." >&2
  exit 2
}
cp seeds/sources/lineage.csv "$TMP/lineage.after"
cp seeds/sources/lineage_direct.csv "$TMP/direct.after"
# Always restore: a gate must not edit the tree it is checking.
cp "$TMP/lineage.before" seeds/sources/lineage.csv
cp "$TMP/direct.before" seeds/sources/lineage_direct.csv

rc=0
for f in lineage direct; do
  if ! diff -q "$TMP/$f.before" "$TMP/$f.after" >/dev/null; then
    before=$(( $(wc -l < "$TMP/$f.before") - 1 ))
    after=$(( $(wc -l < "$TMP/$f.after") - 1 ))
    echo "✗ seeds/sources/${f/direct/lineage_direct}.csv is stale: "\
         "$before edges committed, $after in the manifest."
    diff "$TMP/$f.before" "$TMP/$f.after" | grep '^[<>]' | head -12
    n=$(diff "$TMP/$f.before" "$TMP/$f.after" | grep -c '^[<>]' || true)
    [ "$n" -gt 12 ] && echo "    ... and $((n - 12)) more lines"
    rc=1
  fi
done

if [ "$rc" -ne 0 ]; then
  echo "  Run: ./.venv/bin/python scripts/extract_lineage.py   and commit the result."
  echo "  ⚠️ A missing edge makes a SERVED source report as unserved, and a"
  echo "     consumer cannot tell that from the source genuinely serving nothing."
  exit 1
fi

edges=$(( $(wc -l < seeds/sources/lineage.csv) - 1 ))
echo "✓ the lineage seeds match the dbt manifest (${edges} edges)"
echo "  (regenerated and diffed, not inspected — the tree is left unchanged)"
