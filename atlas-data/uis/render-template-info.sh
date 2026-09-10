#!/usr/bin/env bash
# render-template-info.sh <immutable-tag> <output-path>
#
# Substitutes __IMAGE_TAG__ in atlas-data/template-info.yaml and refuses to
# produce output that would fail late at install time.
#
# The checks exist because every one of them is a failure that is invisible
# until a cluster rejects it (or worse, accepts it):
#   - an unsubstituted placeholder is not in UIS's refused-tag list, so it would
#     pass validation and fail at image pull
#   - a mutable tag (latest/main/master/head) is refused by UIS, and Helm needs a
#     unique value to roll the code-location pod at all
#
# Run by CI on both paths: pull requests render with a synthetic tag and throw
# the result away; main renders with the real tag and publishes it.
set -euo pipefail

TAG="${1:-}"; OUT="${2:-}"
if [[ -z "$TAG" || -z "$OUT" ]]; then
  echo "usage: render-template-info.sh <v20260909-abc1234> <output-path>" >&2
  exit 2
fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/template-info.yaml"
[[ -f "$SRC" ]] || { echo "✗ not found: $SRC" >&2; exit 1; }

if [[ ! "$TAG" =~ ^v[0-9]{8}-[0-9a-f]{7}$ ]]; then
  echo "✗ tag '$TAG' is not the immutable v<date>-<sha> shape UIS requires" >&2
  exit 1
fi

# The placeholder must appear exactly once — on the `tag:` line. Substitution is
# a plain sed, so a second occurrence in prose gets rewritten too and the
# published artifact ends up carrying a comment that describes itself wrongly.
# That is exactly what shipped in v20260909-c1076cc.
OCCURRENCES=$(grep -c '__IMAGE_TAG__' "$SRC" || true)
if [[ "$OCCURRENCES" != "1" ]]; then
  echo "✗ placeholder appears ${OCCURRENCES}x in $(basename "$SRC") — expected exactly 1 (the tag: line)." >&2
  echo "  A second occurrence in prose would be substituted too. Reword the prose." >&2
  exit 1
fi

# Render via a temp file so that OUT == SRC is safe. `sed src > src` truncates
# src before sed reads it, and rendering in place is the natural thing for a
# caller to want — CI does exactly that.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sed "s|__IMAGE_TAG__|${TAG}|g" "$SRC" > "$TMP"

if grep -q '__IMAGE_TAG__' "$TMP"; then
  echo "✗ placeholder survived substitution" >&2; exit 1
fi
if ! grep -qE "^[[:space:]]+tag: ${TAG}\$" "$TMP"; then
  echo "✗ no 'tag: ${TAG}' line rendered — did the field move?" >&2; exit 1
fi
for mutable in latest main master head; do
  if grep -qE "^[[:space:]]+tag: ${mutable}\$" "$TMP"; then
    echo "✗ mutable tag '${mutable}' rendered" >&2; exit 1
  fi
done

cp "$TMP" "$OUT"

# Parse it if we can. Never silently skip — say which happened.
export ATLAS_DAGSTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../dagster/atlas_data" && pwd)"
if python3 -c 'import yaml' 2>/dev/null; then
  python3 - "$TMP" <<'PY'
import os, sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
svc = {s["service"]: s["config"] for s in d["provides"]["services"]}
assert d["kind"] == "application", d.get("kind")
# An absent id is legal but toothless: UIS refuses only a *conflicting* id, so
# without this a catalogue entry pointing at the wrong artifact goes unnoticed.
assert d.get("id") == "atlas", d.get("id")
assert svc["postgrest"]["schemas"] == "api_v1", svc["postgrest"]["schemas"]
assert svc["postgresql"]["init"] == "uis/init/001_bootstrap.sql", svc["postgresql"]["init"]
cl = svc["dagster"]["code_location"]
assert cl["module"] == "atlas_data.definitions", cl["module"]
assert cl["env_secrets"].endswith("-database-db"), cl["env_secrets"]

# The operational block duplicates facts that live in cadence.py and
# schedules.py. Duplication is the point — it has to travel in the artifact —
# so the drift it invites is closed here rather than by remembering.
import re, pathlib
root = pathlib.Path(os.environ["ATLAS_DAGSTER_DIR"])
cad = (root / "cadence.py").read_text()
sch = (root / "schedules.py").read_text()
code_crons = set(re.findall(r'^[A-Z_]*CRON\s*=\s*"([^"]+)"', cad, re.M))
code_crons |= set(re.findall(r'cron_schedule="([^"]+)"', sch))
op = d["operational"]
declared = {c["cron"] for c in op["cadence"]}
missing = declared - code_crons
assert not missing, f"cron in template-info.yaml not found in code: {sorted(missing)}"
unscheduled_code = set(re.findall(r'"([a-z-]+)"', re.search(r'UNSCHEDULED_SOURCES\s*=\s*\{([^}]*)\}', cad).group(1)))
assert set(op["unscheduled"]) == unscheduled_code, (op["unscheduled"], unscheduled_code)
tz = re.search(r'^TIMEZONE\s*=\s*"([^"]+)"', cad, re.M).group(1)
assert op["timezone"] == tz, (op["timezone"], tz)

# first_data names the jobs a user must launch to get data on day one. A renamed
# job would leave the artifact telling them to launch something that no longer
# exists — worse than saying nothing, because it looks authoritative.
code_jobs = set(re.findall(r'name="([a-z_]+)"', sch))
declared_jobs = set(op["first_data"]["jobs"])
missing_jobs = declared_jobs - code_jobs
assert not missing_jobs, f"first_data names jobs not defined in schedules.py: {sorted(missing_jobs)}"

# install.deploys must match the services the definition actually provides,
# or the summary promises a different cluster than the deploy performs.
declared_services = {x["service"] for x in d["provides"]["services"]}
assert set(op["install"]["deploys"]) == declared_services, (op["install"]["deploys"], declared_services)
print(f"  ✓ first_data jobs exist ({len(declared_jobs)}), install.deploys matches provides.services")
print(f"  ✓ operational block matches the code: {len(declared)} crons, "
      f"unscheduled={sorted(unscheduled_code)}, tz={tz}")

print("  ✓ parsed; schemas=api_v1, init=single file, env_secrets ends -database-db")
PY
else
  echo "  ! pyyaml unavailable — skipped the parse check (text checks still ran)"
fi

echo "✓ rendered ${OUT} at ${TAG}"
