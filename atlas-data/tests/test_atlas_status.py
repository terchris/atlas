#!/usr/bin/env python3
"""
Tests for atlas-status.py — specifically the paths a healthy cluster cannot reach.

🔴 WHY THIS EXISTS. On 2026-09-13 this tool was revised six times in a day and an
external tester found a defect in every revision. The one defect the author found
alone was the one that could be reproduced without a database — by driving a
function with a fake cursor, which is what this file makes permanent.

⚠️ imac's observation is the reason it is worth a runner rather than a note:

    "this path is unreachable on a healthy host. A tester who only ever runs it
     against a working cluster cannot see it."

`ingest_block` reads `distinct on (source_slug)`, so it shows the newest run per
source. On a working cluster every source's newest run is a success, so **no
failing row ever renders** — the branch that formats a failure is dead code from
the perspective of live testing, and it was wrong for a day without anyone
noticing.

🔵 NO PYTEST, ON PURPOSE. Plain asserts and a `__main__`, so CI runs it with
`python3` and no install step. A test that needs a dependency CI does not have is
a test that does not run, and this repository has produced three of those in two
days — a dbt test absent from the manifest, an asset check absent from
definitions.py, and this very script absent from the image.
"""

from __future__ import annotations

import contextlib
import datetime
import importlib.util
import io
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TOOL = HERE.parent / "atlas-status.py"


def load_tool():
    # 🔴 NEVER LOAD CACHED BYTECODE, AND NEVER WRITE ANY.
    #
    # ⚠️ Found by using this harness to prove itself: breaking the tool, running
    # the tests (correctly red), restoring the tool, and getting the SAME failure
    # — from a stale `__pycache__/atlas-status.cpython-*.pyc` written by the
    # broken run. The source was correct and the test reported a defect that no
    # longer existed.
    #
    # 🔴 A false RED is as corrosive as a false green in a tool whose whole
    # subject is signals that lie: the next person deletes a correct fix chasing
    # a failure that is not there.
    #
    # 🔵 It also stops the by-product that got swept into a commit by `git add
    # -A` on 2026-09-13.
    sys.dont_write_bytecode = True
    importlib.invalidate_caches()
    spec = importlib.util.spec_from_file_location("atlas_status", TOOL)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["atlas_status"] = mod
    spec.loader.exec_module(mod)
    return mod


class FakeCursor:
    """Enough of a DB-API cursor for the blocks under test. No database, no network."""

    def __init__(self, rows):
        self._rows = rows

    def execute(self, *_a, **_k):
        return None

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


def _rows(*specs):
    now = datetime.datetime.now(datetime.timezone.utc)
    return [(slug, code, now, note) for slug, code, note in specs]


def run_block(mod, rows):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.ingest_block(FakeCursor(rows))
    return state, buf.getvalue()


def test_healthy_returns_the_int_not_the_label(mod):
    """
    🔴 The regression that made a healthy host exit 2.

    `state` held both the return value and the display label, so every healthy row
    left it as the string "ok" and `worst()` did `max(("ok", 0))`. It failed ONLY
    when everything was fine.
    """
    state, _ = run_block(mod, _rows(*[(f"src-{i}", 0, None) for i in range(25)]))
    assert state == mod.OK, f"expected OK, got {state!r}"
    assert isinstance(state, int), f"expected int, got {type(state).__name__}"
    # the exact call that raised TypeError in the field
    assert mod.worst(mod.OK, state) == mod.OK


def test_failure_renders_as_a_label_not_an_integer(mod):
    """
    🔴 The half the crash was hiding. After the label was overwritten with the int
    WARN and printed, a failure rendered as `1` rather than `FAILED (1)`.
    """
    state, out = run_block(mod, _rows(("src-fail", 1, "boom"), ("src-ok", 0, None)))
    assert state == mod.WARN, f"expected WARN, got {state!r}"
    assert "FAILED (1)" in out, f"failure did not render as a label:\n{out}"
    # ⚠️ Ordering matters: a failure followed by a success is what the old code
    # got wrong in both directions at once — wrong return AND wrong rendering.
    assert out.index("src-fail") < out.index("src-ok")


def test_failure_last_also_returns_warn(mod):
    """The ordering that accidentally worked before, so a fix cannot regress it."""
    state, _ = run_block(mod, _rows(("src-ok", 0, None), ("src-fail", 2, "boom")))
    assert state == mod.WARN, f"expected WARN, got {state!r}"


def test_no_runs_is_a_warning_not_silence(mod):
    state, out = run_block(mod, [])
    assert state == mod.WARN
    assert "no ingest runs" in out


def test_host_facing_url_is_named_only_inside_a_pod(mod):
    """
    🔴 The hint must not fire on a developer machine, where `.localhost` is
    exactly right. One name, two correct answers — and the hint is only correct
    for one of the two audiences.
    """
    import os

    had = os.environ.get("KUBERNETES_SERVICE_HOST")
    try:
        os.environ["KUBERNETES_SERVICE_HOST"] = "10.0.0.1"
        assert "HOST-facing" in mod._address_hint("http://api-atlas.localhost")
        assert mod._address_hint("http://atlas-postgrest.postgrest.svc.cluster.local") == ""
        os.environ.pop("KUBERNETES_SERVICE_HOST")
        # ⚠️ Outside a pod the same URL is correct and must stay silent.
        assert mod._address_hint("http://api-atlas.localhost") == ""
    finally:
        if had is None:
            os.environ.pop("KUBERNETES_SERVICE_HOST", None)
        else:
            os.environ["KUBERNETES_SERVICE_HOST"] = had


class _DeletionCursor:
    """
    Cursor that answers deletion_block's three queries in order — and INSPECTS
    them.

    🔴 The first version of this only answered positionally, so the tests passed
    with the fix reverted: removing `and oppdateringsid <= %s` changes what the
    DATABASE returns, and a stub that never reads the SQL cannot notice. A test
    that passes without the fix is not a guard, it is decoration.

    ⚠️ So it asserts the shape of the query it is standing in for: the
    applied-deletion lookup must constrain by the watermark, and the pending
    count must look the other way. That is the part a fake cursor CAN check.
    """

    def __init__(self, applied, applied_deletion, pending):
        self._answers = [(applied,), applied_deletion, (pending,)]
        self._sql = []
        self._i = -1

    def execute(self, sql, *_a, **_k):
        self._i += 1
        self._sql.append(" ".join(str(sql).split()))
        if self._i == 1:
            assert "oppdateringsid <= %s" in self._sql[-1], (
                "the applied-deletion query must constrain by the dimension's "
                f"watermark, got: {self._sql[-1]}"
            )
        if self._i == 2:
            assert "oppdateringsid > %s" in self._sql[-1], (
                f"the pending count must look past the watermark, got: {self._sql[-1]}"
            )

    def fetchone(self):
        return self._answers[self._i]

    def fetchall(self):
        return []


def test_a_deletion_the_transform_has_not_applied_is_not_a_fault(mod):
    """
    🔴 The feed polls at :00/:30 and reconciliation runs at :10/:40, so for ~11
    minutes in 30 there is a deletion the API correctly still serves. Reporting
    that as UNHEALTHY made a healthy atlas fail ~37% of the time and rendered
    identically to an 8.4-hour outage.

    ⚠️ No HTTP happens on this path — the block returns before asking the API,
    which is what makes the case testable without a network.
    """
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=3),
                      running={mod.TRANSFORM_SCHEDULE})
    assert state == mod.OK, f"a pending deletion must not warn, got {state!r}"
    assert "awaiting the next transform" in out, out
    assert "⚠️" not in out.replace("awaiting", ""), out


def test_no_deletions_at_all_is_silent_but_stated(mod):
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=0),
                      running=set())
    assert state == mod.OK, "no deletions at all is not a fault even with nothing running"
    assert "no deletion in the feed yet" in out


def _run(mod, cur, running=None):
    """
    🔴 `running` HAS NO USEFUL DEFAULT AND THE TESTS ALL PASS IT.

    Defaulting it to "the transform is running" would make every existing test
    exercise the reassuring branch and none the others — the shape that let the
    promise ship unchecked in the first place. None is the honest default
    (nothing was asked) and each test states the world it is testing.
    """
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.deletion_block(cur, running)
    return state, buf.getvalue()


def test_worst_orders_and_rejects_non_states(mod):
    assert mod.worst(mod.OK, mod.WARN) == mod.WARN
    assert mod.worst(mod.WARN, mod.CANNOT) == mod.CANNOT, "CANNOT must dominate WARN"
    assert mod.worst(mod.OK, mod.OK) == mod.OK
    try:
        mod.worst(mod.OK, "ok")
    except TypeError as exc:
        assert "not a status state" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("worst() accepted a display string")


# ─────────────────────────────────────────────────────────────────────────────
# urb-agents #1035 — the tool said a transform was coming without looking.
#
# 🔴 EVERY ONE OF THESE IS UNREACHABLE ON A HEALTHY CLUSTER, which is the same
# reason this file exists at all. imac's observation applies exactly: a tester
# who only ever runs the command against a running Atlas sees the reassuring
# branch every time, and the reassuring branch was the broken one.
# ─────────────────────────────────────────────────────────────────────────────


def test_a_stopped_transform_is_never_called_awaiting(mod):
    """
    🔴 THE DEFECT ITSELF. Deletions pulled, nothing scheduled to apply them, and
    the tool printed "awaiting the next transform (:10/:40) — not a fault" over
    exit 0. There is no next transform; the word is a promise and the promise was
    unbacked.
    """
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=3),
                      running=set())
    assert state == mod.WARN, f"nothing scheduled to apply 3 deletions must warn, got {state!r}"
    assert "awaiting" not in out, f"a stopped transform is not something to await: {out}"
    assert mod.TRANSFORM_SCHEDULE in out, f"the stopped instigator must be named: {out}"
    assert "⚠️" in out, out


def test_a_stopped_transform_warns_even_when_the_api_assertion_passes(mod):
    """
    ⚠️ The applied deletion IS correctly absent from the API — the assertion this
    block leads with passes. That must not swallow the finding that newer
    deletions have nowhere to go. Two true facts, and the weaker one used to win
    by being the one with a return statement.
    """
    cur = _DeletionCursor(applied=100, applied_deletion=("987654321", 90), pending=4)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.deletion_block(cur, running=set())
    out = buf.getvalue()
    # No PostgREST URL in the environment, so the block stops at CANNOT before
    # the HTTP call — the point here is the pending line above it.
    assert "nothing will apply them" in out, out
    assert state in (mod.WARN, mod.CANNOT), state


def test_unknown_automation_promises_nothing_in_either_direction(mod):
    """
    🔵 The third answer. Without DAGSTER_DATABASE_URL the tool cannot say a
    transform is coming — and equally cannot say one is not. Saying either would
    be the same class of defect with the sign flipped.
    """
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=3),
                      running=None)
    assert state == mod.OK, f"not knowing is not a fault, got {state!r}"
    assert "awaiting the next transform" not in out, out
    assert "nothing will apply" not in out, out
    assert "unknown" in out, f"the tool must say it does not know: {out}"


def test_the_three_answers_are_three(mod):
    assert mod.transform_is({mod.TRANSFORM_SCHEDULE}) == "running"
    assert mod.transform_is({"something_else"}) == "stopped"
    assert mod.transform_is(set()) == "stopped"
    assert mod.transform_is(None) == "unknown", "None must not collapse into stopped"


def test_pending_with_a_stopped_transform_is_a_symptom_without_waiting(mod):
    """
    The register block's own arm. Age says "a cycle has had time to run" and
    assumes there is a cycle; with the schedule stopped, pending work is stuck
    from the first minute and no threshold applies.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    def run(running):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            # reconciled just now on purpose: this test is about the STOPPED
            # arm, so the age arm must not also fire and mask which one warned.
            state = mod.register_block(
                _RegisterCursor(now, pending=[("Endring", 5)], feed_ago_hours=0.1,
                                reconciled_ago_hours=0.0),
                running,
            )
        return state, buf.getvalue()

    state, out = run(set())
    assert state == mod.WARN, f"5 pending and nothing scheduled must warn, got {state!r}"
    assert "nothing is scheduled to apply these" in out, out

    state, out = run({mod.TRANSFORM_SCHEDULE})
    assert state == mod.OK, f"5 pending mid-cycle is normal, got {state!r}: {out}"
    assert "nothing is scheduled" not in out, out


def test_automation_block_reports_but_does_not_warn(mod):
    """
    🔴 A DELIBERATELY STOPPED INSTALL IS NOT A FAULT, and this is the decision
    recorded as a test so it is argued with rather than drifted out of. The
    install guide leaves an operator here between loading first data and going
    live; exiting 1 on the documented path would teach them that 1 means nothing.
    """
    for running in (set(), {mod.TRANSFORM_SCHEDULE}, None):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            state = mod.automation_block(running)
        assert state == mod.OK, f"automation_block must only report, got {state!r} for {running!r}"


def test_a_stopped_install_says_so_loudly(mod):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        mod.automation_block(set())
    out = buf.getvalue()
    assert "STOPPED" in out and "will not change" in out, out
    # 🔴 THIS ASSERTION USED TO BE ITS OWN INVERSE, AND IT WAS WRONG.
    #
    # It required that `--start` NOT be printed, on the strength of a sentence in
    # installing-on-uis.md saying `uis dagster automation` "reports and asserts
    # state but cannot set it". imac then used `--start` / `--stop` on UIS
    # 1.6.106 and they set it correctly (ops-dev, urb-agents #1149), so the tool
    # had been sending operators to raw startSchedule / startSensor GraphQL for a
    # capability their CLI already had — and this test was holding it there.
    #
    # ⚠️ A test can only defend a belief, never verify one about another team's
    # CLI. This one made a doc sentence unfalsifiable from inside this repo.
    # Verified on 1.6.106; the doc is corrected in the same change.
    assert "--start" in out, f"the CLI can set it; say so: {out}"
    assert "startSchedule" not in out, f"do not send operators to raw GraphQL: {out}"


def test_an_unreadable_body_makes_the_answer_unknown_not_empty(mod):
    """
    🔴 None IS NOT AN EMPTY SET. A row says something is RUNNING and its body
    does not parse: the honest answer is "I cannot tell what is running", never
    "nothing relevant is running" — which would be a false alarm assembled out of
    a parse failure.
    """
    rows = [("RUNNING", "{not json"), ("STOPPED", '{"origin": {"job_name": "x"}}')]
    assert _drive_instigators(mod, rows) is None, "an unparseable RUNNING row must yield None"

    rows = [("STOPPED", "{not json")]
    assert _drive_instigators(mod, rows) == set(), (
        "a STOPPED row's body is never parsed, so it cannot make the answer unknown"
    )


def test_both_spellings_of_the_name_are_read(mod):
    """Dagster serialises the origin as `job_name` on 1.13.4, from before
    instigators stopped being called jobs. A rename must not silently mean
    'nothing is running'."""
    assert mod._instigator_name('{"origin": {"job_name": "a"}}') == "a"
    assert mod._instigator_name('{"origin": {"instigator_name": "b"}}') == "b"
    assert mod._instigator_name('{"origin": {}}') is None
    assert mod._instigator_name("") is None


def test_a_declared_in_code_row_counts_as_running(mod):
    """`default_status=RUNNING` is persisted as DECLARED_IN_CODE (and as
    AUTOMATICALLY_RUNNING in rows written before Dagster renamed it). Reading
    only 'RUNNING' would report a running schedule as stopped."""
    for status in ("RUNNING", "DECLARED_IN_CODE", "AUTOMATICALLY_RUNNING"):
        rows = [(status, '{"origin": {"job_name": "brreg_transform_half_hourly"}}')]
        assert _drive_instigators(mod, rows) == {"brreg_transform_half_hourly"}, status


def test_no_connection_string_is_unknown_not_stopped(mod):
    import os

    saved = os.environ.pop("DAGSTER_DATABASE_URL", None)
    try:
        assert mod.running_instigators() is None
    finally:
        if saved is not None:
            os.environ["DAGSTER_DATABASE_URL"] = saved


def _drive_instigators(mod, rows):
    """Run running_instigators() against a fake `instigators` table."""
    import os

    class _Cur:
        def execute(self, sql, *_a, **_k):
            assert "instigators" in sql, sql
            assert "status" in sql, sql

        def fetchall(self):
            return rows

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    class _Conn:
        def cursor(self):
            return _Cur()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    saved_conn = mod._conn
    saved_url = os.environ.get("DAGSTER_DATABASE_URL")
    os.environ["DAGSTER_DATABASE_URL"] = "postgresql://fake/fake"
    mod._conn = lambda url: _Conn()
    try:
        return mod.running_instigators()
    finally:
        mod._conn = saved_conn
        if saved_url is None:
            os.environ.pop("DAGSTER_DATABASE_URL", None)
        else:
            os.environ["DAGSTER_DATABASE_URL"] = saved_url


def test_nothing_declares_itself_running(mod):
    """
    🔴 AN ABSENCE-GUARD FOR THE ASSUMPTION UNDER `running_instigators`: no row in
    `instigators` means STOPPED only because nothing in this code location
    declares `default_status=RUNNING`. If that changes, absence stops meaning
    stoppedness — and the tool's answer would be wrong only in the window before
    the daemon's first tick writes the row, which is exactly the kind of defect
    nobody finds.

    ⚠️ Swept over the whole package, not over the two modules that declare
    schedules today. Matching the spelling I remember instead of the pattern is
    how a fix landed in three places out of four once already.
    """
    pkg = HERE.parent / "dagster" / "atlas_data"
    assert pkg.is_dir(), f"cannot find the definitions package at {pkg}"
    offenders = [f.name for f in sorted(pkg.rglob("*.py")) if "default_status" in f.read_text()]
    assert not offenders, (
        f"{offenders} set default_status; running_instigators() assumes no instigator "
        "declares itself RUNNING, so absence of a row means stopped. Either revert, "
        "or make that function read the declarations too."
    )


def test_the_named_schedule_is_the_one_that_exists(mod):
    """
    The tool asserts about a schedule BY NAME across a process boundary, so the
    name is a contract with schedules.py. Renamed there and not here, the tool
    reports a running transform as stopped — a false alarm on every healthy host.
    """
    src = (HERE.parent / "dagster" / "atlas_data" / "schedules.py").read_text()
    assert f'name="{mod.TRANSFORM_SCHEDULE}"' in src, (
        f"atlas-status.py watches {mod.TRANSFORM_SCHEDULE!r}, which schedules.py "
        "no longer declares under that name"
    )


# ─────────────────────────────────────────────────────────────────────────────
# urb-agents #1039 — the freshness verdict never reached the operator.
# ─────────────────────────────────────────────────────────────────────────────


class _FreshnessCursor:
    """
    Stands in for `marts.mart_source_freshness`, and INSPECTS how it is asked.

    🔴 THE EXISTENCE PROBE MUST BE `to_regclass`, NOT A QUERY IN A TRY. In
    psycopg2 a failed query aborts the whole transaction, so a bare
    `select ... from marts.mart_source_freshness` against a host where the
    transform has never run would take out every later block on the same
    connection — and they would report faults belonging to this one. Verified
    against a real Postgres: after the bare query, the very next `select 1`
    raises InFailedSqlTransaction.
    """

    def __init__(self, exists=True, counts=None, rows=None, built_before=False):
        self._exists = exists
        # ⚠️ Whether marts has EVER been built, probed via marts.dim_brreg_enhet.
        # The block asks two to_regclass questions and they have different
        # answers: a missing view on a host that has built marts before is an
        # upgrade waiting on a transform, not a host that has never run one.
        # A fixture that answered both alike could not express the difference
        # the block now turns on.
        self._built_before = built_before
        self._counts = counts or {}
        self._rows = rows or []
        self._sql = []
        self._mode = None
        self._probed = None

    def execute(self, sql, *_a, **_k):
        flat = " ".join(str(sql).split())
        self._sql.append(flat)
        if "to_regclass" in flat:
            self._mode = "exists"
            self._probed = "view" if "mart_source_freshness" in flat else "marts"
        elif "group by" in flat:
            self._mode = "counts"
        else:
            assert "freshness_status not in" in flat, f"unexpected query: {flat}"
            self._mode = "rows"

    def fetchone(self):
        assert self._mode == "exists", "fetchone is only for the existence probe"
        if self._probed == "marts":
            return ("marts.dim_brreg_enhet",) if self._built_before else (None,)
        return ("marts.mart_source_freshness",) if self._exists else (None,)

    def fetchall(self):
        return list(self._counts.items()) if self._mode == "counts" else self._rows


def _freshness(mod, cur):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.freshness_block(cur)
    return state, buf.getvalue()


def test_the_view_is_probed_not_queried_blind(mod):
    cur = _FreshnessCursor(exists=True, counts={"ok": 29, "not_bounded": 5})
    _freshness(mod, cur)
    assert any("to_regclass" in s for s in cur._sql), (
        "the block must probe with to_regclass; a bare query on a missing view "
        f"aborts the transaction for every later block. Queries ran: {cur._sql}"
    )


def test_a_missing_view_on_a_virgin_host_cannot_answer_and_does_not_pass(mod):
    """
    🔴 ABSENCE MUST NOT RENDER AS GREEN. Nothing has been built here, so there is
    nothing to compare. Returning OK would be the exact defect this tool exists
    to catch, one level up.

    ⚠️ Note what this test now REQUIRES in order to mean that: marts must be
    absent too. The view alone being missing no longer implies a virgin host —
    see the upgrade test below, which is the case this one used to swallow.
    """
    cur = _FreshnessCursor(exists=False, built_before=False)
    state, out = _freshness(mod, cur)
    assert state == mod.CANNOT, f"a missing surface is 'cannot look', got {state!r}"
    assert "no transform has ever run here" in out, out
    assert "within cadence" not in out, f"it must not report a verdict it does not have: {out}"


def test_a_missing_view_on_an_upgraded_host_warns_rather_than_blanking_the_report(mod):
    """
    🔴 THE OLD CODE CALLED THIS "no transform has ever run here" AND IT WAS FALSE.

    The view is new in this build, so on an upgrade it is missing while the
    transform has been running for days. imac measured what that cost: b7e513f
    exit 0, install e439668 exit 2 "NOTHING WAS CHECKED", one transform later
    exit 0 again (ops-dev, urb-agents #1149).

    ⚠️ CANNOT dominates every other block, so one pending model reported a
    complete and healthy picture as no picture at all — at the exact moment an
    upgrader is asking "did my upgrade work". WARN is the honest answer: the
    tool looked, and something needs doing.
    """
    cur = _FreshnessCursor(exists=False, built_before=True)
    state, out = _freshness(mod, cur)
    assert state == mod.WARN, f"an upgrade pending a transform is WARN, got {state!r}"
    assert "pending" in out, out
    assert "no transform has ever run here" not in out, f"false on an upgrade: {out}"
    assert "within cadence" not in out, f"it must not report a verdict it does not have: {out}"


def test_a_fresh_project_names_both_denominators(mod):
    """
    ⚠️ "41 of 43 sources" was proposed for this line and both numbers are wrong:
    43 counts ingest SLUGS in raw.ingest_runs, this surface counts raw TABLES
    declaring a loaded_at_field. Measured against the real declarations it is 29
    bounded and 5 silenced — and the block must read them from the view rather
    than carry either number as a literal.
    """
    cur = _FreshnessCursor(exists=True, counts={"ok": 29, "not_bounded": 5})
    state, out = _freshness(mod, cur)
    assert state == mod.OK, state
    assert "29 bounded sources, 29 within cadence" in out, out
    assert "5 silenced" in out, out
    assert "⚠️" not in out, out


def test_silenced_sources_are_counted_not_hidden(mod):
    """
    A row that vanishes from a freshness surface is indistinguishable from a
    source nobody ever added, so the silenced ones are reported as a count.
    """
    _, out = _freshness(mod, _FreshnessCursor(exists=True, counts={"ok": 3, "not_bounded": 5}))
    assert "3 bounded sources" in out and "5 silenced" in out, out


def test_an_overdue_source_warns_and_is_named(mod):
    cur = _FreshnessCursor(
        exists=True,
        counts={"ok": 27, "overdue": 1, "never_loaded": 1, "not_bounded": 5},
        rows=[("ssb_08484", "weekly", 9.0, 8, "overdue"),
              ("ssb_08487", "weekly", None, 8, "never_loaded")],
    )
    state, out = _freshness(mod, cur)
    assert state == mod.WARN, f"an overdue source must warn, got {state!r}"
    assert "29 bounded sources, 27 within cadence, 2 NOT" in out, out
    assert "ssb_08484" in out and "9.0 d" in out, out
    assert "never loaded" in out, "an empty table is not a blank age, it is a finding: " + out


def test_never_loaded_is_not_silently_formatted_as_zero(mod):
    """
    ⚠️ `age_days` is NULL for a table with no rows. Formatting that as 0.0 would
    print the freshest possible value for the emptiest possible table.
    """
    cur = _FreshnessCursor(
        exists=True,
        counts={"ok": 0, "never_loaded": 1},
        rows=[("ssb_08487", "weekly", None, 8, "never_loaded")],
    )
    _, out = _freshness(mod, cur)
    assert "0.0 d" not in out, out
    assert "never loaded" in out, out


def test_runs_that_never_started_cannot_reach_the_jobs_block(mod):
    """
    🔴 A FAILED LAUNCH MUST NOT RENDER AS A FAILING JOB (ops-dev, urb-agents #1076).

    `uis dagster run transform_checks` currently fails before submitting, leaving
    a NOT_STARTED run that Dagster's monitoring daemon later reaps to FAILURE.
    Three of them exist on imac's host. They executed nothing.

    ⚠️ `jobs_block` is protected from them only by `where start_time is not null`
    — a clause written so `to_timestamp()` had something to format, not because
    anyone reasoned about orphaned runs. Measured against a real runs table:
    swapping it for `coalesce(start_time, end_time)` to show a timestamp on every
    row turns three never-executed runs into "transform_checks 3 consecutive ⚠️".

    🔵 So the guard is on the SQL, not on the output: a fake cursor answers
    whatever it is given regardless of the WHERE clause, and a test that does not
    read the query cannot notice the clause going missing. Same lesson as
    _DeletionCursor.
    """
    import os

    seen = []

    class _Cur:
        def execute(self, sql, *_a, **_k):
            seen.append(" ".join(str(sql).split()))

        def fetchall(self):
            return []

        def fetchone(self):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    class _Conn:
        def cursor(self):
            return _Cur()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    saved_conn, saved_url = mod._conn, os.environ.get("DAGSTER_DATABASE_URL")
    os.environ["DAGSTER_DATABASE_URL"] = "postgresql://fake/fake"
    mod._conn = lambda url: _Conn()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            mod.jobs_block()
    finally:
        mod._conn = saved_conn
        if saved_url is None:
            os.environ.pop("DAGSTER_DATABASE_URL", None)
        else:
            os.environ["DAGSTER_DATABASE_URL"] = saved_url

    runs_query = next((s for s in seen if " from runs " in f" {s} "), None)
    assert runs_query, f"no query against `runs` was issued; saw: {seen}"
    assert "start_time is not null" in runs_query, (
        "the runs query must exclude rows with no start_time, or launches that "
        "never submitted a run render as consecutive job failures. Got: "
        f"{runs_query}"
    )


class _RegisterCursor:
    """
    Answers register_block's queries BY READING THEM, not by counting them.

    🔴 The previous version answered positionally, and adding one query to the
    block shifted every answer by one. A stub that does not read the SQL is also
    the stub that cannot notice a clause going missing — the _DeletionCursor
    lesson, applied before it bit rather than after.
    """

    def __init__(self, now, pending=None, feed_ago_hours=0.1, reconciled_ago_hours=2.2):
        self._now = now
        self._pending = pending or []
        self._feed_ago = feed_ago_hours
        self._reconciled = now - datetime.timedelta(hours=reconciled_ago_hours)
        self._mode = None

    def execute(self, sql, *_a, **_k):
        flat = " ".join(str(sql).split())
        if "brreg_feed_watermark" in flat:
            self._mode = "watermark"
        elif "dim_brreg_enhet" in flat:
            self._mode = "dimension"
        elif "ingest_runs" in flat:
            assert "exit_code = 0" in flat, (
                "the feed probe must require a SUCCESSFUL poll; a failed or "
                f"in-flight run is not evidence the feed is alive. Got: {flat}"
            )
            self._mode = "feed"
        elif "brreg_enheter_versions" in flat:
            self._mode = "pending"
        else:  # pragma: no cover
            raise AssertionError(f"unexpected query: {flat}")

    def fetchone(self):
        if self._mode == "watermark":
            return (200, self._now)
        if self._mode == "dimension":
            return (100, self._reconciled)
        if self._mode == "feed":
            if self._feed_ago is None:
                return (None,)
            return (self._now - datetime.timedelta(hours=self._feed_ago),)
        raise AssertionError(f"fetchone in mode {self._mode}")  # pragma: no cover

    def fetchall(self):
        return self._pending


def _register(mod, **kw):
    now = datetime.datetime.now(datetime.timezone.utc)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.register_block(_RegisterCursor(now, **kw), {mod.TRANSFORM_SCHEDULE})
    return state, buf.getvalue()


def test_a_quiet_register_is_idle_not_stale(mod):
    """
    🔴 #1081, AND IT FIRED EVERY NIGHT. Measured at 20:24Z on a clean install:
    every change Brreg published was applied within nine minutes, pending 0, all
    five instigators running — and `last reconciled 2.2 h ago ⚠️` took the command
    to exit 1. Brreg had published nothing since 18:01, which overnight on a
    public register is normal.

    ⚠️ A check that cries wolf every night teaches its reader to ignore it, and
    the 7.5-hour incident needed a human to ask.
    """
    state, out = _register(mod, pending=[], feed_ago_hours=0.07, reconciled_ago_hours=2.2)
    assert state == mod.OK, f"a current register with nothing to do must not warn, got {state!r}"
    assert "⚠️" not in out, out
    assert "idle, not stale" in out, out


def test_a_dead_feed_still_warns_though_nothing_is_pending(mod):
    """
    🔴 THE CONTROL THAT MATTERS. `pending == 0` is also what a DEAD feed looks
    like: nothing is recorded, so nothing is outstanding. The exemption is
    therefore granted only on positive evidence that the feed is alive.
    """
    state, out = _register(mod, pending=[], feed_ago_hours=5.0, reconciled_ago_hours=2.2)
    assert state == mod.WARN, f"a stale register behind a silent feed must warn, got {state!r}"
    assert "⚠️" in out, out
    assert mod.FEED_SOURCE in out, f"the output must name what is silent: {out}"
    assert "idle" not in out, out


def test_a_feed_that_never_polled_is_not_idle(mod):
    """Absence of evidence is not evidence of health — the tool's whole subject."""
    state, out = _register(mod, pending=[], feed_ago_hours=None, reconciled_ago_hours=2.2)
    assert state == mod.WARN, f"no successful poll on record must warn, got {state!r}"
    assert "no successful poll on record" in out, out


def test_a_fresh_reconcile_never_reaches_the_idle_wording(mod):
    """Under the threshold there is nothing to explain, so nothing is explained."""
    state, out = _register(mod, pending=[], feed_ago_hours=0.1, reconciled_ago_hours=0.3)
    assert state == mod.OK, state
    assert "idle, not stale" not in out, out
    assert "⚠️" not in out, out


def test_pending_work_still_warns_even_with_a_live_feed(mod):
    """
    The exemption is for an idle register, not a backed-up one. Work outstanding
    past the stale window is a symptom however healthy the feed looks.
    """
    state, out = _register(mod, pending=[("Endring", 5)], feed_ago_hours=0.1,
                           reconciled_ago_hours=2.2)
    assert state == mod.WARN, f"5 pending for 2.2 h must warn, got {state!r}"
    assert "idle, not stale" not in out, out


def main() -> int:
    mod = load_tool()
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t(mod)
            print(f"  ✓ {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"  ✗ {t.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            # ⚠️ A test that raises something other than AssertionError used to
            # crash the whole run, so the remaining tests never reported. The
            # exception CLASS is named because a NameError in the tool and an
            # AssertionError about its behaviour need different fixes — the same
            # reason the tool itself prints the class in its "cannot answer" line.
            failed += 1
            print(f"  ✗ {t.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
