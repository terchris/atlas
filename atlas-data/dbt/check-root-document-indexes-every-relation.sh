#!/usr/bin/env bash
#
# Every published relation must be findable from somewhere.
#
# 🔴 WHY THIS EXISTS. `meta_dimensions` carries what every upstream dimension
# MEANS — including that fhi-selvmord's year is a 5-year window and that
# fhi-kpr-1aar's range-shaped year is a single year. On 2026-09-21 a consumer
# rendered a wrong year on a front page, ops-dev called a live series six
# years stale, and this agent built a column across 31 CTEs, all deriving a
# fact that relation had been publishing in a string the whole time.
#
# ⚠️ IT WAS REACHABLE AND UNFINDABLE. Nothing pointed at it: not the root
# document, not meta_sources, not any other description. A consumer could
# only find it by enumerating 19 relations and reading each one — which is
# what neither party did during a full day of needing exactly its contents.
#
# 🔵 AND IT WAS NOT SPECIAL. Measured when the pointer was added: EIGHT of
# nineteen relations were referenced from nowhere. meta_dimensions was simply
# the one whose absence happened to cost a day (urb-agents #1335).
#
# ⚠️ THIS CHECKS REACHABILITY OF A NAME, NOT QUALITY OF A DESCRIPTION. A
# relation listed in the index with a useless one-liner passes. What it
# prevents is the specific thing that happened: a relation that exists, works,
# describes itself well, and that nothing tells you about.
set -euo pipefail
cd "$(dirname "$0")"

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

[ -f api_v1_generated.sql ] || {
  echo "✗ CANNOT CHECK: no api_v1_generated.sql — run ./regenerate-api-v1.sh." >&2
  exit 2
}

"$PY" - <<'PYEOF'
import re, pathlib, sys

sql = pathlib.Path("api_v1_generated.sql").read_text()
views = sorted(set(re.findall(r"CREATE OR REPLACE VIEW api_v1\.(\w+) AS", sql)))
if not views:
    print("✗ CANNOT CHECK: zero views found — it would have passed without "
          "checking anything.", file=sys.stderr)
    sys.exit(2)

m = re.search(r"COMMENT ON SCHEMA api_v1 IS\n(.*?');\n", sql, re.S)
if not m:
    print("✗ CANNOT CHECK: the schema has no COMMENT, so there is no root "
          "document for a consumer to start from.", file=sys.stderr)
    sys.exit(2)
root = m.group(1).lstrip().lstrip("'")

# 🔴 POSTGREST SPLITS THIS COMMENT: line 1 becomes OpenAPI `info.title`,
# everything after it becomes `info.description`. migrations/050's comment was
# a SINGLE LINE, so the whole thing became the title and the served spec
# reported `info.description: 0 characters` — which from outside the database
# is indistinguishable from "no comment set at all" (urb-agents #1328).
#
# ⚠️ So a root document with no blank second line puts its index in the TITLE:
# correct, applied, and invisible. That is the exact failure this gate exists
# to prevent, one layer further in than the one it was written for.
_lines = root.split("\n")
if len(_lines) < 3 or _lines[1].strip():
    print("✗ the root document has no title/description split.")
    print("  PostgREST puts line 1 in info.title and the REST in")
    print("  info.description. Without a blank second line the whole index")
    print("  lands in the title, where a consumer does not read it.")
    print(f"  line 1: {_lines[0][:70]!r}")
    print(f"  line 2: {(_lines[1] if len(_lines) > 1 else '<missing>')[:70]!r} "
          f"(must be blank)")
    sys.exit(1)
# 🔵 A TITLE IS A NAME, NOT A PARAGRAPH. ops-dev's addition after measuring
# the live spec: the split check above catches a document collapsed onto one
# line, but a WRAPPED first line followed by a blank line splits correctly and
# still puts a paragraph where a name goes. The served title on 2026-09-21 was
# 275 characters — Swagger UI, client generators and catalogues all render
# that as the page heading.
TITLE_MAX = 80
if len(_lines[0]) > TITLE_MAX:
    print(f"✗ the root document's title is {len(_lines[0])} characters; "
          f"PostgREST serves line 1 as info.title and anything rendering the "
          f"spec puts it where a NAME goes.")
    print(f"  {_lines[0][:100]!r}...")
    print(f"  Keep it under {TITLE_MAX}; the explanation belongs in the lines "
          f"after the blank one.")
    sys.exit(1)

description = "\n".join(_lines[1:])

comments = dict(re.findall(r"COMMENT ON VIEW api_v1\.(\w+) IS '(.*?)';\n", sql, re.S))

def named_in(text, v):
    return re.search(rf"\b{re.escape(v)}\b", text) is not None

# 🔴 CONTROLS. A matcher that answers yes to everything reports a fully
# indexed schema and looks exactly like one.
if named_in("start at meta_endpoints then meta_sources", "meta_dimensions"):
    print("✗ CANNOT CHECK: the matcher found a relation that is not there.",
          file=sys.stderr)
    sys.exit(2)
if not named_in("start at meta_endpoints then meta_sources", "meta_sources"):
    print("✗ CANNOT CHECK: the matcher missed a relation that is there.",
          file=sys.stderr)
    sys.exit(2)

orphans = []
for v in views:
    if named_in(description, v):
        continue
    if any(named_in(c, v) for o, c in comments.items() if o != v):
        continue
    orphans.append(v)

if orphans:
    print(f"✗ {len(orphans)} published relation(s) are named nowhere — not in "
          f"the root document, not in another relation's description:")
    for v in orphans:
        print(f"    api_v1.{v}")
    print("  A consumer can only find these by enumerating every relation and")
    print("  reading each description. Add them to SCHEMA_COMMENT in")
    print("  scripts/generate_api_v1.py and re-run ./regenerate-api-v1.sh.")
    sys.exit(1)

# ⚠️ AND THE SAME RULE FOR THE MIGRATION, because there is a window where it
# is what gets served. migrations/050 sets the comment at install; on a fresh
# install PostgREST can be configured and answering BEFORE the first transform
# has re-applied api_v1_generated.sql. A 275-character title there is the same
# bug for the same reason, just for a shorter time.
mig = pathlib.Path("../migrations/050_create_api_v1_schema.sql")
if mig.exists():
    mm = re.search(r"COMMENT ON SCHEMA api_v1 IS\n\s*'(.*?)';", mig.read_text(), re.S)
    if mm:
        ml = mm.group(1).split("\n")
        if len(ml) < 3 or ml[1].strip() or len(ml[0]) > TITLE_MAX:
            print(f"✗ {mig} sets a schema comment that PostgREST would split "
                  f"badly — title {len(ml[0])} chars, "
                  f"line 2 {'blank' if len(ml) > 1 and not ml[1].strip() else 'NOT blank'}.")
            print("  A fresh install serves this one until the first transform.")
            sys.exit(1)

in_root = sum(1 for v in views if named_in(description, v))
print(f"✓ all {len(views)} published relations are findable "
      f"({in_root} named in the root document's description, which is\n  what PostgREST serves as info.description)")
print("  (matcher verified against a known-absent and a known-present name)")
PYEOF
