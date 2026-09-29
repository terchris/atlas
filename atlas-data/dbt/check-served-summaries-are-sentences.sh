#!/usr/bin/env bash
#
# PostgREST splits a COMMENT ON at the FIRST NEWLINE: line 1 becomes the
# endpoint's `summary` in the OpenAPI document, the rest becomes `description`.
# So the first line is not prose formatting — it is a published field, and the
# only one most consumers ever read when choosing an endpoint.
#
# 🔴 WHY THIS EXISTS. On 2026-09-29 an outside agent built a dashboard on Atlas
# in four minutes and reported that the catalogue was hard to scan. Measured
# against the live spec: of 80 endpoints, only TEN had a well-formed summary.
#
#   17  cut off mid-sentence   "…for the latest year of SSB 08764 child"
#   53  no line break at all   the entire comment became the summary (up to
#                              784 chars) and `description` was left EMPTY
#
# ⚠️ IT WAS INVISIBLE FROM INSIDE THE REPO, which is why it lasted. We author
# YAML in models/marts/api/schema.yml and read it there, hard-wrapped at ~100
# columns for review. Nobody had ever read what PostgREST SERVES. Same class as
# the rest of §13 in SERVING-A-SOURCE.md: we validate the input and never look
# at the output.
#
# 🔵 The two YAML styles fail differently, and both are fixed the same way:
#     description: |     literal — newlines kept  -> line 1 is a wrap fragment
#     description: >-    folded  — newlines eaten -> the whole comment is line 1
#   Writing ONE SENTENCE, then a BLANK LINE, then the detail works for both:
#   a blank line survives folding as a real newline.
#
# 🔵 Reads the COMMITTED api_v1_generated.sql. No database, no API, no dbt
# parse — the claim is about a file in the repo, so it is checkable here.
set -euo pipefail
cd "$(dirname "$0")"

MAX=120
GEN=api_v1_generated.sql
[ -f "$GEN" ] || { echo "✗ CANNOT CHECK: no $GEN" >&2; exit 2; }

exec python3 - "$GEN" "$MAX" <<'PY'
import re, sys

gen, maxlen = sys.argv[1], int(sys.argv[2])
sql = open(gen, encoding="utf-8").read()

# COMMENT ON VIEW api_v1.<name> IS '<body>';  — '' is an escaped quote.
pat = re.compile(r"COMMENT ON VIEW api_v1\.(\w+) IS '((?:[^']|'')*)'", re.S)
found = pat.findall(sql)
if not found:
    print("✗ CANNOT CHECK: no view comments matched in %s." % gen, file=sys.stderr)
    print("  It would have passed without checking anything.", file=sys.stderr)
    sys.exit(2)

bad = []
for name, raw in found:
    body = raw.replace("''", "'").strip()
    first = body.split("\n")[0].strip()
    why = None
    if len(first) > maxlen:
        why = "%d chars (max %d) — no line break, so the whole comment is the summary" % (len(first), maxlen)
    elif not first.endswith((".", "!", "?", ":")):
        why = "ends mid-sentence: %r" % (("…" + first[-44:]) if len(first) > 44 else first)
    if why:
        bad.append((name, why))

if bad:
    print("✗ %d of %d published summaries are not a complete sentence:" % (len(bad), len(found)))
    for name, why in sorted(bad):
        print("    %-42s %s" % (name, why))
    print()
    print("  PostgREST serves the FIRST LINE of each comment as the endpoint's")
    print("  `summary`. Write ONE sentence of <= %d chars, then a BLANK LINE," % maxlen)
    print("  then the detail. That works for both `|` and `>-` in schema.yml.")
    sys.exit(1)

print("✓ all %d published summaries are a complete sentence of <= %d chars" % (len(found), maxlen))
PY
