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
for f in "$MANIFEST" "$LINEAGE"; do [ -f "$f" ] || { echo "✗ CANNOT CHECK: no $f" >&2; exit 2; }; done

# NEVER served, by design. Each needs a reason, not just a name.
#   frr  Red Cross volunteer register. Personal data, auth-gated in
#        private_marts, deliberately outside api_v1 and outside marts.
EXEMPT="frr"

# Ingested and not yet modelled. EMPTY, and keeping it that way is the rule.
#
# 🔵 It held eight FHI sources when this gate was written on 2026-09-21 — I
# wrote the rule down and exempted myself from it in the same commit. Terje
# said "go ahead - all datasets must be served", and they now are. Every one of
# the 44 reaches a model.
#
# ⚠️ Adding a name here is a decision to defer, with your reason beside it. An
# empty list is the normal state, not an achievement to be protected: if
# deferring one is genuinely right, defer it and say why.
BACKLOG=""

SERVED="$(tail -n +2 "$LINEAGE" | cut -d, -f2 | tr -d '"\r' | sort -u)"
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
echo "  ${n_all} sources · 1 exempt by design (frr) · ${n_def} deferred and tracked"
[ "$n_def" -eq 0 ] || echo "  ⚠️ still unserved:$deferred"
