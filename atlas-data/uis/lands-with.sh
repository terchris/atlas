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
IMAGE="$(grep -E '^atlas-data/(dagster/|ingest/|atlas-status\.py)' <<<"$FILES" || true)"
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
elif [ -n "$IMAGE" ]; then
  echo "  nothing — installing the image is the deploy"
  echo "             (no marts or descriptions changed)"
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
