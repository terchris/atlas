"""Daily post-ingest validation: every published endpoint answers, and every
URL Atlas serves resolves.

🔵 TERJE ASKED FOR BOTH HALVES (urb-agents #1433): "validate that all datasets
that are ingested has an endpoint AND IT CAN BE QUERIED … count the number of
records each endpoint has". api_v1.atlas_inventory is the counting half. This
is the other one, and ops-dev put the distinction exactly: "'it can be queried'
is a request that leaves the process and comes back with a status code."

🔴 A DATABASE QUERY WOULD NOT ANSWER IT. Every defect this week that reached a
reader lived between a correct table and the thing serving it — a 404 in a
published column, a raw table name in a URL, a spec advertising a placeholder
host. `select count(*)` sees none of those. This dereferences over HTTP against
PostgREST, which is what a consumer does.

⚠️ AND IT RUNS AFTER INGEST, NOT IN CI. Every repo-only gate this week was
green while the served artifact was wrong; CI cannot see the API at all.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

from dagster import AssetCheckResult, AssetCheckSeverity, asset_check

from atlas_data.assets.api_v1 import api_v1_surface
from atlas_data.http_range import answered, explain_empty, read_count

# 🔵 In-cluster service name, the same variable the UIS install sets.
_DEFAULT_BASE = "http://postgrest"
_TIMEOUT = 60

# ⚠️ THE THREE RULES, and they are not mine — a consumer ran this logic first
# and got 16 failures of which THIRTEEN were its own checker (urb-agents #1430):
#
#   templates    a URL containing { } is a pattern, not an address. Its
#                extractor stopped at "{" and probed the bare directory, got a
#                404, and reported a WORKING link as broken.
#   401 / 403    UNDETERMINED, never dead. This project has the counter-example:
#                python urllib gets 403 from the public API where curl gets 200,
#                on a User-Agent string. Same status, three meanings.
#   5xx/timeout  someone else's outage, not our wrong address.
#
# 🔴 Only 404 and 410 fail. Its argument for the rules is the reason this job
# is worth having at all: "a link checker that fires on templates, auth-gated
# URLs and bot-protected hosts gets switched off, and then the real 404 rides
# through with it."
_PLACEHOLDER = re.compile(r"localhost|127\.0\.0\.1|your-|example\.(com|org|net)", re.I)
_URL = re.compile(r"https?://[^\"'\s<>)\]]+")


def _base() -> str:
    return (os.environ.get("ATLAS_POSTGREST_URL") or _DEFAULT_BASE).rstrip("/")


def _get(url: str, headers: dict[str, str] | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8", **(headers or {})})
    return urllib.request.urlopen(req, timeout=_TIMEOUT)


@asset_check(
    asset=api_v1_surface,
    name="every_endpoint_answers",
    blocking=False,
    description=(
        "Every relation the OpenAPI document advertises returns 200 to a real "
        "HTTP request, with its row count. The counting half lives in "
        "api_v1.atlas_inventory; this is the half that leaves the process."
    ),
)
def every_endpoint_answers():
    base = _base()
    try:
        spec = json.load(_get(f"{base}/"))
    except (urllib.error.URLError, ValueError) as err:
        return AssetCheckResult(
            passed=False,
            severity=AssetCheckSeverity.WARN,
            metadata={"error": f"could not fetch the OpenAPI document from {base}: {err}"},
        )

    relations = sorted(p.lstrip("/") for p in spec.get("paths", {}) if p != "/")
    if not relations:
        # 🔴 Refuses rather than passing on an empty set — the failure mode that
        # had check-osmosis reporting success on having checked nothing.
        return AssetCheckResult(
            passed=False,
            severity=AssetCheckSeverity.WARN,
            metadata={"error": "the OpenAPI document advertised zero paths"},
        )

    failed: list[str] = []
    empty: list[str] = []
    uncounted: list[str] = []
    counts: dict[str, int] = {}
    for rel in relations:
        try:
            # 🔵 limit=0: an exact count for empty AND non-empty, no rows on
            # the wire. ⚠️ Read the note in http_range.read_count before
            # changing this — the ORIGINAL reason given for it (a phantom `*/*`
            # from ?limit=1) was a Cloudflare cache artifact and is retracted.
            res = _get(f"{base}/{rel}?limit=0", {"Prefer": "count=exact"})
            status = res.status
            rng = res.headers.get("Content-Range", "")
        except urllib.error.HTTPError as err:
            failed.append(f"{rel}: HTTP {err.code}")
            continue
        except urllib.error.URLError as err:
            failed.append(f"{rel}: {err}")
            continue
        if not answered(status):
            failed.append(f"{rel}: HTTP {status}")
            continue
        count = read_count(rng)
        if count is None:
            # 🔵 Answered, but told us nothing. Reported on its own line rather
            # than counted as 0 — reading "no count" as "no rows" is exactly
            # the bug that hid all three real empties.
            uncounted.append(f"{rel}: Content-Range {rng!r}")
            continue
        counts[rel] = count
        # 🔵 Empty is a STATE, not a fault. Three relations are empty because
        # redcross-branches is on hold, and that is the answer, not a failure.
        if count == 0:
            empty.append(rel)

    # 🔴 AN EMPTY RELATION IS ONLY FINE IF SOMETHING ACCOUNTS FOR IT. Three are
    # empty because redcross-branches has no data to arrive — that is an answer.
    # A relation whose every source HAS delivered rows and which still serves
    # none is the ssb-06913 shape: four relations wired, zero arriving,
    # undetected for weeks. That one has to be loud.
    unexplained: list[str] = []
    explained: list[str] = []
    if empty:
        try:
            inv = {
                r["endpoint"]: r.get("contributing_sources") or []
                for r in json.load(_get(f"{base}/atlas_inventory?select=endpoint,contributing_sources"))
            }
            by_id = {
                r["source_id"]: r
                for r in json.load(
                    _get(f"{base}/meta_sources?select=source_id,total_runs,latest_row_count")
                )
            }
        except (urllib.error.URLError, ValueError, KeyError) as err:
            # 🔵 Degrade to reporting rather than inventing a verdict — but say
            # so, because "no unexplained empties" and "I could not ask" must
            # never read the same.
            explained = [f"could not classify: {err}"]
            inv = by_id = {}
        for rel in empty:
            if not inv:
                continue
            why = explain_empty(inv.get(rel, []), by_id)
            (explained if why else unexplained).append(
                f"{rel} <- {', '.join(why)}" if why else rel
            )

    return AssetCheckResult(
        passed=not failed and not unexplained,
        severity=AssetCheckSeverity.WARN,
        metadata={
            "endpoints_checked": len(relations),
            "failed": ", ".join(failed) if failed else "none",
            "empty_but_published": ", ".join(empty) if empty else "none",
            "empty_and_explained": ", ".join(explained) if explained else "none",
            "empty_and_UNEXPLAINED": ", ".join(unexplained) if unexplained else "none",
            "answered_without_a_count": ", ".join(uncounted) if uncounted else "none",
            "total_rows_served": sum(counts.values()),
            "remedy": (
                "Only a 4xx/5xx or a connection error fails this check: 200 and 206 "
                "are both answers, and an EMPTY relation is listed under "
                "empty_but_published, not here. So a name in `failed` means that "
                "relation did not answer at all — check the api_v1 view exists and "
                "that PostgREST's schema cache was reloaded after the last publish. "
                "\u26a0 Do NOT go looking for a publish problem on the strength of a "
                "name in empty_but_published: the previous remedy text said exactly "
                "that, and it pointed at a cache that was fine. A name in "
                "empty_and_UNEXPLAINED is different and IS a defect: every source "
                "feeding it has delivered rows and it still serves none, which is "
                "how ssb-06913 went unnoticed for weeks."
            ),
        },
    )


@asset_check(
    asset=api_v1_surface,
    name="every_served_url_resolves",
    blocking=False,
    description=(
        "Every URL in every string column of meta_sources dereferences. Only 404 "
        "and 410 fail; templates and placeholders are skipped and 401/403/5xx are "
        "undetermined."
    ),
)
def every_served_url_resolves():
    base = _base()
    try:
        rows = json.load(_get(f"{base}/meta_sources?select=*"))
    except (urllib.error.URLError, ValueError) as err:
        return AssetCheckResult(
            passed=False,
            severity=AssetCheckSeverity.WARN,
            metadata={"error": f"could not read meta_sources from {base}: {err}"},
        )

    urls: dict[str, str] = {}
    occurrences = 0
    for row in rows:
        for col, val in row.items():
            if not isinstance(val, str):
                continue
            for m in _URL.finditer(val):
                u = m.group(0).rstrip(".,;:")
                occurrences += 1
                urls.setdefault(u, f"{row.get('source_id')}.{col}")

    if not urls:
        return AssetCheckResult(
            passed=False,
            severity=AssetCheckSeverity.WARN,
            metadata={"error": f"no URLs found across {len(rows)} meta_sources rows"},
        )

    dead: list[str] = []
    # 🔴 NAMED, NOT COUNTED. This was `undetermined = 0` until 2026-09-24. The
    # first scheduled run reported `undetermined: 1` and NOBODY COULD SAY WHICH
    # URL — not me, and I wrote it. I swept all 64 from outside the cluster and
    # every one answered 2xx/3xx, so the one the cluster saw is either transient
    # or specific to its egress, and a bare count can distinguish neither.
    #
    # ⚠️ A persistent undetermined and a flapping one are different problems: the
    # first is a URL that needs a decision, the second is somebody else's
    # outage. Telling them apart needs the NAME across runs, which is exactly
    # what a counter destroys. Same defect as the old empty_but_published
    # remedy text — a number with nothing a reader can chase.
    undetermined: list[str] = []
    skipped = 0
    for url, where in urls.items():
        if "{" in url or "}" in url or _PLACEHOLDER.search(url):
            skipped += 1
            continue
        try:
            status = _get(url).status
        except urllib.error.HTTPError as err:
            status = err.code
        except urllib.error.URLError as err:
            undetermined.append(f"{where}: {err.reason} — {url}")
            continue
        if status in (404, 410):
            dead.append(f"{where}: HTTP {status} — {url}")
        elif status in (401, 403) or status >= 500:
            undetermined.append(f"{where}: HTTP {status} — {url}")

    return AssetCheckResult(
        passed=not dead,
        severity=AssetCheckSeverity.WARN,
        metadata={
            "sources": len(rows),
            # 🔵 DISTINCT urls, not occurrences. `urls` is keyed by the URL, so a
            # value repeated across rows or columns is dereferenced ONCE. On
            # 2026-09-24 that was 64 distinct out of 123 occurrences across 43
            # sources — so a sweep counting occurrences will report a much larger
            # number for the same data and neither is wrong. Say which you mean.
            "urls_checked": len(urls) - skipped,
            "url_occurrences": occurrences,
            "dead": "\n".join(dead) if dead else "none",
            "undetermined": "\n".join(undetermined) if undetermined else "none",
            "skipped_template_or_placeholder": skipped,
            "remedy": (
                "A dead URL in meta_sources is served to every consumer who reads "
                "the catalogue. Fix the manifest, regenerate the sources seed, and "
                "redeploy — the value comes from the seed, not from the manifest."
            ),
        },
    )
