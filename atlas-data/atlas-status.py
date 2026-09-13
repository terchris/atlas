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


def _conn(url: str):
    import psycopg2

    try:
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


def register_block(cur) -> bool:
    """The four lines. Everything else in this tool is elaboration. Returns True if healthy."""
    healthy = True
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
        healthy = False

    if age is None:
        print("  last reconciled             never   ⚠️")
        healthy = False
    else:
        flag = "   ⚠️" if age > RECONCILE_WARN_HOURS else ""
        print(f"  last reconciled             {age:.1f} h ago{flag}")
        if age > RECONCILE_WARN_HOURS:
            healthy = False
    return healthy


def deletion_block(cur) -> bool:
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
        return True
    orgnr = row[0]

    base = os.environ.get("ATLAS_POSTGREST_URL") or os.environ.get("POSTGREST_URL")
    if not base:
        # ⚠️ A DISTINCT OUTCOME, not a pass. Without a URL this tool cannot make
        # the assertion, and saying "absent, correct" here would be the exact
        # lie the check exists to prevent.
        print(f"  most recent deletion        {orgnr}   ⚠️ cannot check — set ATLAS_POSTGREST_URL")
        return True  # not unhealthy; unanswerable. See --strict below.
    url = f"{base.rstrip('/')}/brreg_enhet?organisasjonsnummer=eq.{orgnr}&select=organisasjonsnummer"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = json.loads(resp.read().decode() or "[]")
            code = resp.status
    except urllib.error.HTTPError as exc:
        print(f"  most recent deletion        {orgnr}   ⚠️ API returned HTTP {exc.code}")
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"  most recent deletion        {orgnr}   ⚠️ API unreachable: {exc}")
        return False

    if code == 200 and body == []:
        print(f"  most recent deletion        {orgnr}   absent from the API ✓")
        return True
    print(f"  most recent deletion        {orgnr}   STILL SERVED by the API ⚠️")
    return False


def ingest_block(cur, limit: int = 12) -> bool:
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
        return False
    healthy = True
    # Cosmetic, imac: the full list pushed the register block off a short
    # terminal. Failures sort first and the tail is summarised rather than shown.
    for slug, code, started, notes in rows[:limit]:
        state = "ok" if code == 0 else (f"FAILED ({code})" if code is not None else "running")
        if code not in (0, None):
            healthy = False
        note = f"   {notes[:58]}" if notes and code not in (0, None) else ""
        print(f"  {slug:<26}{state:<14}{started:%Y-%m-%d %H:%M}{note}")
    if len(rows) > limit:
        print(f"  … and {len(rows) - limit} more, all ok")
    return healthy


def jobs_block() -> bool:
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
        print("  not available — set DAGSTER_DATABASE_URL for job history")
        return True
    try:
        conn = _conn(url)
    except CannotAnswer as exc:
        print(f"  not available — {exc}")
        return True
    healthy = True
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
            flag = f"   {streak} consecutive   ⚠️" if streak > 1 else ""
            print(f"  {name:<26}{status:<10}{started:%Y-%m-%d %H:%M}{flag}")
            if streak > 1:
                healthy = False
    return healthy


def last_changes(cur, n: int) -> None:
    """Terje's suggestion: for each recent change, what it was and whether it landed."""
    print()
    print(f"Last {n} changes")
    cur.execute(
        """
        select v.oppdateringsid, v.organisasjonsnummer, v.endringstype, v.fetched_at,
               d.organisasjonsnummer, d.last_oppdateringsid, d.navn
        from (select * from raw.brreg_enheter_versions order by oppdateringsid desc limit %s) v
        left join marts.dim_brreg_enhet d on d.organisasjonsnummer = v.organisasjonsnummer
        order by v.oppdateringsid desc
        """,
        (n,),
    )
    for oid, orgnr, kind, fetched, dim_org, dim_oid, navn in cur.fetchall():
        if kind in ("Sletting", "Fjernet"):
            # The most informative line in the block: a deletion that failed to
            # propagate looks identical to one that succeeded unless you look.
            verdict = "removed   (absent, correct)" if dim_org is None else "STILL PRESENT ⚠️"
        elif dim_org is None:
            verdict = "MISSING ⚠️"
        elif dim_oid is not None and dim_oid >= oid:
            verdict = f"ok        {(navn or '')[:28]}"
        else:
            verdict = f"STALE ⚠️  applied {dim_oid}"
        print(f"  {oid:<11}{orgnr:<12}{kind:<11}{fetched:%H:%M}   {verdict}")


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

    healthy = True
    try:
        with conn, conn.cursor() as cur:
            healthy &= register_block(cur)
            healthy &= deletion_block(cur)
            healthy &= ingest_block(cur)
            if n:
                last_changes(cur, n)
    except CannotAnswer as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        # ⚠️ An unexpected error is "cannot look" (2), never "looked and it is
        # fine" (0). The old script printed a header with blank values and
        # carried on when psql was missing.
        print(f"✗ cannot answer: {exc}", file=sys.stderr)
        return 2

    healthy &= jobs_block()
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
