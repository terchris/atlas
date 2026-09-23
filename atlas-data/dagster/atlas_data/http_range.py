"""Reading PostgREST's answer to "does this relation answer, and with how many rows".

🔴 THIS IS A SEPARATE MODULE SO IT CAN BE TESTED WITHOUT DAGSTER. It lived
inline in assets/validation.py, where importing it pulls in `dagster`, which
the CI runner's plain python3 does not have — so it could not be tested there,
and it was not. The first run after deploy then failed 17 of 20 relations and
found 0 of the 3 real empties (urb-agents #1433).

🔵 Nothing here imports anything. Keep it that way.
"""
from __future__ import annotations

# 🔴 PostgREST answers a PARTIAL collection with 206 and a complete one with
# 200. Treating 206 as "does not answer" failed every NON-EMPTY relation.
_ANSWERED = (200, 206)


def answered(status: int) -> bool:
    """Did the relation answer at all? 200 and 206 are both answers."""
    return status in _ANSWERED


def read_count(content_range: str) -> int | None:
    """Rows the relation reports, or None when it reports no count.

    ⚠️ `*/0` and `*/*` are DIFFERENT and the difference is the whole point.
    `*/0` is a real zero — the relation is empty. `*/*` means PostgREST
    computed no count, which is what `?limit=1` returns on an empty relation.
    Reading the second as zero is how the check reported "nothing is empty"
    while three relations were.

        ?limit=1   empty -> */*            non-empty -> 0-0/1170
        Range 0-0  empty -> */0            non-empty -> 0-1169/1170 (whole body)
        ?limit=0   empty -> */0            non-empty -> */1170       <- use this
    """
    total = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
    return int(total) if total.isdigit() else None
