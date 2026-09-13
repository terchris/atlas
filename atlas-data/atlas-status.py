#!/usr/bin/env python3
"""
atlas-status.py — does the output reflect the input?

🔴 WHY THIS EXISTS. Every other check Atlas has asks "is this component
healthy". None asked "did what went in come out the other side", and on
2026-09-13 that gap served a deleted company over the public API for 7.5 hours
while every available signal was green (imac, urb-agents #918):

    brreg_change_feed        SUCCESS, every 30 minutes
    raw.ingest_runs          exit_code 0, backlog_remaining 0
    watermark                advancing normally
    GET /brreg_enhet         200
    uis dagster automation   5 RUNNING, 0 STOPPED

    meanwhile:  brreg_transform 16 consecutive failures
                119 changes pulled and not applied — 22 deletions, 40 new
                register last reconciled 8.4 hours earlier

⚠️ It was found because a human asked a question, not because anything reported
it. Nothing here is collected: the pipeline already records all of it. It needed
comparing, not gathering.

🔵 NOT alerting, not thresholds-as-policy, not a daemon. A command an operator
runs, and that a human runs after an upgrade to answer "did I break it".

WHY PYTHON AND NOT SHELL
The first version was a bash script using `psql`. imac found it could not run
where it shipped: `psql` is not installed in the atlas-data image and the script
was not copied into it either (defect D4). `psycopg2` IS in the image — the
api_v1 asset checks import it — so Python removes a system dependency instead of
adding one, and lets the PostgREST check (D1) and the Dagster run history
(item 3) happen in the same process.

EXIT CODES — `status` goes in a script, so exit must reflect health (D3)
    0   healthy
    1   a warning was printed: the register is behind, a deletion is still
        served, or an ingest source failed
    2   cannot answer — no connection string, bad argument, database unreachable

⚠️ 2 is deliberately distinct from 1. "I looked and it is wrong" and "I could not
look" are different answers, and collapsing them is how a broken check reads as
a finding.

ENVIRONMENT
    ATLAS_DATABASE_URL / DATABASE_URL   required
    ATLAS_POSTGREST_URL / POSTGREST_URL optional — without it the deletion check
                                        cannot be made over HTTP and says so
    DAGSTER_DATABASE_URL                optional — job history; a host may
                                        legitimately run Atlas without Dagster
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

# One cycle is the feed at :00/:30 and the transform at :10/:40, so the newest
# change is routinely up to ~10 minutes plus the transform's own runtime ahead of
# the dimension. `pending > 0` on its own is therefore the NORMAL state for part
# of every half hour — which is why it must not warn by itself (D2).
STALE_WARN_HOURS = 1.0   # pending is a symptom only once it is also this old
RECONCILE_WARN_HOURS = 2.0


class CannotAnswer(Exception):
    """Raised when the tool cannot look, as distinct from looking and finding fault."""


# 🔴 THE THREE STATES, AS DATA RATHER THAN AS TWO BOOLEANS.
#
# The exit scheme was stated from the first version — 0 healthy, 1 warned,
# 2 cannot-answer — and the code carried it in a single `healthy` boolean, which
# cannot express the third. imac found the consequence (urb-agents #918):
#
#     ATLAS_POSTGREST_URL dead    -> "unreachable"       exit 1
#     ATLAS_POSTGREST_URL unset   -> "cannot check"      exit 0   <- D1 in its purest form
#     DAGSTER_DATABASE_URL unauth -> unhandled traceback exit 1
#
# ⚠️ "I could not look" was being reported as healthy, in the tool written to
# stop exactly that. A script doing `atlas-status.py && deploy` would have
# proceeded.
#
# 🔵 imac asked whether the dead-API case should stay 1. It should not: I
# specified 1 before the three-way scheme existed, and "the API did not answer"
# is not "the API answered wrongly". The property imac verified — never a false
# pass — is preserved and sharpened.
OK, WARN, CANNOT = 0, 1, 2


def worst(*states: int) -> int:
    """CANNOT dominates WARN dominates OK. Not-asked is OK; asked-and-unanswerable is CANNOT."""
    return max(states)


def _conn(url: str):
    # ⚠️ The import is INSIDE the try. It was outside, and a missing psycopg2
    # crashed with a traceback instead of reporting "cannot look" — found by
    # running the exit-code paths on a machine without it. The same shape imac
    # reported for an unauthorised Dagster role: a dependency problem must
    # degrade, not crash, or the tool fails in exactly the way it exists to
    # detect. psycopg2 ships in the atlas-data image; this path is for everywhere
    # else the script is run.
    try:
        import psycopg2

        return psycopg2.connect(url)
    except Exception as exc:  # noqa: BLE001 — any failure here means "cannot look"
        raise CannotAnswer(f"cannot connect: {exc}") from exc


def _one(cur, sql: str, args: tuple = ()):
    cur.execute(sql, args)
    row = cur.fetchone()
    return row if row else None


def _hours_since(ts) -> float | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0


def register_block(cur) -> int:
    """The four lines. Everything else in this tool is elaboration. Returns True if healthy."""
    state = OK
    print("Brreg register")

    pulled_row = _one(cur, "select last_oppdateringsid, updated_at from raw.brreg_feed_watermark limit 1")
    pulled, pulled_at = (pulled_row or (0, None))

    applied_row = _one(cur, "select max(last_oppdateringsid), max(reconciled_at) from marts.dim_brreg_enhet")
    applied, reconciled_at = (applied_row or (0, None))
    applied = applied or 0

    print(f"  newest change pulled        {str(pulled):<10} {pulled_at:%Y-%m-%d %H:%M}" if pulled_at
          else f"  newest change pulled        {str(pulled):<10} never")
    # Cosmetic, imac: `applied` had no timestamp where `pulled` did, and a
    # trailing space. Both fixed — the reconcile time is the applied time.
    print(f"  newest change applied       {str(applied):<10} {reconciled_at:%Y-%m-%d %H:%M}" if reconciled_at
          else f"  newest change applied       {str(applied):<10} never")

    cur.execute(
        "select endringstype, count(*) from raw.brreg_enheter_versions "
        "where oppdateringsid > %s group by 1 order by 1",
        (applied,),
    )
    rows = cur.fetchall()
    pending = sum(n for _, n in rows)
    age = _hours_since(reconciled_at)

    # 🔴 D2. `pending > 0` used to warn unconditionally, and imac's first run
    # showed `pending 2 ⚠️` on a completely healthy register. The prose in the
    # old script already said "normal for minutes, a symptom for hours"; the code
    # did not. A gate that cries wolf on a healthy state is how a gate gets muted.
    pending_is_symptom = pending > 0 and age is not None and age > STALE_WARN_HOURS
    if pending == 0:
        print("  pending                     0")
    else:
        detail = ", ".join(f"{n} {t}" for t, n in rows)
        flag = "   ⚠️" if pending_is_symptom else ""
        print(f"  pending                     {pending:<10} ({detail}){flag}")
    if pending_is_symptom:
        state = WARN

    if age is None:
        print("  last reconciled             never   ⚠️")
        state = WARN
    else:
        flag = "   ⚠️" if age > RECONCILE_WARN_HOURS else ""
        print(f"  last reconciled             {age:.1f} h ago{flag}")
        if age > RECONCILE_WARN_HOURS:
            state = WARN
    return state


def deletion_block(cur) -> int:
    """
    🔴 D1 — THIS MUST BE AN HTTP REQUEST, NOT A QUERY.

    The first version ran `select count(*) from api_v1.brreg_enhet` over psql.
    imac's criterion was database-versus-HTTP and I read it as
    view-versus-dimension. The distinction is not pedantic — three findings on
    2026-09-13 lived exactly in that gap, and in every one of them the psql query
    returns the right answer while the public API is broken:

        a repair that left GET /brreg_enhet at 404 for 70 s   psql fine
        PostgREST's schema cache holding a dropped view       psql fine
        COMMENTs surviving a rollback                         psql fine

    One line over HTTP exercises the feed, the tombstone post-hook, the
    dimension, the view, the grants, PostgREST and its schema cache end to end.
    """
    print()
    print("Deletion propagation")
    row = _one(
        cur,
        "select organisasjonsnummer from raw.brreg_enheter_versions "
        "where endringstype in ('Sletting','Fjernet') order by oppdateringsid desc limit 1",
    )
    if not row:
        print("  no deletion in the feed yet — nothing to assert")
        return OK
    orgnr = row[0]

    base = os.environ.get("ATLAS_POSTGREST_URL") or os.environ.get("POSTGREST_URL")
    if not base:
        # ⚠️ A DISTINCT OUTCOME, not a pass. Without a URL this tool cannot make
        # the assertion, and saying "absent, correct" here would be the exact
        # lie the check exists to prevent.
        # ⚠️ CANNOT, not OK. PostgREST is a service Atlas declares in
        # `provides.services`, so its absence is not "this check is optional" —
        # it is the tool being unable to answer its headline question.
        print(f"  most recent deletion        {orgnr}   ⚠️ cannot check — set ATLAS_POSTGREST_URL")
        return CANNOT
    url = f"{base.rstrip('/')}/brreg_enhet?organisasjonsnummer=eq.{orgnr}&select=organisasjonsnummer"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = json.loads(resp.read().decode() or "[]")
            code = resp.status
    except urllib.error.HTTPError as exc:
        print(f"  most recent deletion        {orgnr}   ⚠️ API returned HTTP {exc.code}")
        return CANNOT
    except Exception as exc:  # noqa: BLE001
        print(f"  most recent deletion        {orgnr}   ⚠️ API unreachable: {exc}")
        return CANNOT

    if code == 200 and body == []:
        print(f"  most recent deletion        {orgnr}   absent from the API ✓")
        return OK
    print(f"  most recent deletion        {orgnr}   STILL SERVED by the API ⚠️")
    return WARN


def ingest_block(cur, limit: int = 12) -> int:
    """Per-source ingest health. Failures first, so a short terminal shows the problem."""
    print()
    print("Ingest runs (last 24 h)")
    cur.execute(
        """
        select source_slug, exit_code, started_at, notes
        from (
          select distinct on (source_slug) source_slug, exit_code, started_at, notes
          from raw.ingest_runs
          where started_at > now() - interval '24 hours'
          order by source_slug, started_at desc
        ) s
        order by (exit_code is distinct from 0) desc, source_slug
        """
    )
    rows = cur.fetchall()
    if not rows:
        print("  no ingest runs in the last 24 h   ⚠️")
        return WARN
    state = OK
    # Cosmetic, imac: the full list pushed the register block off a short
    # terminal. Failures sort first and the tail is summarised rather than shown.
    for slug, code, started, notes in rows[:limit]:
        state = "ok" if code == 0 else (f"FAILED ({code})" if code is not None else "running")
        if code not in (0, None):
            state = WARN
        note = f"   {notes[:58]}" if notes and code not in (0, None) else ""
        print(f"  {slug:<26}{state:<14}{started:%Y-%m-%d %H:%M}{note}")
    if len(rows) > limit:
        print(f"  … and {len(rows) - limit} more, all ok")
    return state


def _last_error(cur, job: str) -> str | None:
    """
    The most recent STEP_FAILURE message for a job, from Dagster's event log.

    ⚠️ `event_logs.event` is a serialised JSON blob whose shape is Dagster's, not
    ours, and it changes between versions. Parsed defensively: JSON first, a
    bounded regex second, and None rather than a guess if neither works — an
    absent message is better than an invented one.
    """
    try:
        cur.execute(
            """
            select event from event_logs
            where dagster_event_type = 'STEP_FAILURE'
              and event like %s
            order by id desc limit 1
            """,
            (f"%{job}%",),
        )
        row = cur.fetchone()
    except Exception:  # noqa: BLE001 — a schema this tool does not own
        return None
    if not row or not row[0]:
        return None
    blob = row[0]
    try:
        d = json.loads(blob)
        msg = (d.get("event_specific_data") or {}).get("error", {}).get("message")
        if msg:
            return " ".join(msg.split())[:160]
    except Exception:  # noqa: BLE001
        pass
    m = re.search(r'"message"\s*:\s*"([^"]{10,400})"', blob)
    return " ".join(m.group(1).split())[:160] if m else None


def jobs_block() -> int:
    """
    Item 3 — job-level history, which the first version could not reach.

    imac located it: same PostgreSQL instance, different database. Run history is
    `runs` in the `dagster` database, not in `atlas`.

    ⚠️ Degrades to "not available" rather than failing when DAGSTER_DATABASE_URL
    is unset, because a host can legitimately run Atlas without Dagster. Not
    derived by string-munging ATLAS_DATABASE_URL: guessing another service's
    connection string from this one's is how a tool ends up confidently querying
    the wrong database.
    """
    url = os.environ.get("DAGSTER_DATABASE_URL")
    print()
    print("Jobs")
    if not url:
        # 🔵 NOT ASKED, so OK. A host can legitimately run Atlas without Dagster,
        # and the Jobs block is diagnostic context — it explains WHY the register
        # is behind, not WHETHER it is. Its absence cannot hide the headline.
        print("  not available — set DAGSTER_DATABASE_URL for job history")
        return OK
    # 🔴 ASKED AND COULD NOT LOOK, so CANNOT. imac hit this with a traceback:
    # `permission denied for table runs`.
    #
    # ⚠️ Their own advice caused it and they corrected it — "the same host and
    # credentials with the database name swapped" is wrong. The host is the same;
    # the ROLE is not. `runs` and `event_logs` are owned by the `dagster` role and
    # Atlas has no SELECT on them, so a URL built from Atlas's string connects and
    # then fails on the first query. On this cluster the credentials live in
    # `dagster-postgresql-secret`.
    #
    # 🔵 That makes wrong credentials likelier in the field than absent ones — a
    # copied env file, a rotated password, a role without the grant — so the
    # unauthorised path must degrade exactly as the unset path does rather than
    # crash. One more exception class, as they said.
    state = OK
    try:
        conn = _conn(url)
    except CannotAnswer as exc:
        print(f"  not available — {exc}")
        return CANNOT
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                select pipeline_name, status, to_timestamp(start_time)
                from runs
                where start_time is not null
                order by start_time desc
                limit 200
                """
            )
            seen: dict[str, list] = {}
            for name, status, started in cur.fetchall():
                seen.setdefault(name, []).append((status, started))
            for name, runs in sorted(seen.items()):
                status, started = runs[0]
                # 🔴 A single failure is noise; a run of them is a system that has
                # stopped. Sixteen identical failures were what nothing aggregated.
                streak = 0
                for s, _ in runs:
                    if s == "FAILURE":
                        streak += 1
                    else:
                        break
                # ⚠️ CRITERION C also asks for "a job that hasn't run". A job absent
                # from `runs` entirely cannot be seen from here at all — stated
                # below rather than silently omitted.
                age_h = _hours_since(started)
                stale = age_h is not None and age_h > 24
                flags = []
                if streak > 1:
                    flags.append(f"{streak} consecutive")
                if stale:
                    flags.append(f"no run in {age_h:.0f} h")
                flag = ("   " + ", ".join(flags) + "   ⚠️") if flags else ""
                print(f"  {name:<26}{status:<10}{started:%Y-%m-%d %H:%M}{flag}")
                if flags:
                    state = worst(state, WARN)
                # 🔴 The error's own text, criterion C. Printing "FAILURE" turns into
                # a support round-trip; printing the message turns into a fix — the
                # 7.5-hour outage was one line that named the problem exactly.
                if status == "FAILURE":
                    msg = _last_error(cur, name)
                    if msg:
                        print(f"      last error: {msg}")
        print("  ⚠️ a job that has never run at all does not appear here — Dagster's")
        print("     `runs` table has no row for it. Compare against schedules.py.")
    except Exception as exc:  # noqa: BLE001 — a schema and a role this tool does not own
        print(f"  not available — {exc}")
        return CANNOT
    return state


def _api_orgnrs(orgnrs: list[str]) -> tuple[set[str] | None, str]:
    """
    One HTTP request asking the PUBLIC API which of these organisations it serves.

    🔴 CRITERION B, AND I MISSED IT ONCE ALREADY. imac's rule is that the API
    column must be an HTTP request rather than a database query. I applied it to
    the deletion check and left `--last N` reading `marts.dim_brreg_enhet` —
    the same mistake, one function further down, in the same commit that fixed it.

    ⚠️ A dimension row proves the transform ran. It does not prove PostgREST is
    serving it: the 70-second 404, the cached dropped view and the reverted
    COMMENTs all had correct rows in Postgres.

    One request, not N: PostgREST's `in.(...)` answers for the whole batch.
    Returns (None, reason) when it cannot ask — never an empty set, because
    "the API serves none of these" and "I could not reach the API" are opposite
    findings that look identical as an empty set.
    """
    base = os.environ.get("ATLAS_POSTGREST_URL") or os.environ.get("POSTGREST_URL")
    if not base:
        return None, "set ATLAS_POSTGREST_URL to verify over the API"
    joined = ",".join(orgnrs)
    url = (f"{base.rstrip('/')}/brreg_enhet"
           f"?organisasjonsnummer=in.({joined})&select=organisasjonsnummer")
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            rows = json.loads(resp.read().decode() or "[]")
        return {r["organisasjonsnummer"] for r in rows}, ""
    except Exception as exc:  # noqa: BLE001
        return None, f"API unreachable: {exc}"


def last_changes(cur, n: int) -> int:
    """Terje's suggestion: for each recent change, what it was and whether it landed."""
    print()
    print(f"Last {n} changes")
    cur.execute(
        """
        select v.oppdateringsid, v.organisasjonsnummer, v.endringstype, v.fetched_at
        from raw.brreg_enheter_versions v
        order by v.oppdateringsid desc limit %s
        """,
        (n,),
    )
    rows = cur.fetchall()
    if not rows:
        print("  no changes in the feed yet")
        return OK

    served, why = _api_orgnrs([r[1] for r in rows])
    if served is None:
        print(f"  ⚠️ cannot verify over the API — {why}")

    state = CANNOT if served is None else OK
    for oid, orgnr, kind, fetched in rows:
        if served is None:
            verdict = "unknown   (API not asked)"
        elif kind in ("Sletting", "Fjernet"):
            # The most informative line in the block: a deletion that failed to
            # propagate looks identical to one that succeeded unless you look.
            if orgnr in served:
                verdict, state = "STILL SERVED ⚠️", worst(state, WARN)
            else:
                verdict = "removed   (absent, correct)"
        elif orgnr in served:
            verdict = "ok        served by the API"
        else:
            verdict, state = "MISSING from the API ⚠️", worst(state, WARN)
        print(f"  {oid:<11}{orgnr:<12}{kind:<11}{fetched:%H:%M}   {verdict}")
    return state


def main(argv: list[str]) -> int:
    n = 0
    if len(argv) >= 2 and argv[1] == "--last":
        if len(argv) < 3 or not argv[2].isdigit():
            print("usage: atlas-status.py [--last N]", file=sys.stderr)
            return 2
        n = int(argv[2])
    elif len(argv) > 1:
        print("usage: atlas-status.py [--last N]", file=sys.stderr)
        return 2

    db = os.environ.get("ATLAS_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db:
        print("✗ ATLAS_DATABASE_URL or DATABASE_URL must be set", file=sys.stderr)
        return 2

    try:
        conn = _conn(db)
    except CannotAnswer as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 2

    state = OK
    try:
        with conn, conn.cursor() as cur:
            state = worst(state, register_block(cur))
            state = worst(state, deletion_block(cur))
            state = worst(state, ingest_block(cur))
            if n:
                state = worst(state, last_changes(cur, n))
    except CannotAnswer as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        # ⚠️ An unexpected error is "cannot look" (2), never "looked and it is
        # fine" (0). The old script printed a header with blank values and
        # carried on when psql was missing.
        print(f"✗ cannot answer: {exc}", file=sys.stderr)
        return 2

    state = worst(state, jobs_block())
    # 0 healthy · 1 looked and found fault · 2 could not look.
    # ⚠️ CANNOT dominates WARN on purpose: if any part of the picture is missing,
    # the parts that are present do not add up to "healthy", and a caller doing
    # `atlas-status.py && deploy` must not proceed on a partial view.
    return state


if __name__ == "__main__":
    sys.exit(main(sys.argv))
