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

TAG="${1:-}"; OUT="${2:-}"; DIGEST="${3:-}"
if [[ -z "$TAG" || -z "$OUT" ]]; then
  echo "usage: render-template-info.sh <v20260909-abc1234> <output-path> [sha256:<64 hex>]" >&2
  exit 2
fi

# The image digest is optional at the INTERFACE and mandatory on the PUBLISH
# path — the PR path renders with a synthetic tag against an image that was
# never pushed, so there is no digest to declare and inventing one would put a
# plausible-looking lie through every gate below.
#
# A caller that omits it gets a synthetic placeholder that is REFUSED by UIS if
# it ever reached a cluster, rather than a value that looks real. The workflow
# passes the real one on main; see the `digest:` comment in template-info.yaml.
if [[ -z "$DIGEST" ]]; then
  DIGEST="sha256:0000000000000000000000000000000000000000000000000000000000000000"
  echo "  ! no image digest supplied — rendering the all-zero placeholder (PR path)" >&2
fi

if [[ ! "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "✗ digest '$DIGEST' is not sha256:<64 lowercase hex>" >&2
  exit 1
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

# Same rule, same reason, for the digest placeholder. The prose explaining the
# digest field is long, which makes an accidental second mention of the token
# more likely here than it was for the tag — and the tag is the one that already
# shipped wrong once (v20260909-c1076cc).
DIGEST_OCCURRENCES=$(grep -c '__IMAGE_DIGEST__' "$SRC" || true)
if [[ "$DIGEST_OCCURRENCES" != "1" ]]; then
  echo "✗ digest placeholder appears ${DIGEST_OCCURRENCES}x in $(basename "$SRC") — expected exactly 1 (the digest: line)." >&2
  echo "  A second occurrence in prose would be substituted too. Reword the prose." >&2
  exit 1
fi

# Render via a temp file so that OUT == SRC is safe. `sed src > src` truncates
# src before sed reads it, and rendering in place is the natural thing for a
# caller to want — CI does exactly that.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|__IMAGE_TAG__|${TAG}|g" -e "s|__IMAGE_DIGEST__|${DIGEST}|g" "$SRC" > "$TMP"

# An unquoted YAML scalar containing " #" is truncated at the hash — silently,
# with no error, and the parse still succeeds. It ate the `measured:` figures in
# v20260910-6429719 and v20260910-4e9f13c, and was invisible until someone read
# the published artifact rather than the source. Everything Atlas publishes cites
# urb-agents issue numbers, so this is a hazard the file invites.
if HAZARD=$(grep -nE '^[[:space:]]+[a-z_]+:[[:space:]]+[^"'"'"'|>&*[:space:]][^"'"'"']*[[:space:]]#' "$SRC"); then
  echo "✗ unquoted YAML value containing ' #' — everything after the hash is a comment" >&2
  echo "$HAZARD" | sed 's/^/    /' >&2
  echo "  Quote the value. The parse will succeed either way; the text just vanishes." >&2
  exit 1
fi

if grep -q '__IMAGE_TAG__' "$TMP"; then
  echo "✗ placeholder survived substitution" >&2; exit 1
fi
if grep -q '__IMAGE_DIGEST__' "$TMP"; then
  echo "✗ digest placeholder survived substitution" >&2; exit 1
fi
if ! grep -qE "^[[:space:]]+tag: ${TAG}\$" "$TMP"; then
  echo "✗ no 'tag: ${TAG}' line rendered — did the field move?" >&2; exit 1
fi
if ! grep -qE "^[[:space:]]+digest: ${DIGEST}\$" "$TMP"; then
  echo "✗ no 'digest: ${DIGEST}' line rendered — did the field move?" >&2; exit 1
fi
for mutable in latest main master head; do
  if grep -qE "^[[:space:]]+tag: ${mutable}\$" "$TMP"; then
    echo "✗ mutable tag '${mutable}' rendered" >&2; exit 1
  fi
done

# ── Table counts must agree with each other and with the migrations ──────────
#
# urb-agents #824. This file carried the row/table summary TWICE — once in
# `first_data.takes`, once in `install.first_load` — and the two disagreed:
# "48 raw and 60 marts tables" against "48 raw and 64 marts tables", twelve
# lines apart on the same `uis template info` screen. Both `marts` figures were
# wrong, and the `raw` figure was wrong in BOTH, out by four in a number nobody
# had looked at in three threads.
#
# 🔴 The defect was not a stale number. imac's framing, which is the reason this
# check exists at all: "two strings in one artifact disagree with each other AND
# both disagree with the database, and the method that reconciles them is not
# written down anywhere." An unstated counting rule makes every figure in the
# sentence uncheckable — including by the agent writing it.
#
# ⚠️ It only became operator-visible when UIS 1.6.69 started rendering
# `install.first_load`. Before that, one of the two contradicting numbers reached
# nobody. The renderer did not cause the defect; it stopped hiding it.
#
# What is checked here, and what deliberately is not:
#   - every `N raw` figure in the file is the SAME N, and equals the number of
#     distinct `create table raw.*` statements in atlas-data/migrations
#   - every `M marts` figure is the SAME M
#   - the counting rule is present in prose
#
# ⚠️ The marts figure is NOT recomputed here, and that is a limit rather than an
# oversight: it needs dbt's manifest, which is built from a database connection
# and does not exist on the CI path that runs this script. Checking agreement and
# provenance is what can be done without one; template-info.yaml carries the
# one-line command to recompute it where a manifest does exist.
MIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../migrations" && pwd)"
RAW_ACTUAL=$(grep -rhoiE 'create table (if not exists )?raw\.[a-z0-9_]+' "$MIG_DIR"/*.sql \
             | grep -oiE 'raw\.[a-z0-9_]+' | tr 'A-Z' 'a-z' | sort -u | wc -l | tr -d ' ')

# The claim has ONE canonical spelling so it can be matched exactly: "<N> raw
# BASE TABLEs" and "<M> marts BASE TABLEs". Views are stated separately and are
# deliberately not matched here — an earlier draft of this check used the looser
# `[0-9]+ marts` and tripped on its own "(plus 5 marts views)", reporting a
# disagreement between a table count and a view count. A pattern loose enough to
# match two different quantities cannot tell you they disagree.
RAW_CLAIMS=$(grep -oE '[0-9]+ raw BASE TABLEs' "$TMP" | grep -oE '^[0-9]+' | sort -u)
MARTS_CLAIMS=$(grep -oE '[0-9]+ marts BASE TABLEs' "$TMP" | grep -oE '^[0-9]+' | sort -u)

if [[ -z "$RAW_CLAIMS" || -z "$MARTS_CLAIMS" ]]; then
  echo "✗ no 'N raw' / 'M marts' table counts found in the rendered artifact" >&2
  echo "  Both install.first_load and first_data.takes are expected to state them." >&2
  exit 1
fi

if [[ $(wc -l <<< "$RAW_CLAIMS") -ne 1 ]]; then
  echo "✗ the artifact states more than one 'raw' table count: $(tr '\n' ' ' <<< "$RAW_CLAIMS")" >&2
  echo "  Two strings on one screen disagreeing is the #824 defect. Make them agree." >&2
  exit 1
fi

if [[ $(wc -l <<< "$MARTS_CLAIMS") -ne 1 ]]; then
  echo "✗ the artifact states more than one 'marts' table count: $(tr '\n' ' ' <<< "$MARTS_CLAIMS")" >&2
  echo "  Two strings on one screen disagreeing is the #824 defect. Make them agree." >&2
  exit 1
fi

if [[ "$RAW_CLAIMS" != "$RAW_ACTUAL" ]]; then
  echo "✗ the artifact claims ${RAW_CLAIMS} raw tables; atlas-data/migrations creates ${RAW_ACTUAL}" >&2
  echo "  Counting rule: distinct 'create table raw.<name>' across migrations/*.sql." >&2
  exit 1
fi

if ! grep -q 'COUNTING RULE' "$TMP"; then
  echo "✗ the table counts are stated without the counting rule beside them" >&2
  echo "  A figure whose method is unwritten cannot be checked by anyone. See #824." >&2
  exit 1
fi
echo "  ✓ table counts agree (${RAW_CLAIMS} raw = migrations, ${MARTS_CLAIMS} marts stated once) and the rule is stated"

cp "$TMP" "$OUT"

# Parse it if we can. Never silently skip — say which happened.
export ATLAS_DAGSTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../dagster/atlas_data" && pwd)"
export ATLAS_JOBS_OUT="$(mktemp)"
if python3 -c 'import yaml' 2>/dev/null; then
  python3 - "$TMP" <<'PY'
import os, re, sys, yaml
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
# The digest must parse as a digest. A YAML scalar that lost its prefix, or a
# quoted-then-truncated value, would otherwise reach a cluster looking plausible.
assert re.fullmatch(r"sha256:[0-9a-f]{64}", str(cl["digest"])), cl["digest"]
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

# Defined is not live. SCRAPER_CRON existed as a constant long after its only
# consumer (redcross-branches) was parked, so the block advertised a Sunday
# 03:30 poll that nothing performs. Same shape as the first_data existence check
# imac caught on #507: the easy property, not the promised one.
#
# A cron is live if either an asset uses the builder that wraps it, or it is a
# ScheduleDefinition's own cron_schedule.
asset_src = "\n".join(p.read_text() for p in sorted((root / "assets").glob("*.py")))
builder_of = dict(re.findall(
    r'def ([a-z_]+)\(\) -> AutomationCondition:\s*\n\s*return AutomationCondition\.on_cron\(\s*([A-Z_]+)',
    cad))
live = set(re.findall(r'cron_schedule="([^"]+)"', sch))
const_value = dict(re.findall(r'^([A-Z_]*CRON)\s*=\s*"([^"]+)"', cad, re.M))
# A ScheduleDefinition may reference the constant instead of repeating the
# literal — `cron_schedule=cadence.BRREG_TRANSFORM_CRON`. That is the BETTER
# spelling, because duplicating the cron into schedules.py is exactly the drift
# this gate exists to catch. Resolve it rather than forcing the duplication.
for const in re.findall(r'cron_schedule=cadence\.([A-Z_]+)', sch):
    if const not in const_value:
        sys.exit(f"✗ schedules.py references cadence.{const}, which is not a "
                 f"cron constant in cadence.py")
    live.add(const_value[const])
for builder, const in builder_of.items():
    if re.search(rf'\b{builder}\(\)', asset_src):
        live.add(const_value[const])
dead = declared - live
assert not dead, (
    f"cron declared in operational.cadence but nothing uses it: {sorted(dead)}. "
    "The constant exists; no asset carries the condition and no schedule runs it. "
    "Remove the row, or wire the condition back up."
)
unscheduled_code = set(re.findall(r'"([a-z-]+)"', re.search(r'UNSCHEDULED_SOURCES\s*=\s*\{([^}]*)\}', cad).group(1)))
assert set(op["unscheduled"]) == unscheduled_code, (op["unscheduled"], unscheduled_code)
tz = re.search(r'^TIMEZONE\s*=\s*"([^"]+)"', cad, re.M).group(1)
assert op["timezone"] == tz, (op["timezone"], tz)

# first_data names the jobs a user must launch to get data on day one. A renamed
# job would leave the artifact telling them to launch something that no longer
# exists — worse than saying nothing, because it looks authoritative.
code_jobs = set(re.findall(r'name="([a-z_]+)"', sch))

# Every cadence row names the job that owns it, and the name must be real.
# The field exists because two agents read four Brreg crons as one job and one
# costed a public-API outage at 48x its rate (urb-agents #780, #786). A field
# added to prevent a misreading that is itself allowed to go stale would be
# worse than not having it.
cadence_jobs = {c.get("job") for c in op["cadence"]}
missing_job = {j for j in cadence_jobs if j is None}
assert not missing_job, "every operational.cadence row must name its `job:`"
unknown_cadence_jobs = cadence_jobs - code_jobs
assert not unknown_cadence_jobs, (
    f"operational.cadence names jobs not defined in schedules.py: "
    f"{sorted(unknown_cadence_jobs)}"
)

declared_jobs = set(op["first_data"]["jobs"])
missing_jobs = declared_jobs - code_jobs
assert not missing_jobs, f"first_data names jobs not defined in schedules.py: {sorted(missing_jobs)}"

# install.deploys must match the services the definition actually provides,
# or the summary promises a different cluster than the deploy performs.
declared_services = {x["service"] for x in d["provides"]["services"]}
assert set(op["install"]["deploys"]) == declared_services, (op["install"]["deploys"], declared_services)
print(f"  ✓ first_data jobs exist ({len(declared_jobs)}), install.deploys matches provides.services")
# Existence is not coverage — see check-first-data-coverage.py. Hand the job
# list to the coverage checker rather than duplicating its logic here.
pathlib.Path(os.environ["ATLAS_JOBS_OUT"]).write_text(",".join(sorted(declared_jobs)))
print(f"  ✓ operational block matches the code: {len(declared)} crons, "
      f"unscheduled={sorted(unscheduled_code)}, tz={tz}")

print("  ✓ parsed; schemas=api_v1, init=single file, env_secrets ends -database-db")
PY
  python3 "$(dirname "${BASH_SOURCE[0]}")/check-first-data-coverage.py" \
    "$ATLAS_DAGSTER_DIR" "$(cat "$ATLAS_JOBS_OUT")"
else
  echo "  ! pyyaml unavailable — skipped the parse check (text checks still ran)"
fi

echo "✓ rendered ${OUT} at ${TAG}"
