#!/usr/bin/env bash
#
# STANDING RULE (Terje, 2026-09-21): if a dataset is added, it must be served.
#
# 🔴 WHY THIS IS A GATE. On 2026-09-21 Atlas held 44 ingested sources and
# served 30 of them. Eight FHI sources had been pulled weekly for months and
# modelled nowhere — including fhi-neet, 108 220 rows of "young people not in
# employment, education or training", while an external consumer built a
# youth-need index without it. Nobody decided not to serve them. The ingest
# landed, the modelling never followed, and nothing anywhere noticed.
#
# ⚠️ That is not a backlog problem, it is a missing check. An ingest that
# reaches no model is invisible from every direction: green pipelines, a
# healthy catalogue row in meta_sources, rows accumulating in raw, and no
# consumer-facing symptom except an absence nobody can see.
#
# So: every source in the manifest must have at least one downstream model, or
# appear below with a reason. A NEW source with neither fails CI on the merge
# that adds it — which is the only moment the decision is cheap.
#
# 🔵 Static: reads the seeds, needs no database. The live equivalent is
# `GET /meta_sources?downstream_model_count=eq.0`, which a consumer can run
# too — and which returned one false positive until 4c82c77, because
# brreg-oppdateringer fed five models through a lineage edge nobody recorded.
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST=seeds/sources/_sources_manifest.csv
LINEAGE=seeds/sources/lineage.csv
# 🔴 api_v1_generated.sql IS AN INPUT AND WAS NOT GUARDED. The two seeds were
# checked here and the generated contract was not — so with it absent the
# python below died on read_text() and the gate exited 1, which to any caller
# reading the exit code is indistinguishable from its real finding, "a source
# is ingested and reaches no model". In CI that is a red Data-fidelity job
# blaming the data for a missing file.
#
# ⚠️ Found by probing my own refusal paths after ops-dev proposed the
# consumer's refuse-when-the-input-is-absent handling as the shape to adopt
# (urb-agents #1360). Six of seven gates refused correctly; this was the
# seventh, and it is the one enforcing Terje's standing rule.
GENERATED=api_v1_generated.sql
for f in "$MANIFEST" "$LINEAGE" "$GENERATED"; do
  [ -f "$f" ] || { echo "✗ CANNOT CHECK: no $f" >&2
                   echo "  This is NOT a serving finding — the gate did not run." >&2
                   exit 2; }
done

# NEVER served, by design. Each needs a reason, not just a name.
# ⚠️ EMPTY since 2026-09-24, when its only entry was removed on Terje's
# instruction (urb-agents #1453). Empty is the correct state, not a gap: every
# remaining ingested source is expected to reach a published relation.
EXEMPT=""

# Ingested and not yet modelled. EMPTY, and keeping it that way is the rule.
#
# 🔵 It held eight FHI sources when this gate was written on 2026-09-21; Terje
# said "go ahead - all datasets must be served" and they were served. It then
# went to zero, WRONGLY — because the gate was asking whether a model existed
# rather than whether a consumer could reach it. These four are the honest
# number, and three of them were already documented exclusions that this gate
# could not see.
#
# ⚠️ Adding a name here is a decision to defer, with your reason beside it. An
# empty list is the normal state, not an achievement to be protected: if
# deferring one is genuinely right, defer it and say why.
#   bufdir-barnefattigdom  built, not unioned: Bufdir RENUMBERS indicators, so a
#                          naive union could double-count a (kommune, year,
#                          contents_code). Waits on one green grain-test cycle.
#   ssb-10826              bydel-level. Needs its own mart and its own grain
#                          decision — the same one the Ungdata bydel rows need.
#   ssb-12944              period (not year) + age_group. Needs a deliberate
#                          mapping, not a union.
#   fhi-innvandrere        model built 2026-09-21; its headline needs the LANDBAK
#                          aggregate code, which the manifest says to verify
#                          against FHI's reference. Guessing it would publish a
#                          population figure for the wrong origin group.
BACKLOG="bufdir-barnefattigdom ssb-10826"

# 🔴 "HAS A MODEL" IS NOT "REACHES A CONSUMER", AND THIS GATE USED TO CONFLATE
# THEM. It counted any lineage edge as served. fhi-innvandrere has an indicator
# model that reaches no published relation — it emits nothing a consumer can
# query — and this gate reported 0 deferred while it sat there (urb-agents
# #1329, found by ops-dev after certifying the opposite to me AND relaying the
# same measure to the demo consumer as "the honest measure of what is
# unreachable").
#
# ⚠️ It is the mirror of the defect found in the same measure that morning:
# brreg-oppdateringer read ZERO while serving four marts. One direction makes a
# served source look unserved; this one makes an unserved source look served,
# and only the second lets a rule report compliance it does not have.
#
# So: a source is SERVED when it feeds a mart_* that api_v1 actually exposes.
# ⚠️ python3, not ./.venv/bin/python. This gate runs in the UNFILTERED CI job,
# which checks out the repo and installs nothing — there is no venv there. It
# is the third time a check of mine has been portable on my machine and broken
# on the runner (BSD mktemp, bash 4 mapfile, now this), and all three were
# found by CI rather than by me.
PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=./.venv/bin/python

SERVED="$("$PY" -c '
import csv, re, pathlib
gen = pathlib.Path("api_v1_generated.sql").read_text()
rel = set(re.findall(r"CREATE OR REPLACE VIEW api_v1\.(\w+)", gen))
for r in csv.DictReader(open("seeds/sources/lineage.csv")):
    m = r["model_name"]
    if m.startswith("mart_") and m[5:] in rel:
        print(r["source_id"])
' | sort -u)"
ALL="$(tail -n +2 "$MANIFEST" | cut -d, -f1 | tr -d '"\r' | sort -u)"
[ -n "$SERVED" ] && [ -n "$ALL" ] || { echo "✗ CANNOT CHECK: empty manifest or lineage." >&2; exit 2; }

unserved=""; deferred=""
for sid in $ALL; do
  printf '%s\n' "$SERVED" | grep -qx "$sid" && continue
  case " $EXEMPT "  in *" $sid "*) continue ;; esac
  case " $BACKLOG " in *" $sid "*) deferred="${deferred} ${sid}"; continue ;; esac
  unserved="${unserved}    ${sid}
"
done

if [ -n "$unserved" ]; then
  echo "✗ a source is ingested and reaches no model."
  echo "  Standing rule: if a dataset is added, it must be served. Model it, or"
  echo "  add it to BACKLOG in this script — which is a decision to defer, with"
  echo "  your name on it, not a way to silence the check."
  printf '%s' "$unserved"
  exit 1
fi

n_all=$(printf '%s\n' "$ALL" | wc -l | tr -d ' ')
n_def=$(printf '%s\n' $deferred | wc -w | tr -d ' ')
echo "✓ every ingested source reaches a model, or is declared"
n_ex=$(printf '%s\n' $EXEMPT | wc -w | tr -d ' ')
echo "  ${n_all} sources · ${n_ex} exempt by design · ${n_def} deferred and tracked"
[ "$n_def" -eq 0 ] || echo "  ⚠️ still unserved:$deferred"
