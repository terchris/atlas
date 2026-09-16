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
        served, an ingest source failed, or changes are waiting and nothing is
        scheduled to apply them
    2   cannot answer — no connection string, bad argument, database unreachable

⚠️ 2 is deliberately distinct from 1. "I looked and it is wrong" and "I could not
look" are different answers, and collapsing them is how a broken check reads as
a finding.

🔴 IF YOU GATE ON THIS — `atlas-status.py && deploy` — READ THIS PARAGRAPH.
THE CONTRACT CHANGED ON 2026-09-16 AND IT CHANGED IN THE PERMISSIVE DIRECTION.

Until then, a block that could not look returned 2, so any missing piece stopped
a gating caller. It no longer does. A block whose answer the HEADLINE does not
depend on now returns 0 when it cannot look, and says so in its output. The
Automation block is one: on a host with no Dagster wiring, `&& deploy` PROCEEDS
with "what is scheduled" unread, where it used to stop.

The reason is that the alternative is worse — returning 2 on every host without
Dagster wiring makes the exit status report THIS TOOL'S OWN CONFIGURATION rather
than Atlas's health, and a gate that fails on its own wiring teaches its operator
to ignore it.

⚠️ SO: exit 0 means "the headline question was answered and nothing is wrong with
it". It does NOT mean every block answered. If your gate needs the second, grep
the output — every block that cannot look prints a line saying so and why:

    atlas-status.py | grep -q "cannot tell what is running" && exit 1

That is the supported way to tighten it. Do not ask for the exit code to be
widened; that trade is argued at automation_block and was made deliberately.

ENVIRONMENT
    ATLAS_DATABASE_URL / DATABASE_URL   required
    ATLAS_POSTGREST_URL / POSTGREST_URL optional — without it the deletion check
                                        cannot be made over HTTP and says so
    DAGSTER_GRAPHQL_URL                 optional — job history AND automation
                                        state, over Dagster's public API. Needs
                                        NO database role. UIS supplies it via
                                        `env_from_services`. A host may
                                        legitimately run Atlas without Dagster,
                                        and without this the tool must not claim
                                        a transform is coming (urb-agents #1035).

    ⚠️ DAGSTER_DATABASE_URL is GONE and is not read anywhere. It was refused
    rather than deprecated: a code location's environment is copied into every
    run pod it launches, so injecting it would have handed the `dagster` role —
    owner of runs, event_logs and schedules for every code location on the
    installation — to arbitrary tenant asset code (tor-agent, urb-agents #1150).
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

# 🔴 AN IDLE REGISTER IS NOT A STALE ONE, AND THE CLOCK ALONE CANNOT TELL.
#
# `last reconciled 2.2 h ago ⚠️` fired on a completely current register at 20:24Z
# (ops-dev, urb-agents #1080/#1081): every change Brreg published was applied
# within nine minutes, `pending` was 0, all five instigators were running — and
# the command exited 1. Brreg had simply published nothing since 18:01, which
# overnight on a public register is the NORMAL state. So this fired EVERY NIGHT.
#
# ⚠️ Elapsed time since the last reconcile measures how long since there was
# anything TO DO, not whether anything is wrong. The bound has to come from what
# actually happened: nothing pending, and the feed still polling successfully.
#
# 🔵 THE EXEMPTION IS GRANTED ONLY ON POSITIVE EVIDENCE. No successful poll on
# record — a dead feed, a feed that has never run, or an unreadable
# `raw.ingest_runs` — is NOT idle and still warns. "I could not establish that
# the feed is alive" must never render as "the feed is alive", which is the
# mistake this whole tool exists to catch.
FEED_SOURCE = "brreg-oppdateringer"
# The feed polls at :00/:30, so an hour is two missed polls: long enough not to
# fire on one slow run, short enough that a dead feed surfaces inside a single
# reconcile window.
FEED_SILENT_WARN_HOURS = 1.0

# 🔴 THE PROMISE AND THE EVIDENCE FOR IT MUST SIT IN THE SAME PROCESS.
#
# This tool printed "N deletion(s) awaiting the next transform (:10/:40) — not a
# fault" and exited 0 whether or not a transform was coming (ops-dev, urb-agents
# #1035). Everything in this code location ships STOPPED — two schedules, two
# sensors and Dagster's default automation-condition sensor, none of them
# declaring a default status — so on a fresh install there IS no next transform.
#
# ⚠️ That is the first state every operator is in, and the documented happy path
# walks straight through it: install, load first data, skip the go-live step, run
# this command, read green. A false alarm wastes attention; a false all-clear
# spends it.
#
# 🔵 THE RULE, AND IT BINDS WHOEVER WRITES THE SENTENCE: do not say a scheduled
# event is coming without having checked that something is scheduled. A wrapper
# around this command can add a line but it cannot unsay one, which is why this
# is fixed here and not in UIS.
TRANSFORM_SCHEDULE = "brreg_transform_half_hourly"

# RUNNING is a human having started it. DECLARED_IN_CODE — AUTOMATICALLY_RUNNING
# before Dagster renamed it, and both spellings still appear in stored rows — is
# `default_status=RUNNING` in the definitions, which the daemon persists as a row
# on its first tick. Both mean ticks are coming; STOPPED does not, and neither
# does no row at all.
RUNNING_STATUSES = frozenset({"RUNNING", "DECLARED_IN_CODE", "AUTOMATICALLY_RUNNING"})


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
    """
    CANNOT dominates WARN dominates OK. Not-asked is OK; asked-and-unanswerable is CANNOT.

    ⚠️ Validates rather than trusting. A block that returned a display string
    instead of a state once turned `max()` into a TypeError that surfaced as
    "cannot answer" — a bug wearing a connectivity failure's clothes. Naming the
    offending value makes the next one unmistakable in one line.
    """
    for st in states:
        if st not in (OK, WARN, CANNOT):
            raise TypeError(f"not a status state: {st!r} — a block returned the wrong type")
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


def build_block() -> None:
    """
    🔴 WHICH BUILD ACTUALLY RAN THIS. imac, urb-agents #940:

        "`check` reads the REGISTRY's pinned definition, not the host's installed
         pin. They coincide today. When they diverge, the command reports on a
         definition the host is not running."

    ⚠️ That is the artifact-versus-installed gap, and it has cost this fleet
    twice: a host serving corrected documentation from a build that did not
    contain it, and a nomination carrying the wrong digest because two objects
    share one tag.

    🔵 UIS can only report the definition it pinned. This tool is the only thing
    in the loop that knows what actually executed — the image bakes
    ATLAS_GIT_SHA at build time and asserts it was passed, so the answer is
    always available where it matters. Printing it makes a divergence visible in
    the same output rather than requiring someone to suspect it.

    Not a health signal: it never warns and never changes the exit code. An
    operator comparing it against the pinned definition is the check; this line
    only makes the comparison possible.
    """
    sha = os.environ.get("ATLAS_GIT_SHA", "")
    print("Build")
    if sha and sha != "unknown":
        print(f"  this output came from    {sha[:7]}")
    else:
        # ⚠️ Absence is reported, not glossed. Running outside the image is
        # legitimate — it is how this tool is developed — but an operator must
        # not read a missing answer as agreement with the pin.
        print("  this output came from    unknown — ATLAS_GIT_SHA unset (not running from the image)")
    print("  ⚠️ `uis template check` reports the REGISTRY's pinned definition. If that")
    print("     pin and the line above disagree, the host is not running what was pinned.")
    print()
    # ⚠️ stdout is block-buffered when piped; stderr is not. Without this flush a
    # `✗ cannot answer` line lands ABOVE the build it came from, and the operator
    # reads the error as belonging to nothing.
    sys.stdout.flush()


def register_block(cur, running: set[str] | None) -> int:
    """
    The four lines. Everything else in this tool is elaboration.

    Returns one of OK/WARN/CANNOT — the docstring said "returns True if healthy"
    long after the boolean it described was replaced by the three-state scheme,
    which is the same species of stale claim as the one #1035 found in the output.
    """
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
    #
    # ⚠️ AGE IS NOT THE ONLY WAY PENDING BECOMES A SYMPTOM, which is what #1035
    # found. Age says "the cycle has had time to run"; it assumes a cycle. With
    # the transform STOPPED there is no cycle, and pending work is stuck from the
    # first minute — no waiting required, and no threshold to tune.
    scheduled = transform_is(running)
    pending_is_symptom = pending > 0 and (
        (age is not None and age > STALE_WARN_HOURS) or scheduled == "stopped"
    )
    if pending == 0:
        print("  pending                     0")
    else:
        detail = ", ".join(f"{n} {t}" for t, n in rows)
        flag = "   ⚠️" if pending_is_symptom else ""
        print(f"  pending                     {pending:<10} ({detail}){flag}")
        if scheduled == "stopped":
            print(f"  {'':<28}nothing is scheduled to apply these — see Automation below")
    if pending_is_symptom:
        state = WARN

    if age is None:
        print("  last reconciled             never   ⚠️")
        return WARN

    # 🔴 #1081. `age` alone cannot separate "we have not reconciled because we
    # are broken" from "we have not reconciled because nothing arrived". With
    # nothing pending AND the feed still polling successfully, the second is
    # proven and the register is current with respect to everything the feed has
    # recorded — which is the only currency this tool can claim.
    feed_hours = _feed_last_success(cur)
    idle = pending == 0 and feed_hours is not None and feed_hours <= FEED_SILENT_WARN_HOURS

    stale_is_symptom = age > RECONCILE_WARN_HOURS and not idle
    flag = "   ⚠️" if stale_is_symptom else ""
    print(f"  last reconciled             {age:.1f} h ago{flag}")

    if idle and age > RECONCILE_WARN_HOURS:
        mins = feed_hours * 60
        print(f"  {'':<28}idle, not stale — 0 pending and the feed polled {mins:.0f} min ago")
    elif stale_is_symptom:
        # Say WHICH of the two reasons it is, because they need different fixes.
        if feed_hours is None:
            print(f"  {'':<28}and {FEED_SOURCE} has no successful poll on record")
        elif feed_hours > FEED_SILENT_WARN_HOURS:
            print(f"  {'':<28}and {FEED_SOURCE} last polled successfully {feed_hours:.1f} h ago")

    if stale_is_symptom:
        state = WARN
    return state


def _feed_last_success(cur) -> float | None:
    """
    Hours since the change feed last polled SUCCESSFULLY, or None if it never has.

    ⚠️ `exit_code = 0` and not merely "a row exists". A run still in flight has a
    null exit code and a failed one is non-zero; neither is evidence the feed is
    alive, and this value is used to SUPPRESS a warning, so a generous reading of
    it would suppress a real one.

    🔵 A poll that finds nothing is still a successful poll. That is the whole
    point: `types={}` six times in three hours is the feed working against a
    quiet register, and it is what tells an idle register apart from a dead one.
    """
    row = _one(
        cur,
        "select max(started_at) from raw.ingest_runs "
        "where source_slug = %s and exit_code = 0",
        (FEED_SOURCE,),
    )
    return _hours_since(row[0]) if row and row[0] else None


# 🔵 Dagster's PUBLIC API, replacing a read of its private tables.
#
# This used to be `select status, instigator_body from instigators` against the
# `dagster` database — a table this tool does not own, reached with a credential
# it should never have been given. The name lived only inside `instigator_body`,
# a serialised blob whose field spelling Dagster had ALREADY renamed once under
# us (`job_name` -> `instigator_name`), so the old code tried both and returned
# "unknown" for any third spelling.
#
# tor-agent refused the credential and was right to (urb-agents #1150): the code
# location's environment is copied into EVERY run pod it launches
# (`includeConfigInLaunchedRuns` defaults true), so "a credential for a status
# script" would have been the `dagster` role — owner of runs, event_logs and
# schedules for every code location on the installation — delivered into
# arbitrary tenant asset code. The API needs no role at all.
#
# ⚠️ NO repositorySelector ON PURPOSE. The selector needs the code location's
# name, which UIS parameterises from `params.app_name`, so hard-coding
# "atlas-data" would break any install that renamed it. This asks for every
# repository and the block PRINTS the location it answered from, so an answer
# coming from somewhere unexpected is visible rather than silent.
_INSTIGATOR_QUERY = """
{
  repositoriesOrError {
    ... on RepositoryConnection {
      nodes {
        name
        location { name }
        schedules { name scheduleState { status } }
        sensors { name sensorState { status } }
      }
    }
  }
}
"""

# imac measured 200 in 32 ms from inside the code-location pod. Ten seconds is
# not a latency budget, it is the point at which "not answering" is the answer.
GRAPHQL_TIMEOUT_S = 10


def _dagster_graphql(query: str) -> tuple[object | None, str | None]:
    """
    Ask Dagster's GraphQL API. Returns (data, why_not) — exactly one is None.

    🔴 DO NOT BRANCH ON `status != 200`. imac measured this from inside the pod
    (urb-agents #1151): a MALFORMED QUERY returns 400 with a JSON `errors` body,
    and so does an unauthenticated GET. Treating not-200 as "cannot reach
    Dagster" would render a fault in THIS FILE as a network failure — the same
    defect this whole change exists to fix, one layer up, and `!= 200` is the
    obvious branch to write.

    🔴 A REFUSAL IS NOT DISTINGUISHABLE FROM A TIMEOUT HERE, so this must not
    claim one. imac's table, `-m 5` from inside the pod:

        real endpoint         200   exit 0
        DNS does not resolve  000   exit 6    <- the only distinguishable failure
        port with no listener 000   exit 28
        unroutable address    000   exit 28

    Nothing returns curl's 7, because traffic to a ClusterIP port with no
    listener is DROPPED rather than refused. So a wrong port and a NetworkPolicy
    are the same observation, and the honest wording is "reason indeterminate".
    Naming a cause we have not established is worse than naming none.

    ⚠️ Reachability was proven on a cluster with no NetworkPolicy in `dagster`.
    If one ever appears this becomes the indeterminate branch, which is why that
    branch says what to check instead of what happened.
    """
    url = os.environ.get("DAGSTER_GRAPHQL_URL")
    if not url:
        return None, "DAGSTER_GRAPHQL_URL is not set here"
    endpoint = url.rstrip("/") + "/graphql"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=GRAPHQL_TIMEOUT_S) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        # 🔵 A response WITH a body is Dagster answering, not the network
        # failing. Say so, and quote it — this is almost always our own query.
        detail = None
        try:
            detail = json.loads(exc.read().decode()).get("errors")
        except Exception:  # noqa: BLE001 — a body we cannot parse is still a body
            pass
        if detail:
            return None, f"Dagster rejected the query (HTTP {exc.code}): {str(detail)[:200]}"
        return None, f"Dagster answered HTTP {exc.code} with no error body"
    # 🔴 NOT `except Exception`. A bare catch here reports a NameError or an
    # AttributeError in THIS FILE as "could not reach Dagster" — blaming the
    # network for our own bug, which is the exact trap imac named one paragraph
    # up, arrived at from the other side. Caught while writing the tests: a typo
    # in the test harness surfaced as a reachability failure, exactly as a real
    # one would have. Transport errors are named; a programming error belongs to
    # main()'s handler, which says "cannot answer: <class>" and exits 2.
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return None, (
            f"could not reach {endpoint} — reason indeterminate "
            f"({type(exc).__name__}). Check the service is up and that no "
            f"NetworkPolicy in the dagster namespace blocks this pod."
        )
    try:
        payload = json.loads(raw.decode())
    except (ValueError, UnicodeDecodeError):
        # Dagster answered with something that is not JSON. That is an answer,
        # not a reachability failure, and must not be worded as one.
        return None, f"Dagster's reply from {endpoint} was not JSON"
    # ⚠️ A 200 can still carry `errors` instead of `data`. Same rule: that is
    # Dagster answering us, not a reachability problem.
    if isinstance(payload, dict) and payload.get("errors"):
        return None, f"Dagster returned errors: {str(payload['errors'])[:200]}"
    if not isinstance(payload, dict) or payload.get("data") is None:
        return None, "Dagster returned no data and no errors"
    return payload["data"], None


def instigator_states() -> tuple[set[str] | None, str | None, str | None]:
    """
    (running names, the location they came from, why_not) — `why_not` is set
    exactly when the names are None.

    🔴 None IS NOT AN EMPTY SET, and that distinction is why this function
    exists. "No automation is running" and "I could not ask what is running" are
    opposite findings: the first makes a pending change a fault, the second makes
    it unknown. Collapsing them to a falsy value would recreate the bug one level
    down — `_api_orgnrs` carries the same rule for the same reason.

    ⚠️ NO ENTRY MEANS STOPPED ONLY BECAUSE NOTHING HERE DECLARES ITSELF RUNNING.
    Atlas declares no `default_status` anywhere, so absence is stoppedness — an
    assumption held by `test_nothing_declares_itself_running`, which fails the
    day it stops being true and names this function.
    """
    data, why_not = _dagster_graphql(_INSTIGATOR_QUERY)
    if data is None:
        return None, None, why_not
    try:
        nodes = data["repositoriesOrError"]["nodes"]
    except Exception:  # noqa: BLE001 — a shape we do not recognise is not an answer
        return None, None, "Dagster's reply did not contain a repository list"

    running: set[str] = set()
    locations: set[str] = set()
    for node in nodes:
        location = ((node.get("location") or {}).get("name")) or "?"
        locations.add(location)
        for key, state_key in (("schedules", "scheduleState"), ("sensors", "sensorState")):
            for item in node.get(key) or []:
                status = ((item.get(state_key) or {}).get("status"))
                if status in RUNNING_STATUSES:
                    name = item.get("name")
                    if not name:
                        # Something IS running and this tool cannot say what.
                        # Reporting the rest as "nothing relevant is running"
                        # would be a false alarm built out of a parse failure.
                        return None, None, "Dagster reported a running instigator with no name"
                    running.add(name)
    return running, ", ".join(sorted(locations)), None


def running_instigators() -> set[str] | None:
    """Names only — the shape every caller downstream already expects."""
    running, _location, _why = instigator_states()
    return running


def transform_is(running: set[str] | None) -> str:
    """
    'running' | 'stopped' | 'unknown' — three answers, deliberately not a bool.

    ⚠️ The same lesson as the exit scheme twenty lines up: a single boolean
    cannot hold three states, and the state it silently drops is the one about
    not knowing.
    """
    if running is None:
        return "unknown"
    return "running" if TRANSFORM_SCHEDULE in running else "stopped"


def _awaiting(scheduled: str) -> str:
    """
    The clause that follows a count of unapplied changes — one per answer.

    🔴 There is no default arm. A wording chosen by falling through is how the
    old sentence came to promise a transform on a host that had none.
    """
    if scheduled == "running":
        return " — awaiting the next transform (:10/:40), not a fault"
    if scheduled == "stopped":
        return f" — {TRANSFORM_SCHEDULE} is STOPPED, nothing will apply them   ⚠️"
    return " — whether anything is scheduled to apply them is unknown (see Automation)"


def automation_block(
    running: set[str] | None,
    location: str | None = None,
    why_not: str | None = None,
) -> int:
    """
    What is scheduled — printed because the numbers above are only meaningful
    alongside whether anything will ever change them.

    🔴 THIS BLOCK NEVER WARNS ON ITS OWN, AND THAT IS A DECISION, NOT AN
    OVERSIGHT. A deliberately stopped install is a legitimate state — it is the
    state the install guide leaves you in, between loading first data and going
    live — and a check that exits 1 there teaches its operator that 1 is normal.
    The documented verification step would have to expect 1, and a real fault
    would then be indistinguishable from the expected one. That is precisely how
    the `pending > 0` line cried wolf before D2.

    🔵 So stoppedness is reported loudly and costs nothing until something is
    waiting on it. The blocks that have work in hand — the register's `pending`
    count and the deletion assertion — are the ones that turn it into a warning,
    because they are the ones that can tell whether anything is actually stuck.
    """
    print()
    print("Automation")
    state = transform_is(running)
    if state == "unknown":
        # 🔵 NOT ASKED or could not look — either way this tool says so and makes
        # no claim in the blocks that depend on it. Not CANNOT: the headline
        # question (is an applied deletion still served?) does not need this, and
        # returning 2 on every host without Dagster wiring would make the exit
        # code report the tool's own configuration instead of Atlas's health.
        # ⚠️ THE REASON IS PRINTED, NOT SUMMARISED. "cannot tell" with no cause
        # is what sent an operator to export a variable that could never reach
        # this pod (urb-agents #1149). Whatever `_dagster_graphql` established —
        # unset, rejected query, or unreachable-reason-indeterminate — is the
        # operator's only handle on which of those it is.
        print("  cannot tell what is running")
        print(f"  {why_not or 'no reason was recorded, which is itself a defect'}")
        # 🔴 SAID OUT LOUD BECAUSE IT IS A CONTRACT CHANGE, NOT A DETAIL
        # (ops-dev, urb-agents #1163). Before 2026-09-16 this path returned
        # CANNOT and stopped a caller doing `atlas-status.py && deploy`. It now
        # returns OK, so that caller proceeds with this block unread. Whoever
        # was relying on the old behaviour is entitled to hear it from the tool
        # rather than discover it from a deploy that should not have happened.
        print("  ⚠️ this does NOT affect the exit code: a gating caller such as")
        print("     `atlas-status.py && deploy` will PROCEED with this block unread.")
        print("     To gate on it, grep for this line.")
        _dagster_graphql_remedy()
        return OK
    if state == "running":
        others = len(running) - 1
        print(f"  {TRANSFORM_SCHEDULE:<30}RUNNING")
        print(f"  {'other instigators running':<30}{others}")
        # 🔵 WHICH code location answered. No repositorySelector is sent (see
        # _INSTIGATOR_QUERY), so on an installation with several code locations
        # a name could in principle come from a neighbour. Printing the source
        # makes that visible instead of silently wrong.
        if location:
            print(f"  {'answered by code location':<30}{location}")
        return OK
    print(f"  {TRANSFORM_SCHEDULE:<30}STOPPED")
    print(f"  {'other instigators running':<30}{len(running)}")
    print("  Nothing is scheduled to reconcile the register: it holds whatever was")
    print("  last loaded, and will not change. Enabling automation is step 4 of the")
    print("  install guide — `uis dagster automation --start` sets it.")
    # 🔴 THIS LINE USED TO SEND OPERATORS TO RAW GraphQL FOR A CAPABILITY THEIR
    # TOOL ALREADY HAD. It said `uis dagster automation` "reports and asserts
    # state but cannot set it; that needs startSchedule / startSensor mutations".
    # imac used `--start` / `--stop` on UIS 1.6.106 and they set it correctly
    # (ops-dev, urb-agents #1149).
    #
    # ⚠️ A tenant artifact asserting what the PLATFORM's CLI cannot do is a claim
    # about someone else's surface, on their release cadence, with nothing here
    # that fails when it stops being true. It was right when written and rotted
    # silently. Verified on 1.6.106; if it needs a floor stated, state the
    # version rather than re-deriving the capability.
    return OK


def _dagster_graphql_remedy() -> None:
    """
    The Automation block's remedy, which needs no credential at all.

    🔵 `DAGSTER_GRAPHQL_URL` is declared in template-info.yaml via
    `env_from_services`, so on a UIS install it is set for you and this remedy
    should never print. It printing means the declaration did not bind, or the
    endpoint did not answer — both of which are worth a sentence rather than a
    shrug.
    """
    print("  This build asks Dagster's GraphQL API, which needs no database role.")
    print("  On UIS the address arrives from `env_from_services: DAGSTER_GRAPHQL_URL`;")
    print("  if it is missing the declaration did not bind. Elsewhere, set it to")
    print("  Dagster's webserver base URL — this appends /graphql.")


def _address_hint(url: str) -> str:
    """
    🔴 ONE NAME, TWO CORRECT ANSWERS, AND THE CONSUMER CANNOT TELL WHICH IT GOT.

    `exports.api-url` is `http://api-<app>.localhost` — the address a developer
    types into a browser on the machine running the cluster. `env_from_exports`
    delivers it into a POD, which is a different network namespace, and
    `.localhost` is loopback by definition (RFC 6761). So the check was pointed
    at itself and reported the public API unreachable while it was serving fine
    (imac, urb-agents #958).

    ⚠️ It is NOT a missing ingress, and saying so matters because that is the
    first thing anyone reaches for: imac measured `curl` exit 7 — resolved,
    connection refused — not exit 6, could not resolve. A cluster WITH the
    ingress behaves identically, because the pod is calling its own loopback
    rather than the proxy on the host.

    🔵 This does not fix it. It makes one round of confusion unnecessary: the
    failure names the likely cause instead of leaving an operator to discover
    that a working URL is the wrong URL for where it is being used.
    """
    host = url.split("//", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    in_cluster = bool(os.environ.get("KUBERNETES_SERVICE_HOST"))
    if host.endswith(".localhost") and in_cluster:
        return (
            "\n      ⚠️ that address is HOST-facing and this is running in a pod. "
            "`.localhost` is\n"
            "         loopback (RFC 6761), so the request went to this pod, not to "
            "the API.\n"
            "         Not a missing ingress — an in-cluster address is needed here."
        )
    return ""


def deletion_block(cur, running: set[str] | None) -> int:
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
    # 🔴 ASSERT AGAINST A DELETION THE TRANSFORM HAS ALREADY APPLIED.
    #
    # The feed polls at :00/:30 and reconciliation runs at :10/:40 — a deliberate
    # ten-minute offset. So for roughly 11 minutes in every 30 there is a
    # deletion the feed has recorded and the transform has not yet applied, and
    # the API is CORRECTLY still serving it.
    #
    # ⚠️ This block used to take the newest deletion regardless, so a healthy
    # atlas reported UNHEALTHY for ~37% of wall-clock time (imac, urb-agents
    # #983) — and worse, it was indistinguishable from the real thing:
    #
    #     the incident   119 unapplied, 22 deletions served, 8.4 h stale  -> exit 1
    #     normal          40 pending,    7 deletions served, 0.2 h behind -> exit 1
    #
    # 🔴 Two orders of magnitude apart, identical verdict. A check that cries
    # wolf on a third of runs gets ignored, and then the 8.4-hour incident
    # renders the same as the noise. That is the failure this command exists to
    # prevent, committed by the command.
    #
    # 🔵 The fix is not a threshold. It is the exact question: has the transform
    # applied THIS deletion yet? Comparing the deletion's own oppdateringsid
    # against the dimension's watermark answers it with no tuning and no clock —
    # a pending deletion is the system working as designed, and an APPLIED one
    # that is still served is a real fault at any age.
    #
    # ⚠️ D2 was this same mistake in the `pending` line, fixed there and left
    # here. Cycle-awareness applied to one block and not its neighbour.
    applied_row = _one(cur, "select coalesce(max(last_oppdateringsid), 0) from marts.dim_brreg_enhet")
    applied = (applied_row or (0,))[0] or 0

    row = _one(
        cur,
        "select organisasjonsnummer, oppdateringsid from raw.brreg_enheter_versions "
        "where endringstype in ('Sletting','Fjernet') and oppdateringsid <= %s "
        "order by oppdateringsid desc limit 1",
        (applied,),
    )
    pending_row = _one(
        cur,
        "select count(*) from raw.brreg_enheter_versions "
        "where endringstype in ('Sletting','Fjernet') and oppdateringsid > %s",
        (applied,),
    )
    pending_deletions = (pending_row or (0,))[0] or 0

    # 🔴 #1035 — THE SENTENCE BELOW USED TO PROMISE A TRANSFORM IT HAD NOT
    # CHECKED FOR. "Awaiting the next transform (:10/:40) — not a fault" is true
    # when the schedule is running and a lie when it is stopped, and it printed
    # the same either way, over exit 0. The three wordings are the three answers
    # `transform_is` returns; there is no fourth and no default.
    scheduled = transform_is(running)

    if not row:
        if pending_deletions:
            # Not an assertion either way: the only deletions the feed has are
            # newer than the dimension's watermark. Reported so the block is
            # never silently empty.
            print(f"  {pending_deletions} deletion(s) not yet applied{_awaiting(scheduled)}")
        else:
            print("  no deletion in the feed yet — nothing to assert")
        return WARN if (pending_deletions and scheduled == "stopped") else OK
    orgnr, _oid = row
    if pending_deletions:
        print(f"  {pending_deletions} newer deletion(s) not yet applied{_awaiting(scheduled)}")

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
        print(f"  most recent deletion        {orgnr}   ⚠️ API unreachable: {exc}"
              f"{_address_hint(url)}")
        return CANNOT

    if code == 200 and body == []:
        print(f"  most recent applied deletion {orgnr}  absent from the API ✓")
        # ⚠️ The assertion passed and there is still a finding: deletions the
        # register has pulled are going nowhere. Both facts are true and the
        # weaker one must not swallow the stronger.
        return WARN if (pending_deletions and scheduled == "stopped") else OK
    # Applied by the transform and still served: a real fault at any age.
    print(f"  most recent APPLIED deletion {orgnr}  STILL SERVED by the API ⚠️")
    return WARN


def freshness_block(cur) -> int:
    """
    Is every raw source within the window its own declared cadence allows?

    🔴 THE BLOCK BELOW THIS ONE IS A 24-HOUR WINDOW AND CANNOT ANSWER THIS.
    Twenty-three of the bounded sources are weekly and three are monthly, so a
    day after they run they simply drop out of that window and it has nothing
    left to say about them. SSB, FHI and Bufdir could all go stale, the dbt check
    would fail, and this command would still exit 0 — the same false all-clear as
    #1035, one field over (ops-dev, urb-agents #1039).

    ⚠️ THE COMPARISON IS NOT MADE HERE. `marts.mart_source_freshness` makes it,
    and the dbt test `raw_sources_were_refreshed_recently` gates on the same rows.
    This block only counts and prints them. A second implementation of the
    cadence rule living in this file is precisely what the Jobs block below
    refuses to do, and for the same reason: two places that must agree about one
    number is the failure this project keeps meeting.

    🔵 It is a VIEW, so it is evaluated when asked. That is what makes it
    readable here at all — the test's verdict lives in dbt's run results and in
    Dagster's event log, and this tool can read neither; the event log is owned
    by the `dagster` role, which Atlas has no SELECT on.
    """
    print()
    print("Source freshness (declared cadence)")

    # ⚠️ ASKED WITH `to_regclass`, NOT BY QUERYING AND CATCHING. A missing
    # relation raises, and in psycopg2 a raised query aborts the whole
    # transaction — every later block on this connection would then fail with
    # InFailedSqlTransaction and report a fault that belongs to this line.
    exists = _one(cur, "select to_regclass('marts.mart_source_freshness')")
    if not exists or exists[0] is None:
        # 🔴 "ITS ABSENCE MEANS NO TRANSFORM HAS EVER RUN HERE" WAS FALSE, AND IT
        # WAS MY OWN COMMENT (imac via ops-dev, urb-agents #1149).
        #
        # The view is NEW in this build. On an UPGRADE the transform has run for
        # days and the view is missing only because it has not run SINCE — which
        # is a different state with a different remedy and a different severity.
        # imac measured the consequence: b7e513f exit 0, install e439668 exit 2
        # "NOTHING WAS CHECKED", one transform later exit 0 again. Exit 2 is what
        # an upgrader sees at the exact moment they are asking "did my upgrade
        # work", and CANNOT dominates every other block, so a complete and
        # healthy picture was reported as no picture at all.
        #
        # ⚠️ The two cases are told apart by a relation that long predates this
        # one. If marts has been built before, this is an upgrade waiting on a
        # transform; if it has not, nothing has ever run here.
        built_before = _one(cur, "select to_regclass('marts.dim_brreg_enhet')")
        if built_before and built_before[0] is not None:
            # ⚠️ WARN, not CANNOT. "I looked and something needs doing" is true:
            # the upgrade is incomplete until a transform builds the new model.
            # CANNOT would claim nothing was checked, which is false — every
            # other block on this connection answered.
            print("  pending — this view is new in this build and the transform")
            print("  has not run since the upgrade. It self-heals on the next one.")
            print("  (run `uis dagster run transform_and_publish` to close it now)")
            return WARN
        # 🔴 CANNOT is right here and only here: marts has never been built, so
        # there is nothing to compare and nothing else to infer from. Reporting
        # "fresh" because the surface is missing would be absence rendering as
        # green, which is the defect this whole tool exists to catch.
        print("  cannot check — no transform has ever run here")
        print("  (built by the transform; run `uis dagster run transform_and_publish`)")
        return CANNOT

    cur.execute(
        """
        select freshness_status, count(*)
        from marts.mart_source_freshness
        group by 1
        """
    )
    counts = {status: n for status, n in cur.fetchall()}
    bounded = sum(n for s, n in counts.items() if s != "not_bounded")
    silenced = counts.get("not_bounded", 0)
    ok = counts.get("ok", 0)
    bad = bounded - ok

    # 🔴 NAME THE DENOMINATOR, AND MEASURE IT RATHER THAN REMEMBERING IT.
    # "41 of 43 sources" was proposed for this line; both numbers are wrong here.
    # 43 is the count of ingest SLUGS that have ever written to raw.ingest_runs,
    # and this surface counts raw TABLES that declare a loaded_at_field — one
    # slug can write several tables, and the register's tables arrive by a
    # different path. Measured on the declarations: 29 bounded, 5 silenced. The
    # numbers are read from the view every run so they cannot go stale here.
    flag = "   ⚠️" if bad else ""
    print(f"  {bounded} bounded sources, {ok} within cadence"
          + (f", {bad} NOT" if bad else "") + flag)
    if silenced:
        print(f"  {silenced} silenced by declaration (manual or none, each with a written reason)")

    if not bad:
        return OK

    cur.execute(
        """
        select source_table, ingest_cadence, age_days, max_age_days, freshness_status
        from marts.mart_source_freshness
        where freshness_status not in ('ok', 'not_bounded')
        order by freshness_status, source_table
        """
    )
    for table, cadence, age, bound, status in cur.fetchall():
        age_s = f"{age:.1f} d" if age is not None else "never loaded"
        bound_s = f"/ {bound} d" if bound is not None else ""
        print(f"  {table:<28}{cadence:<13}{age_s:<14}{bound_s:<8}{status}")
    return WARN


def ingest_block(cur, limit: int = 12) -> int:
    """Per-source ingest health. Failures first, so a short terminal shows the problem."""
    print()
    # ⚠️ A WINDOW, NOT A THRESHOLD. A source absent from this list has not run in
    # 24 h, which is normal for anything weekly or monthly and says nothing on its
    # own. The freshness VERDICT is the block above, read from
    # `marts.mart_source_freshness`.
    #
    # 🔵 THIS BLOCK IS KEPT, and the argument for removing it was good enough to
    # answer rather than ignore: it "answers a question nobody asked" (ops-dev,
    # #1039). What it answers that the freshness block cannot is whether a run
    # FAILED and with what message — `loaded_at` only moves on success, so a
    # source that has failed every attempt for six hours is still inside its
    # weekly bound and still reports `ok` up there. Recent failures and declared
    # staleness are two questions; the defect was that only one of them was
    # printed, not that this one is worthless.
    print("Ingest runs (last 24 h — recent run outcomes, not a freshness verdict)")
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
    # 🔴 `label` AND `state` ARE TWO THINGS AND USED TO BE ONE NAME.
    #
    # This loop wrote the display string into `state` — the same name as the
    # block's return value — so on a healthy host every row left `state = "ok"`,
    # the function returned a str, and `worst()` did `max(("ok", 0))`:
    #
    #     TypeError: '>' not supported between instances of 'str' and 'int'
    #
    # ⚠️ Caught by main's handler and reported as exit 2, "cannot answer". So the
    # tool built because green signals lied said "I could not look" at a register
    # that was completely fine (imac, urb-agents #918).
    #
    # 🔴 It failed ONLY when everything was healthy. Rows sort failures-first, so
    # the last row printed is an `ok` one unless something is broken — the bug
    # was invisible on exactly the hosts that had a problem, and fired on exactly
    # the hosts that did not.
    #
    # ⚠️ And the second half nobody saw: on a FAILING row `state` was then
    # overwritten with the int WARN and printed, so the line read `1` instead of
    # `FAILED (1)`. The collision corrupted the output as well as the return.
    #
    # 🔵 Introduced by me in the tri-state refactor: I renamed `healthy` to
    # `state` throughout and did not notice this function already had a local
    # `state`. A mechanical rename into a scope that already uses the name.
    #
    # Cosmetic, imac: the full list pushed the register block off a short
    # terminal. Failures sort first and the tail is summarised rather than shown.
    for slug, code, started, notes in rows[:limit]:
        label = "ok" if code == 0 else (f"FAILED ({code})" if code is not None else "running")
        if code not in (0, None):
            state = worst(state, WARN)
        note = f"   {notes[:58]}" if notes and code not in (0, None) else ""
        print(f"  {slug:<26}{label:<14}{started:%Y-%m-%d %H:%M}{note}")
    if len(rows) > limit:
        print(f"  … and {len(rows) - limit} more, all ok")
    return state


# Dagster strips nothing on the way out: the dbt error text arrives with the
# colour codes dbt printed, and unstripped they break alignment for anyone not
# on a colour terminal (imac, urb-agents #1161).
_ANSI = re.compile(r"\x1b\[[0-9;]*m")

# The dbt diagnosis starts here. Everything before it is the invocation — for a
# transform_checks run that is ~1.5 k characters listing all 681 test names, so
# printing the HEAD of the message gives an operator the command and not the
# cause.
_DBT_ERROR_MARKER = "Errors parsed from dbt logs"

# 2065 events in five round trips at this size, 1.5 s wall, measured on a failed
# transform_checks run. The failure event is at the END of the stream — a run
# that plans 681 checks emits 675 planning events first — so a small limit reads
# nothing but planning and concludes there is no message.
_EVENT_PAGE = 500
_EVENT_PAGES_MAX = 12


def _run_events(run_id: str) -> tuple[list[dict] | None, str | None]:
    """
    Every event for one run, paged. (events, why_not) — exactly one is None.

    🔴 BRANCH ON `__typename`, NOT ON THE HTTP STATUS. An unknown or reaped run
    comes back as `{"__typename": "RunNotFoundError"}` with HTTP 200 and no
    exception (imac, urb-agents #1161, found by accident with a truncated runId).
    Same rule as _dagster_graphql's 400-with-a-body, one level in: the transport
    succeeded and the API answered, so the answer has to be read.
    """
    events: list[dict] = []
    cursor = None
    for _ in range(_EVENT_PAGES_MAX):
        after = f', afterCursor: "{cursor}"' if cursor else ""
        query = (
            "{ runOrError(runId: \"%s\") { __typename ... on Run { "
            "eventConnection(limit: %d%s) { cursor hasMore events { __typename "
            "... on ExecutionStepFailureEvent { error { message } } "
            "... on RunFailureEvent { message } } } } } }"
        ) % (run_id, _EVENT_PAGE, after)
        data, why = _dagster_graphql(query)
        if data is None:
            return None, why
        run = data.get("runOrError") or {}
        if run.get("__typename") != "Run":
            return None, f"run {run_id[:8]} is not readable ({run.get('__typename')})"
        conn = run.get("eventConnection") or {}
        events.extend(conn.get("events") or [])
        if not conn.get("hasMore"):
            break
        cursor = conn.get("cursor")
        if not cursor:
            break
    return events, None


def _never_started(events: list[dict]) -> bool:
    """
    Did this run execute anything at all?

    🔴 IMMUNE BY CONSTRUCTION, WHERE THE OLD FILTER WAS IMMUNE BY ACCIDENT. The
    SQL version excluded these with `start_time is not null`, which worked
    because Dagster writes start_time only on PIPELINE_START. **The API does not
    expose that null**: for a never-started run it returns
    `startTime == endTime ==` the database's end_time, the REAP moment (imac
    measured three of them, urb-agents #1161).

    ⚠️ So the obvious port — `if startTime is not None` — matches every orphan,
    computes a 0.0 s duration, and brings back the false streak alarm this block
    already removed once: three runs that never executed a step rendering as
    `transform_checks  3 consecutive  ⚠️`.

    The observation that actually means "nothing ran" is the absence of any step
    start. Measured: an orphan has 676 events — 675 AssetCheckEvaluationPlanned
    plus one RunFailure — and ZERO step starts, against 1 on a healthy run.
    """
    return not any(e.get("__typename") == "ExecutionStepStartEvent" for e in events)


def _failure_text(events: list[dict]) -> str | None:
    """
    The useful sentence from a failed run, or None.

    🔴 THE TWO FAILURE EVENTS PUT IT IN DIFFERENT FIELDS, AND READING ONE FIELD
    ACROSS BOTH RETURNS "" — which looks like "the API has no message" rather
    than "wrong field" (imac, urb-agents #1161):

        ExecutionStepFailureEvent   error.message   the 48 k dbt diagnosis
                                    message         a stub naming the step
        RunFailureEvent             message         "Run timed out due to taking
                                                     longer than 900 seconds to start"
                                    error           EMPTY — className None, message ""

    🔵 The RunFailureEvent half is why launch failures are explicable here at
    all: it names the 900 s start timeout that reaps the orphans, which the
    database blob did not give in one place.
    """
    text = None
    for e in events:
        kind = e.get("__typename")
        if kind == "ExecutionStepFailureEvent":
            text = ((e.get("error") or {}).get("message")) or text
        elif kind == "RunFailureEvent" and not text:
            text = e.get("message") or text
    if not text:
        return None
    text = _ANSI.sub("", text)
    if _DBT_ERROR_MARKER in text:
        text = text[text.index(_DBT_ERROR_MARKER):]
    return " ".join(text.split())[:240]


def jobs_block() -> int:
    """
    Item 3 — job-level history, over Dagster's GraphQL API.

    🔵 This used to read `runs` and `event_logs` in the `dagster` database, which
    needs the `dagster` role. That credential was refused and will not be granted
    (tor-agent, urb-agents #1150): a code location's environment is copied into
    every run pod it launches, so it would hand the owner of runs, event_logs and
    schedules FOR EVERY CODE LOCATION to arbitrary tenant asset code.

    ⚠️ imac priced what the block buys before it was worth porting: it is how the
    in-chain transform_checks FAILURE was found, with its dbt error text, and how
    a transform_checks SUCCESS carrying 18 failed checks was noticed. It answers
    WHY rather than THAT, which is the half an operator cannot reconstruct.
    """
    print()
    print("Jobs")
    query = (
        "{ runsOrError(limit: 200) { __typename ... on Runs { results { "
        "runId jobName status startTime endTime } } } }"
    )
    data, why = _dagster_graphql(query)
    if data is None:
        # 🔵 NOT ASKED or could not look — OK either way, and the reason is
        # printed. A host can legitimately run Atlas without Dagster, and this
        # block is diagnostic context: it explains WHY the register is behind,
        # not WHETHER it is. Its absence cannot hide the headline.
        print(f"  not available — {why}")
        return OK
    runs_or_error = data.get("runsOrError") or {}
    if runs_or_error.get("__typename") != "Runs":
        print(f"  not available — Dagster returned {runs_or_error.get('__typename')}")
        return OK

    state = OK
    seen: dict[str, list] = {}
    orphans = 0
    for r in runs_or_error.get("results") or []:
        started, ended = r.get("startTime"), r.get("endTime")
        # ⚠️ CHEAP PRE-FILTER, CONFIRMED LATER — see _never_started. A run that
        # never executed reports startTime == endTime exactly, because both are
        # the reap moment. That is imac's corroborating signal doing the bulk
        # work so this block does not page events for all 200 runs; the
        # authoritative check runs on the ones that reach the failure path.
        if started is not None and ended is not None and started == ended:
            orphans += 1
            continue
        if started is None:
            continue
        seen.setdefault(r.get("jobName") or "?", []).append(
            (r.get("status"), started, r.get("runId"))
        )

    for name, runs in sorted(seen.items()):
        status, started, run_id = runs[0]
        # 🔴 A single failure is noise; a run of them is a system that has
        # stopped. Sixteen identical failures were what nothing aggregated.
        streak = 0
        for s, _t, _i in runs:
            if s == "FAILURE":
                streak += 1
            else:
                break
        # 🔴 NO STALENESS FLAG HERE, AND ITS REMOVAL IS THE POINT. A fixed 24 h
        # flagged four jobs out of four on a clean host (imac, urb-agents #931),
        # and contradicted the register block one line above it. Assets that
        # automation materialises land under __ASSET_JOB, so a NAMED job sitting
        # idle is correct and harmless. Cadence-aware freshness already exists as
        # the dbt check raw_sources_were_refreshed_recently; recomputing it here
        # would be a second place that must agree.
        flag = f"   {streak} consecutive   ⚠️" if streak > 1 else ""
        stamp = datetime.fromtimestamp(started, timezone.utc)
        print(f"  {name:<26}{status:<10}{stamp:%Y-%m-%d %H:%M}{flag}")
        if streak > 1:
            state = worst(state, WARN)
        # 🔴 The error's own text, criterion C. Printing "FAILURE" turns into a
        # support round-trip; printing the message turns into a fix — the
        # 7.5-hour outage was one line that named the problem exactly.
        if status == "FAILURE" and run_id:
            events, ev_why = _run_events(run_id)
            if events is None:
                print(f"      last error: could not read the run's events — {ev_why}")
            elif _never_started(events):
                # Authoritative confirmation of the pre-filter above, on the only
                # rows where it matters. A run that executed nothing is a LAUNCH
                # failure, not a job failure, and saying so is the difference
                # between looking at dbt and looking at the platform.
                print("      never executed a step — this is a launch failure, not a job failure")
            else:
                msg = _failure_text(events)
                if msg:
                    print(f"      last error: {msg}")
    if orphans:
        print(f"  {orphans} run(s) reaped before executing a step, not counted above")
    print("  ⚠️ This block answers 'did a job fail', not 'is data flowing'. Assets that")
    print("     automation materialises land under __ASSET_JOB, so a named job sitting")
    print("     idle is normal and not a finding. Data freshness is the register block")
    print("     above, and cadence-aware source freshness belongs to the dbt check")
    print("     raw_sources_were_refreshed_recently, which owns that comparison.")
    print("     A job that has NEVER run has no run history and is invisible here.")
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
        return None, f"API unreachable: {exc}{_address_hint(url)}"


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

    # ⚠️ BEFORE the connection check, deliberately. An operator staring at
    # "cannot answer" most needs to know WHICH BUILD said so — provenance is not
    # a finding and must not be gated behind the tool being able to answer.
    # After argument parsing, though: a usage error should print usage, not a
    # report.
    build_block()

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
    # 🔴 READ ONCE, BEFORE ANYTHING THAT DEPENDS ON IT, AND PASS IT DOWN.
    # Two blocks need the same answer and a single report must not contain two of
    # them: a register line saying work is stuck and a deletion line saying it is
    # merely waiting would be this tool disagreeing with itself, which is the
    # failure it was built to catch in the pipeline.
    # One ask, three consumers. `location` and `why_not` exist so the Automation
    # block can print WHICH location answered and WHY it could not — the rest of
    # the file only ever wanted the names.
    running, location, why_not = instigator_states()

    try:
        with conn, conn.cursor() as cur:
            state = worst(state, register_block(cur, running))
            state = worst(state, automation_block(running, location, why_not))
            state = worst(state, deletion_block(cur, running))
            state = worst(state, freshness_block(cur))
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
        # ⚠️ The exception CLASS is printed, not only its message. "cannot
        # answer: TypeError: …" reads as a bug in this tool; "cannot answer:
        # OperationalError: …" reads as the database being unreachable. Both exit
        # 2 — never 0 — but an operator should not have to guess which they have.
        print(f"✗ cannot answer: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    state = worst(state, jobs_block())
    # 0 healthy · 1 looked and found fault · 2 could not look.
    # ⚠️ CANNOT dominates WARN on purpose: a block that ASKED AND COULD NOT LOOK
    # makes the parts that did answer add up to less than "healthy".
    #
    # 🔴 BUT EXIT 0 DOES NOT MEAN EVERY BLOCK ANSWERED, and this comment used to
    # say it did — "a caller doing `atlas-status.py && deploy` must not proceed
    # on a partial view" (imac, urb-agents #1155). That overstated the guarantee
    # and contradicted a decision made twenty lines into automation_block: a
    # block whose answer the HEADLINE does not depend on returns OK when it
    # could not look, rather than failing every host that does not wire it up.
    # The Automation block does exactly that, so such a caller does proceed with
    # automation unknown.
    #
    # ✅ Both are right; together they told a script author two different things.
    # What the exit code actually promises, stated once:
    #
    #   0  the headline question was answered and nothing is wrong with it.
    #      Some diagnostic block may have been unable to look and said so.
    #   1  something was looked at and found wrong.
    #   2  a block the answer DEPENDS ON could not be reached.
    #
    # 🔵 So `atlas-status.py && deploy` is a gate on "is the register healthy",
    # NOT on "is everything known". A caller who needs the second must read the
    # output — every block that cannot look prints why, and that is the surface
    # for it. Do not widen the exit code to carry it: returning 2 on every host
    # without Dagster wiring would make the exit status report this tool's own
    # configuration instead of Atlas's health, which is the trade already made
    # and argued at automation_block.
    return state


if __name__ == "__main__":
    sys.exit(main(sys.argv))
