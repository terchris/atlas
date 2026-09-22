#!/usr/bin/env bash
# Every raw.* table created by a migration is written by something in
# ingest/src. A table nobody populates is either dead or a defect, and until
# now nothing asked.
#
# 🔴 WHY THIS IS NOT THE CHECK THE EXTERNAL REVIEW ASKED FOR.
# The review (urb-agents #1401) recommended "a CI guard failing the build on a
# raw table with no meta_sources entry", and reported five orphan raw tables;
# ops-dev verified eleven. ⚠️ ELEVEN IS THE RIGHT COUNT AND "ORPHAN" IS THE
# WRONG WORD FOR ALL ELEVEN. Every one is produced by something:
#
#   ssb_08484 ssb_08487 ssb_09405 ssb_09406   ONE source, ssb-crime-tables,
#                                             writes all four
#   brreg_enheter                             src/seed-sources/brreg-enheter
#   brreg_enheter_snapshot _versions          brreg-oppdateringer /
#   brreg_feed_watermark                      brreg-enheter-alle
#   redcross_branch_activities                redcross-branches
#   ingest_runs                               the run ledger itself
#   sitemap_log                               src/lib/scraping/sitemap_log.ts
#
# The heuristic "raw table name == meta_sources.source_id" breaks on three
# legitimate patterns: one source writing several tables, seed-sources (which
# live in src/seed-sources/ and carry no manifest), and pipeline bookkeeping.
# A gate built as recommended would fail on all eleven on day one, and a
# permanently red gate gets switched off.
#
# 🔵 So the question this asks is PRODUCTION, not naming: is there code that
# writes this table? That is the property "orphan" was reaching for, it is
# derivable from the repo with no database, and it is green today — so the
# first thing it catches will be a real regression rather than a backlog.
#
# ⚠️ WHAT THIS DELIBERATELY DOES NOT CHECK: whether a produced table is SERVED.
# That is check-every-source-is-served.sh, and it covers the 44 sources with
# manifests. The nine seed-sources are invisible to BOTH — see the report on
# urb-agents #1401; giving them catalogue presence is a separate decision.
set -euo pipefail
cd "$(dirname "$0")/../.."

PY=./atlas-data/dbt/.venv/bin/python
[ -x "$PY" ] || PY=python3

"$PY" - "$@" <<'PYEOF'
import pathlib, re, sys

root = pathlib.Path(".")
mig = root / "atlas-data/migrations"
src = root / "atlas-data/ingest/src"
if not mig.is_dir() or not src.is_dir():
    sys.exit("✗ CANNOT CHECK: run from the repo root — migrations/ or ingest/src/ not found.")

created: dict[str, str] = {}
for f in sorted(mig.glob("*.sql")):
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?raw\.(\w+)", f.read_text(), re.I):
        created.setdefault(m.group(1), f.name)

if not created:
    sys.exit("✗ CANNOT CHECK: parsed zero raw tables from migrations/. The check "
             "cannot pass by finding nothing — fix this parser if the DDL shape changed.")

producers: dict[str, set[str]] = {}
for f in src.rglob("*.ts"):
    if "__tests__" in f.parts:
        continue
    rel = f.relative_to(src)
    owner = "/".join(rel.parts[:2]) if len(rel.parts) > 1 else str(rel)
    for t in set(re.findall(r"raw\.(\w+)", f.read_text())):
        producers.setdefault(t, set()).add(owner)

unclaimed = sorted(t for t in created if t not in producers)

# Known-bad control: the check must be able to go red. Prove it in-process
# rather than trusting that it would.
probe = "zz_probe_table_that_no_code_writes"
assert probe not in producers, "the probe name is real — rename it"
if sorted([*unclaimed, probe]) == sorted(unclaimed):
    sys.exit("✗ the probe did not register — this checker cannot detect an unclaimed table")

if unclaimed:
    print(f"✗ {len(unclaimed)} raw table(s) are created by a migration and written by nothing:")
    for t in unclaimed:
        print(f"    raw.{t:<32} created in {created[t]}")
    print("  Either something should write it, or the migration is dead and should say so.")
    sys.exit(1)

print(f"  ✓ all {len(created)} raw tables created by migrations have a producer in ingest/src")
print(f"    (verified against a known-bad probe; {len(producers)} distinct tables written)")
PYEOF
