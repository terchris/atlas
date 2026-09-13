#!/usr/bin/env bash
# atlas-status.sh — does the output reflect the input?
#
# 🔴 WHY THIS EXISTS. Every other check Atlas has asks "is this component
# healthy". None asked "did what went in come out the other side", and on
# 2026-09-13 that gap served a deleted company over the public API for 7.5 hours
# while every available signal was green (imac, urb-agents #918):
#
#     brreg_change_feed        SUCCESS, every 30 minutes
#     raw.ingest_runs          exit_code 0, backlog_remaining 0
#     watermark                advancing normally
#     GET /brreg_enhet         200
#     uis dagster automation   5 RUNNING, 0 STOPPED
#
#     meanwhile:  brreg_transform 16 consecutive failures
#                 119 changes pulled and not applied — 22 deletions, 40 new
#                 register last reconciled 8.4 hours earlier
#
# ⚠️ It was found because a human asked a question, not because anything
# reported it. This script is the cheapest instrument for that class: nothing
# here is collected, it is all already recorded — the pipeline writes
# `oppdateringsid` on both sides, `reconciled_at`, `ingest_runs`. It needed
# comparing, not gathering.
#
# 🔵 NOT alerting, not thresholds, not a daemon. A command an operator runs, and
# that a human runs after an upgrade to answer "did I break it".
#
# Usage:
#   ./atlas-status.sh              the four lines, run health, and the deletion check
#   ./atlas-status.sh --last N     also: the last N changes and whether each landed

set -euo pipefail
cd "$(dirname "$0")"

LAST_N=0
if [[ "${1:-}" == "--last" ]]; then
  LAST_N="${2:-10}"
  [[ "$LAST_N" =~ ^[0-9]+$ ]] || { echo "✗ --last needs a number" >&2; exit 2; }
fi

# Same convention as apply-api-v1.sh: ingest/.env is the canonical location for
# PG credentials. Sourced rather than re-derived so there is one place to fix.
if [[ -f ingest/.env ]]; then
  set -a; . ingest/.env; set +a
fi
DB="${ATLAS_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB" ]]; then
  echo "✗ ATLAS_DATABASE_URL or DATABASE_URL must be set (or present in ingest/.env)" >&2
  exit 2
fi

q() { psql "$DB" -qtAX -c "$1"; }

echo "Brreg register"

# 🔴 THE FOUR LINES. Everything else in this script is elaboration.
#
# `pulled` is what the FEED has durably committed; `applied` is what the
# DIMENSION has reconciled. They are written by different jobs at different
# cadences (:00/:30 and :10/:40), so a gap is normal for minutes and a symptom
# for hours. The incident was these two numbers 127 apart for 8.4 hours with
# nothing comparing them.
read -r PULLED PULLED_AT <<<"$(q "select coalesce(last_oppdateringsid,0), coalesce(to_char(updated_at,'YYYY-MM-DD HH24:MI'),'never') from raw.brreg_feed_watermark limit 1" | tr '|' ' ')"
read -r APPLIED RECON_AGE <<<"$(q "select coalesce(max(last_oppdateringsid),0), coalesce(round(extract(epoch from now()-max(reconciled_at))/3600.0, 1)::text,'never') from marts.dim_brreg_enhet" | tr '|' ' ')"

printf '  newest change pulled        %-10s %s\n' "$PULLED" "$PULLED_AT"
printf '  newest change applied       %-10s\n' "$APPLIED"

# The breakdown is the half that turns a number into a decision: 119 pending is
# a backlog, 119 pending of which 22 are deletions is a register serving
# organisations Brreg has removed.
PENDING=$(q "select count(*) from raw.brreg_enheter_versions where oppdateringsid > $APPLIED")
if [[ "$PENDING" == "0" ]]; then
  printf '  pending                     0\n'
else
  BREAK=$(q "select coalesce(string_agg(n||' '||t, ', ' order by t), '') from (select endringstype t, count(*) n from raw.brreg_enheter_versions where oppdateringsid > $APPLIED group by 1) s")
  printf '  pending                     %-10s (%s)   ⚠️\n' "$PENDING" "$BREAK"
fi

if [[ "$RECON_AGE" == "never" ]]; then
  printf '  last reconciled             never\n'
else
  WARN=""; awk "BEGIN{exit !($RECON_AGE > 2)}" && WARN="   ⚠️"
  printf '  last reconciled             %s h ago%s\n' "$RECON_AGE" "$WARN"
fi

# 🔴 THE DELETION SPOT CHECK — the strongest single assertion available, because
# one line exercises the feed, the tombstone post-hook, the dimension, the view
# and PostgREST end to end. Deletions are also where this pipeline has failed
# most often: the delete+insert post-hook exists because deletions silently did
# not apply, and 22 unapplied deletions were the sharp end of #918.
#
# ⚠️ Checked against the PUBLISHED view, not the dimension. Three of that day's
# findings lived in the gap between "correct in Postgres" and "correct over the
# API" — a 404 after repair, a stale schema cache, and comments that survived a
# rollback.
echo
echo "Deletion propagation"
DEL=$(q "select organisasjonsnummer from raw.brreg_enheter_versions where endringstype in ('Sletting','Fjernet') order by oppdateringsid desc limit 1")
if [[ -z "$DEL" ]]; then
  echo "  no deletion in the feed yet — nothing to assert"
else
  STILL=$(q "select count(*) from api_v1.brreg_enhet where organisasjonsnummer = '$DEL'")
  if [[ "$STILL" == "0" ]]; then
    printf '  most recent deletion        %s   absent from api_v1 ✓\n' "$DEL"
  else
    printf '  most recent deletion        %s   STILL SERVED ⚠️\n' "$DEL"
  fi
fi

# Run health. ⚠️ A single failure is noise; a run of them is a system that has
# stopped, and printing the error turns a support round-trip into a fix.
echo
echo "Ingest runs (last 24 h)"
q "select '  '||rpad(source_slug,26)||rpad(case when exit_code=0 then 'ok' else 'FAILED ('||coalesce(exit_code::text,'running')||')' end,14)||to_char(max_started,'YYYY-MM-DD HH24:MI')||coalesce('   '||left(notes,60),'')
   from (
     select distinct on (source_slug) source_slug, exit_code, started_at as max_started, notes
     from raw.ingest_runs where started_at > now() - interval '24 hours'
     order by source_slug, started_at desc
   ) s order by exit_code desc nulls first, source_slug" || true

if [[ "$LAST_N" != "0" ]]; then
  # Terje's own suggestion: for each of the last N changes, what it was and
  # whether it landed. The Sletting rows are the informative ones — a deletion
  # that fails to propagate looks identical to one that succeeded unless you
  # go and look.
  echo
  echo "Last $LAST_N changes"
  q "select '  '||rpad(v.oppdateringsid::text,11)||rpad(v.organisasjonsnummer,12)||rpad(v.endringstype,11)||
            rpad(to_char(v.fetched_at,'HH24:MI'),7)||
            case
              when v.endringstype in ('Sletting','Fjernet')
                then case when d.organisasjonsnummer is null then 'removed   (absent, correct)' else 'STILL PRESENT ⚠️' end
              when d.organisasjonsnummer is null then 'MISSING ⚠️'
              when d.last_oppdateringsid >= v.oppdateringsid then 'ok        '||coalesce(left(d.navn,28),'')
              else 'STALE ⚠️  applied '||d.last_oppdateringsid
            end
     from (select * from raw.brreg_enheter_versions order by oppdateringsid desc limit $LAST_N) v
     left join marts.dim_brreg_enhet d on d.organisasjonsnummer = v.organisasjonsnummer
     order by v.oppdateringsid desc" || true
fi

# ⚠️ NOT COVERED, stated so nobody reads a green run as more than it is:
# job-level failures (the 16 consecutive brreg_transform failures) live in
# Dagster's own run storage, not in any table this script can reach. The
# INCIDENT is still visible above — a stalled transform shows as `applied`
# falling behind `pulled` and `last reconciled` growing — but the CAUSE and the
# error text are not, and that is the one thing an operator would most want next.
echo
echo "⚠️ Job-level run history is Dagster's, not Atlas's — a stalled transform shows above as"
echo "   pending > 0 and a growing 'last reconciled', but the error text is in Dagster."
