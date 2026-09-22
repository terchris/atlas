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
# `[0-9]+ marts` and tripped on its own "(plus N marts views)", reporting a
# disagreement between a table count and a view count. A pattern loose enough to
# match two different quantities cannot tell you they disagree.
#
# 🔵 THE MARTS COUNTS ARE NOW DERIVED AND CHECKED, like the raw one above.
#
# ⚠️ Until 2026-09-19 neither was. `MARTS_CLAIMS` was compared only against
# ITSELF — "stated once" — so the number could be internally consistent and
# still wrong, and the view count was matched by nothing at all. I wrote in
# this very comment that deriving them statically "is not cheap" and left them
# ungated. Both then drifted: the artifact reached 61 marts BASE TABLEs when
# there were 63, and said "6 marts views" one line above "five of those models
# are materialised as views" (tor-agent, urb-agents #1263).
#
# 🔴 A field whose own header documents fixing self-contradiction, contradicting
# itself one line up, is the argument for deriving rather than asserting.
#
# It IS cheap, and the earlier claim was wrong. Every model that overrides
# materialisation also declares its schema explicitly, so the effective schema
# and materialisation are both readable from the file — no manifest required.
# Verified against the dbt manifest on 2026-09-19: 6 views, 47 model tables,
# 16 seeds, 63 BASE TABLEs, by both methods.
DBT_MODELS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../dbt" && pwd)"
marts_views=0
marts_tables=0
for f in $(find "$DBT_MODELS/models" -name '*.sql'); do
  # `|| true`: grep exits 1 when a model declares no schema, and this script
  # runs under `set -e`, so the bare substitution aborted the whole render with
  # no message — which is exactly how I first shipped this check.
  sch=$(grep -oE "schema='[a-z_]+'" "$f" | head -1 | cut -d"'" -f2 || true)
  if [[ -z "$sch" ]]; then
    case "$f" in
      */models/indicators/*|*/models/dimensions/*|*/models/marts/*) sch=marts ;;
      *) sch=other ;;
    esac
  fi
  [[ "$sch" == marts ]] || continue
  if grep -q "materialized='view'" "$f"; then
    marts_views=$((marts_views + 1))
  else
    marts_tables=$((marts_tables + 1))
  fi
done
MARTS_SEEDS=$(find "$DBT_MODELS/seeds" -name '*.csv' | wc -l | tr -d ' ')
MARTS_ACTUAL=$((marts_tables + MARTS_SEEDS))
MARTS_VIEWS_ACTUAL=$marts_views
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

MARTS_VIEW_CLAIMS=$(grep -oE '[0-9]+ marts views' "$TMP" | grep -oE '^[0-9]+' | sort -u || true)

if [[ "$MARTS_CLAIMS" != "$MARTS_ACTUAL" ]]; then
  echo "✗ the artifact claims ${MARTS_CLAIMS} marts BASE TABLEs; the dbt project defines ${MARTS_ACTUAL}" >&2
  echo "  Counting rule: models landing in schema marts and NOT materialized='view'," >&2
  echo "  plus every seed (all seeds land in marts). ${marts_tables} models + ${MARTS_SEEDS} seeds." >&2
  exit 1
fi

if [[ -n "$MARTS_VIEW_CLAIMS" && "$MARTS_VIEW_CLAIMS" != "$MARTS_VIEWS_ACTUAL" ]]; then
  echo "✗ the artifact claims ${MARTS_VIEW_CLAIMS} marts views; the dbt project defines ${MARTS_VIEWS_ACTUAL}" >&2
  echo "  Counting rule: models landing in schema marts WITH materialized='view'." >&2
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
# 🔵 FALL BACK TO THE dbt VENV RATHER THAN SKIP. This block used to announce
# "pyyaml unavailable — skipped the parse check" on any machine whose system
# python lacks it, which is most of them: the checks below are the only ones
# that read the file as YAML rather than as lines, and skipping them is how a
# folded scalar goes unexamined. The repo already has a python with pyyaml.
PYY=python3
if ! $PYY -c 'import yaml' 2>/dev/null; then
  CAND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../dbt" && pwd)/.venv/bin/python"
  [ -x "$CAND" ] && $CAND -c 'import yaml' 2>/dev/null && PYY="$CAND"
fi
if $PYY -c 'import yaml' 2>/dev/null; then
  $PYY - "$TMP" <<'PY'
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

# 🔵 Same rule for the upgrade path, which was added on 2026-09-22 because
# `operational:` described a first install and had no concept of an upgrade —
# an ingest-window change shipped with nothing an operator could read
# (urb-agents #1371). A field that names a job must name a real one, or it
# repeats the failure it was added to prevent one field over.
upgrade = op.get("upgrade")
assert upgrade, "operational.upgrade is missing — first_data covers an empty install only"
for key in ("why", "jobs", "when_more_is_needed", "self_healing_warning"):
    assert upgrade.get(key), f"operational.upgrade.{key} is missing or empty"
unknown_upgrade_jobs = set(upgrade["jobs"]) - code_jobs
assert not unknown_upgrade_jobs, (
    f"operational.upgrade names jobs not defined in schedules.py: "
    f"{sorted(unknown_upgrade_jobs)}"
)

# install.deploys must match the services the definition actually provides,
# or the summary promises a different cluster than the deploy performs.
declared_services = {x["service"] for x in d["provides"]["services"]}
assert set(op["install"]["deploys"]) == declared_services, (op["install"]["deploys"], declared_services)

# 🔴 env_from_* must resolve, and a variable must not be set by both.
#
# The mapping is NAME -> KEY, so a typo produces a variable that resolves to
# nothing. UIS refuses at install, which is the right severity — but finding it
# here costs a render, and finding it there costs a publish, a nomination and an
# operator's time.
#
# ⚠️ `env_from_exports` values name an EXPORT this artifact declares.
# ⚠️ `env_from_services` values name a SERVICE this artifact declares — never an
#    address. UIS composes the in-cluster URL from its own services.json, which
#    is why a tenant must not write one: `namespace` is not a declared property
#    of the service schema and it moved once this year.
# 🔴 The same variable set by BOTH is refused, mirroring UIS 1.6.85's own
#    refusal. It is a replace, not an add — the first attempt at this delivered
#    a host-facing `.localhost` into a pod, where it is loopback.
exports = d.get("exports") or {}
declared_service_ids = {x["service"] for x in d["provides"]["services"]}
mapped = 0
for svc in d["provides"]["services"]:
    cl = (svc.get("config") or {}).get("code_location") or {}
    from_exports = cl.get("env_from_exports") or {}
    from_services = cl.get("env_from_services") or {}

    both = set(from_exports) & set(from_services)
    assert not both, (
        f"{sorted(both)} set by BOTH env_from_exports and env_from_services. "
        "Replace the env_from_exports entry, do not add beside it."
    )
    for var, key in from_exports.items():
        assert key in exports, (
            f"env_from_exports maps {var} to export '{key}', which this artifact "
            f"does not declare. Exports are: {sorted(exports)}"
        )
        assert not str(key).startswith(("http://", "https://")), (
            f"env_from_exports must name an EXPORT KEY, not a value: {var} -> {key!r}"
        )
    for var, sid in from_services.items():
        assert sid in declared_service_ids, (
            f"env_from_services maps {var} to service '{sid}', which this artifact "
            f"does not declare. Services are: {sorted(declared_service_ids)}"
        )
        assert "." not in str(sid) and "://" not in str(sid), (
            f"env_from_services must name a SERVICE ID, not an address: {var} -> {sid!r}. "
            "UIS composes the in-cluster URL; a tenant writing one encodes a namespace "
            "that is not a declared property and has moved before."
        )
    mapped += len(from_exports) + len(from_services)
# 🔴 A "not measured" caveat must not outlive the measurement.
#
# `install.first_load` said "the combined WALL TIME is not measured and is
# deliberately not stated here" for as long as that was true. It stopped being
# true on 2026-09-14 and the sentence did not notice — while `first_data.takes`
# in the same file had just gained the figure.
#
# ⚠️ The table-count check above would NOT have caught it: two strings
# disagreeing about a NUMBER is the #824 defect; this is two strings disagreeing
# about whether a number EXISTS. Same shape, different field.
takes_txt = op["first_data"]["takes"]
first_load_txt = op["install"]["first_load"]
_states_wall = any(w in takes_txt for w in ("minutes", "minute", "wall"))
_denies_wall = "WALL TIME is not" in first_load_txt or "wall time is not" in first_load_txt
assert not (_states_wall and _denies_wall), (
    "first_data.takes states a wall time while install.first_load says it is not "
    "measured. One of them is stale."
)
print("  ✓ no stale not-measured caveat")
print(f"  ✓ env_from_* resolves ({mapped} mapped, none doubly-set)")
print(f"  ✓ first_data jobs exist ({len(declared_jobs)}), install.deploys matches provides.services")
# Existence is not coverage — see check-first-data-coverage.py. Hand the job
# list to the coverage checker rather than duplicating its logic here.
pathlib.Path(os.environ["ATLAS_JOBS_OUT"]).write_text(",".join(sorted(declared_jobs)))
print(f"  ✓ operational block matches the code: {len(declared)} crons, "
      f"unscheduled={sorted(unscheduled_code)}, tz={tz}")

print("  ✓ parsed; schemas=api_v1, init=single file, env_secrets ends -database-db")
PY
  $PYY "$(dirname "${BASH_SOURCE[0]}")/check-first-data-coverage.py" \
    "$ATLAS_DAGSTER_DIR" "$(cat "$ATLAS_JOBS_OUT")"
else
  echo "  ✗ CANNOT CHECK: no python with pyyaml, not even atlas-data/dbt/.venv."
  echo "    The YAML-parse checks did not run. Text checks alone cannot see"
  echo "    inside a folded scalar (urb-agents #1353)."
  exit 2
fi

echo "✓ rendered ${OUT} at ${TAG}"
