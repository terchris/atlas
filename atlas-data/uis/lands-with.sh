#!/usr/bin/env bash
#
# lands-with.sh — which Dagster job makes a change VISIBLE on the public API.
#
# 🔴 WHY THIS IS A SCRIPT AND NOT A LINE IN A DOCUMENT.
#
# The rule "a description change needs a publish" failed three times in eight
# days (urb-agents #1253, #1267, #1271), each time read by someone who had read
# it. ops-dev's diagnosis is the right one: a rule three readers fail to apply
# is not a knowledge problem, it is a missing field. But a field I have to
# remember to fill in is the same rule wearing a different hat — so this derives
# it from the diff instead. Paste its output into the pin nomination, beside the
# two labelled digests; see the nomination rules in
# website/docs/ai-developer/project-atlas.md.
#
# ⚠️ IT DELIBERATELY OVER-PRESCRIBES. Where it cannot tell whether the cheap job
# suffices, it names the expensive one. A wasted transform_and_publish costs
# minutes; a missed publish serves wrong documentation to the public API until
# someone notices by hand, which is what all three incidents were.
#
# Usage:  ./lands-with.sh [<rev-range>]     default: origin/main..HEAD
#         ./lands-with.sh 451b69f..646b68c
set -euo pipefail

RANGE="${1:-origin/main..HEAD}"
cd "$(dirname "$0")/../.."

if ! git rev-parse "$RANGE" >/dev/null 2>&1; then
  echo "lands-with.sh: '$RANGE' is not a range this repository knows" >&2
  exit 2
fi

FILES="$(git diff --name-only "$RANGE")"
if [ -z "$FILES" ]; then
  echo "LANDS WITH:  nothing — no files changed in $RANGE"
  exit 0
fi

# dbt build (which is what the transform asset runs) covers models, seeds,
# macros, tests and project config. Any of them can change what marts.* holds.
MODEL="$(grep -E '^atlas-data/dbt/(models/.*\.sql|seeds/|macros/|tests/|dbt_project\.yml|packages\.yml)' <<<"$FILES" || true)"
# schema.yml and the generated SQL carry descriptions and nothing else. They
# reach consumers through COMMENTs, which only the api_v1 asset applies.
DOCS="$(grep -E '^atlas-data/dbt/(models/.*schema\.yml|api_v1_generated\.sql)' <<<"$FILES" || true)"
# Python the image runs. Installing the image is the whole of the deploy.
# 🔵 dagster/ only. ingest/ USED TO BE IN HERE and that was the bug below.
IMAGE="$(grep -E '^atlas-data/(dagster/|atlas-status\.py)' <<<"$FILES" || true)"
# 🔴 INGEST IS NOT "INSTALL THE IMAGE AND YOU ARE DONE", AND THIS SCRIPT SAID
# IT WAS. An ingest change alters what a fetch RETURNS; it reaches raw.* only
# when the ingest actually RUNS. Installing the image changes nothing in the
# database.
#
# ⚠️ Measured on 2026-09-22 against ee3d4df..8990235 — a range whose entire
# content is the fhi-innvandrere KJONN fix, i.e. a source that had been
# failing with HTTP 400 for 8 days. This script answered:
#
#     LANDS WITH:
#       nothing — installing the image is the deploy
#                  (no marts or descriptions changed)
#
# 🔴 That is the "deploy silent" failure this script exists to PREVENT, emitted
# by the script itself. An operator following it would install the fix, run no
# ingest, and report a successful deploy over 8-day-old rows.
INGEST_DIRS="$(grep -oE '^atlas-data/ingest/src/sources/[a-z0-9][a-z0-9-]*/' <<<"$FILES" | sort -u || true)"
INGEST_IDS="$(sed -E 's|.*/sources/([^/]+)/|\1|' <<<"$INGEST_DIRS" | sort -u | tr '\n' ' ' | sed 's/ $//')"
INGEST_LIB="$(grep -E '^atlas-data/ingest/src/(lib|scripts)/' <<<"$FILES" || true)"
# 🔴 THE INSTALL DEFINITION, WHICH THIS SCRIPT USED TO CALL "nothing".
# template-info.yaml and uis/ are the UIS install artifact — what a catalogue
# reader sees and what `uis template install atlas` acts on. They reach nobody
# through a Dagster job, so the job-shaped question returns "nothing to run",
# and on 2026-09-21 I read that as "nothing to do" and told ops-dev a
# holdings-summary change landed with publish_api_v1. It lands with a pin.
ARTIFACT="$(grep -E '^atlas-data/(template-info\.yaml|uis/)' <<<"$FILES" || true)"

echo "LANDS WITH:"
if [ -n "$MODEL" ]; then
  echo "  uis dagster run transform_and_publish"
  echo "             (dbt build changed marts, and the publish re-creates the"
  echo "              api_v1 views over them — a publish alone would wrap the"
  echo "              old tables)"
elif [ -n "$DOCS" ]; then
  echo "  uis dagster run publish_api_v1"
  echo "             (descriptions only — COMMENTs live in the database, not the"
  echo "              image, and this is the only job that applies them)"
elif [ -n "$INGEST_IDS" ]; then
  echo "  an INGEST job, then transform_and_publish"
  echo "             (an ingest change only reaches raw.* when the ingest RUNS."
  echo "              Installing the image changes nothing in the database.)"
elif [ -n "$INGEST_LIB" ]; then
  echo "  an INGEST job for every source using the changed lib, then"
  echo "  transform_and_publish"
  echo "             (atlas-data/ingest/src/lib or scripts changed — this"
  echo "              script cannot tell which sources that affects. Say"
  echo "              explicitly which ones you expect to move.)"
elif [ -n "$IMAGE" ]; then
  echo "  nothing — installing the image is the deploy"
  echo "             (dagster asset code only; no marts, descriptions or"
  echo "              ingest changed)"
elif [ -n "$ARTIFACT" ]; then
  echo "  no Dagster job — this is the UIS INSTALL ARTIFACT"
  echo "             (template-info.yaml / uis/. It reaches a catalogue reader"
  echo "              through a published pin, not through a transform. Nominate"
  echo "              the tag; running a job changes nothing.)"
else
  echo "  nothing — no job makes this visible"
  echo "             (website, docs or CI only)"
fi

if [ -n "$ARTIFACT" ] && { [ -n "$MODEL" ] || [ -n "$DOCS" ]; }; then
  echo
  echo "  ⚠️ This range ALSO changes the install artifact (template-info.yaml"
  echo "     or uis/). The job above lands the data; the artifact needs a pin."
fi

if [ -n "$MODEL" ] && [ -n "$DOCS" ]; then
  echo
  echo "  ⚠️ This release changes BOTH models and descriptions. transform_and_publish"
  echo "     covers both; publish_api_v1 alone would leave the marts stale. This is"
  echo "     the shape of urb-agents #1271."
fi

# 🔴 The one change no job lands. dbt-postgres creates a model's `indexes:` when
# the TABLE is created, so on an incremental model they arrive on the next
# --full-refresh and not before — and no scheduled job passes --full-refresh.
# This is why the covering index in dim_brreg_enhet is a post-hook instead.
if git diff "$RANGE" -- 'atlas-data/dbt/models/**' | grep -qE '^\+.*indexes\s*=\s*\['; then
  echo
  echo "  🔴 An indexes= config changed. NO SCHEDULED JOB LANDS THIS on an"
  echo "     incremental model — dbt creates indexes when the table is created."
  echo "     It needs a --full-refresh, or the index belongs in a post-hook."
fi

# 🔴 THE SECOND CHANGE NO JOB LANDS: A SEED THAT GAINED OR LOST A COLUMN.
#
# dbt will NOT alter an existing seed table's schema on an ordinary build. It
# issues the insert against the table that is already there and Postgres
# refuses:
#
#     Database Error in seed api_v1_relations
#       column "stability" of relation "api_v1_relations" does not exist
#
# ⚠️ WHY THIS IS WORTH A CHECK RATHER THAN A MEMORY. It happened on 2026-09-25
# with `043b1ab`: `api_v1_relations` gained a `stability` column, the run died
# at node 44 of 143, and its four dependants -- mart_atlas_inventory,
# mart_meta_endpoints, mart_meta_sources, mart_indicator_summary -- were
# SKIPped, so the publish never ran. 🔵 Nothing was half-applied and consumers
# kept the previous release, which is the good failure mode; but it cost a
# deploy round, and the release had already passed every CI gate because CI
# builds against an EMPTY database where the column addition is invisible.
#
# 🔵 Only the HEADER matters. A seed whose rows changed is fine, and a seed
# added in this range is fine too -- dbt creates that table from scratch.
_lw_base="${RANGE%%..*}"
_lw_head="${RANGE##*..}"
[ -n "$_lw_base" ] || _lw_base="origin/main"
[ -n "$_lw_head" ] || _lw_head="HEAD"
_lw_seeds=""
for _lw_f in $(git diff --name-only "$RANGE" -- 'atlas-data/dbt/seeds/**/*.csv' 'atlas-data/dbt/seeds/*.csv' 2>/dev/null); do
  _lw_old="$(git show "$_lw_base:$_lw_f" 2>/dev/null | head -1 || true)"
  _lw_new="$(git show "$_lw_head:$_lw_f" 2>/dev/null | head -1 || true)"
  # Absent on either side = added or removed, not a schema change to an
  # existing table.
  [ -n "$_lw_old" ] && [ -n "$_lw_new" ] || continue
  if [ "$_lw_old" != "$_lw_new" ]; then
    _lw_name="$(basename "$_lw_f" .csv)"
    _lw_seeds="$_lw_seeds $_lw_name"
    echo
    echo "  🔴 SEED SCHEMA CHANGE — $_lw_name. NO SCHEDULED JOB LANDS THIS."
    echo "     before: $_lw_old"
    echo "     after:  $_lw_new"
    echo "     dbt cannot alter an existing seed table. transform_and_publish"
    echo "     WILL FAIL on it and SKIP everything downstream."
    echo "     Run ONCE, before the job:"
    echo "       dbt seed --select $_lw_name --full-refresh"
    echo "     Ordinary builds work again afterwards; it is not a standing flag."
  fi
done
unset _lw_base _lw_head _lw_f _lw_old _lw_new _lw_name _lw_seeds

# 🔴 TERJE'S RULE, 2026-09-21 (urb-agents #1349): a deploy is not successful
# until the data arrives. A release that adds or fixes a source is not landed
# until that source returns ROWS through a published relation — job status, a
# green suite and reachable relations are necessary and not sufficient.
#
# ⚠️ IT CAME FROM TWO RELEASES THAT PASSED EVERY CHECK. fhi-innvandrere:
# 32,720 rows ingested, one model, zero published. ssb-06913: 783,104 rows
# ingested, four relations wired, zero arriving, undetected for weeks. Both
# had transform SUCCESS, no test failures, shortfall 0, 19 of 19 answering.
#
# 🔵 "I cannot predict the count" is a valid and preferred answer. Omitting
# the source from the acceptance list is not. This section exists so omitting
# it has to be a decision rather than an oversight.
if [ -n "$INGEST_IDS" ]; then
  echo
  echo "  🔴 INGEST CHANGED — THESE SOURCES MUST BE RE-FETCHED BEFORE THE TRANSFORM:"
  PY=python3
  command -v "$PY" >/dev/null 2>&1 || PY="$(dirname "$0")/../dbt/.venv/bin/python"
  "$PY" - "$INGEST_IDS" <<'PYEOF'
import ast, pathlib, re, sys

dag = pathlib.Path("atlas-data/dagster/atlas_data")
if not (dag / "schedules.py").exists():
    print("    ⚠️ cannot resolve jobs — run from the repo root.")
    sys.exit(0)
schedules = (dag / "schedules.py").read_text()

def literal_lists(text):
    return {n: re.findall(r'"([^"]+)"', b)
            for n, b in re.findall(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[(.*?)\]',
                                   text, re.S | re.M)}

per_module = {}
for f in sorted((dag / "assets").glob("raw_*.py")):
    for n, ids in literal_lists(f.read_text()).items():
        if n.endswith("_SOURCES"):
            per_module[n] = ids
            per_module[f"{f.stem}.{n}"] = ids

sched = literal_lists(schedules)
for n, body in re.findall(r'^(_[A-Z_]+)\s*=\s*\[(.*?)\]', schedules, re.S | re.M):
    ids = []
    for ref in re.findall(r'\*([a-z_]+\.[A-Z_]+)', body):
        ids += per_module.get(ref, per_module.get(ref.split(".")[-1], []))
    ids += re.findall(r'^\s*"([^"]+)"', body, re.M)
    sched[n] = ids
for n, ref in re.findall(r'^(_[A-Z_]+)\s*=\s*list\(([a-z_]+\.[A-Z_]+)\)', schedules, re.M):
    sched[n] = list(per_module.get(ref, per_module.get(ref.split(".")[-1], [])))

jobs = {}
for name, sel in re.findall(
        r'name="([a-z_]+)",\s*\n(?:\s*tags=[^\n]*\n)?\s*selection=_asset_selection\(([^)]*)\)',
        schedules):
    sel = sel.strip()
    if sel.startswith("["):
        jobs[name] = set(re.findall(r'"([^"]+)"', sel))
    else:
        key = sel.split(".")[-1]
        jobs[name] = set(sched.get(sel, sched.get(key, per_module.get(key, []))))

for sid in sys.argv[1].split():
    covering = sorted(j for j, ids in jobs.items() if sid in ids)
    if covering:
        print(f"    {sid:24} -> uis dagster run {covering[0]}")
        if len(covering) > 1:
            print(f"    {'':24}    (also: {', '.join(covering[1:])})")
    else:
        print(f"    {sid:24} -> 🔴 NO NAMED JOB SELECTS THIS SOURCE. It is")
        print(f"    {'':24}    reachable only via __ASSET_JOB, which nobody")
        print(f"    {'':24}    thinks to run. Say how it will be fetched.")
    print(f"    {'':24}    state the expected row count, or say you cannot predict one")
PYEOF
fi

SOURCES_TOUCHED="$(grep -oE '^atlas-data/dbt/models/indicators/indicators__[a-z0-9_]+\.sql' <<<"$FILES" || true)"
if [ -n "$SOURCES_TOUCHED" ]; then
  echo
  echo "  ROW COUNTS REQUIRED IN THE DEPLOY REQUEST (urb-agents #1349):"
  PY=python3
  command -v "$PY" >/dev/null 2>&1 || PY="$(dirname "$0")/../dbt/.venv/bin/python"
  "$PY" - "$SOURCES_TOUCHED" <<'PYEOF'
import csv, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent if "__file__" in dir() else pathlib.Path(".")
dbt = pathlib.Path("atlas-data/dbt")
if not (dbt / "seeds/sources/lineage.csv").exists():
    dbt = pathlib.Path(".")
lineage, rel = dbt / "seeds/sources/lineage.csv", dbt / "seeds/sources/api_v1_relations.csv"
if not lineage.exists() or not rel.exists():
    print("    ⚠️ cannot resolve relations — run from the repo root.")
    sys.exit(0)
relations = {r["mart_name"]: r["relation_name"] for r in csv.DictReader(rel.open())}
by_source = {}
for r in csv.DictReader(lineage.open()):
    n = relations.get(r["model_name"])
    if n and not n.startswith("meta_"):
        by_source.setdefault(r["source_id"], set()).add(n)
for path in sys.argv[1].split():
    model = pathlib.Path(path).stem
    f = dbt / "models/indicators" / f"{model}.sql"
    ids = re.findall(r"'([a-z0-9][a-z0-9-]+)'::text\s+as\s+source_id", f.read_text()) if f.exists() else []
    for sid in ids or ["<source_id not found in " + model + ">"]:
        served = sorted(by_source.get(sid, []))
        if served:
            print(f"    {sid:24} -> {', '.join(served)}")
            print(f"    {'':24}    state an expected row count, or say you cannot predict one")
        else:
            print(f"    {sid:24} -> 🔴 NO PUBLISHED RELATION. This source will")
            print(f"    {'':24}    deploy SILENT. Either wire it or say in the")
            print(f"    {'':24}    request that it is deferred, with the reason.")
PYEOF
fi
