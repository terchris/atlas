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
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=3))
    assert state == mod.OK, f"a pending deletion must not warn, got {state!r}"
    assert "awaiting the next transform" in out, out
    assert "⚠️" not in out.replace("awaiting", ""), out


def test_no_deletions_at_all_is_silent_but_stated(mod):
    state, out = _run(mod, _DeletionCursor(applied=100, applied_deletion=None, pending=0))
    assert state == mod.OK
    assert "no deletion in the feed yet" in out


def _run(mod, cur):
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        state = mod.deletion_block(cur)
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
