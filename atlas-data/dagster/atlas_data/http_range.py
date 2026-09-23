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


# 🔴 WHY EMPTY-VERSUS-BROKEN IS DECIDED HERE AND NOT BY `origin`.
#
# atlas_inventory.origin is a PROVENANCE label and cannot carry this, in either
# direction. Measured against the live inventory 2026-09-23 (urb-agents #1441):
#
#   max over contributing sources (what origin does today)
#       -> distrikt_summary reads `ingest`, last_status ok, 0 rows, because it
#          also draws on ssb-klass-kommuner, which sits on the right of a LEFT
#          JOIN and can never add a row. Looks healthy, is empty.
#
#   min over contributing sources (the obvious fix, simulated before writing)
#       -> brreg_enhet          1,175,359 rows  ingest -> declared_no_ingest
#          kommune_ngo_summary      5,446 rows  ingest -> declared_no_ingest
#          kommune_ngo_totals         357 rows  ingest -> declared_no_ingest
#          unattributed_totals          3 rows  ingest -> declared_no_ingest
#
# Join position decides it and join position is not in the lineage data. So the
# question is asked NARROWLY, only of relations that are actually empty, where
# it cannot misfire on a populated one.
#
# ⚠️ "Has rows" is not the test — `brreg-oppdateringer` is a delta feed with 445
# runs and latest_row_count 0, which is a normal quiet run and must NOT be
# allowed to excuse a silence. The test is whether the source has EVER
# delivered.


def has_never_delivered(source: dict) -> bool:
    """True when a source has never successfully produced rows.

    ⚠️ Deliberately NOT "latest_row_count == 0": a delta feed reports zero on a
    quiet run and is working perfectly. Only a source with no runs at all, or
    with no row count ever recorded, can explain a downstream relation's
    emptiness.
    """
    return not (source.get("total_runs") or 0) or source.get("latest_row_count") is None


def explain_empty(sources: list[str], by_id: dict[str, dict]) -> list[str]:
    """Which contributing sources account for a relation serving zero rows.

    Empty list means NOTHING accounts for it — every contributing source has
    delivered rows and the relation is still empty. That is the silent-source
    shape (ssb-06913: four relations wired, zero arriving, undetected for
    weeks) and it is what this exists to make loud.
    """
    return [s for s in sources if s not in by_id or has_never_delivered(by_id[s])]
