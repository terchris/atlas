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

# Ingested and not yet modelled. KNOWN, tracked, and shrinking — this list is
# the backlog made visible in the repo instead of in a bus thread. The gate
# warns on these and fails on anything in neither list.
# ⚠️ Adding a name here is a decision to defer, not a way to silence the check.
BACKLOG="fhi-befolkning fhi-befolkningsvekst fhi-innvandrere fhi-innvkat \
fhi-kpr-1aar fhi-neet fhi-prognose fhi-selvmord"

# 🔴 CR GUARD ON THE LINEAGE SEED ONLY, AND THE ASYMMETRY IS THE POINT.
#
# Python's csv.writer emits \r\n by default (RFC 4180). Every time I rewrote
# lineage.csv this session I silently converted it to CRLF — 205 carriage
# returns. dbt, the website generator and every existing gate tolerated it. The
# first thing that did not was this script's own `grep -qx`, which matched
# nothing and reported 34 served sources as unserved.
#
# ⚠️ WHY ONLY THIS FILE. In lineage.csv source_id is the LAST field, so a
# trailing CR attaches to the value and breaks exact matching. In
# _sources_manifest.csv source_id is the FIRST field — that file has carried 45
# carriage returns since long before this work, harmlessly, and failing on it
# would be a gate crying wolf about something that has never hurt anyone.
#
# 🔵 The parsing below strips CR regardless, so this guard is belt-and-braces
# on the one file where the convention is LF and a CR means someone rewrote it
# with csv.writer defaults.
if tr -cd '\r' < "$LINEAGE" | head -c1 | grep -q .; then
  echo "✗ $LINEAGE contains carriage returns."
  echo "  source_id is the last field there, so a trailing CR attaches to the"
  echo "  value and every exact-match lookup fails silently. Rewrite with LF"
  echo "  (csv.writer needs lineterminator='\\n')."
  exit 1
fi

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
