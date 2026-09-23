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
    counts: dict[str, int] = {}
    for rel in relations:
        try:
            res = _get(f"{base}/{rel}?limit=1", {"Prefer": "count=exact"})
            status = res.status
            rng = res.headers.get("Content-Range", "")
        except urllib.error.HTTPError as err:
            failed.append(f"{rel}: HTTP {err.code}")
            continue
        except urllib.error.URLError as err:
            failed.append(f"{rel}: {err}")
            continue
        if status != 200:
            failed.append(f"{rel}: HTTP {status}")
            continue
        total = rng.rsplit("/", 1)[-1] if "/" in rng else ""
        counts[rel] = int(total) if total.isdigit() else -1
        # 🔵 Empty is a STATE, not a fault. activity_catalog, distrikt_summary
        # and kommune_local_chapters are all correctly empty while
        # redcross-branches is on hold. Reported so it is visible, never failed.
        if counts[rel] == 0:
            empty.append(rel)

    return AssetCheckResult(
        passed=not failed,
        severity=AssetCheckSeverity.WARN,
        metadata={
            "endpoints_checked": len(relations),
            "failed": ", ".join(failed) if failed else "none",
            "empty_but_published": ", ".join(empty) if empty else "none",
            "total_rows_served": sum(c for c in counts.values() if c > 0),
            "remedy": (
                "A published relation that does not answer is invisible from the "
                "repo: every CI gate stays green. Check the api_v1 views exist and "
                "that PostgREST's schema cache was reloaded after the last publish."
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
    for row in rows:
        for col, val in row.items():
            if not isinstance(val, str):
                continue
            for m in _URL.finditer(val):
                u = m.group(0).rstrip(".,;:")
                urls.setdefault(u, f"{row.get('source_id')}.{col}")

    if not urls:
        return AssetCheckResult(
            passed=False,
            severity=AssetCheckSeverity.WARN,
            metadata={"error": f"no URLs found across {len(rows)} meta_sources rows"},
        )

    dead: list[str] = []
    undetermined = skipped = 0
    for url, where in urls.items():
        if "{" in url or "}" in url or _PLACEHOLDER.search(url):
            skipped += 1
            continue
        try:
            status = _get(url).status
        except urllib.error.HTTPError as err:
            status = err.code
        except urllib.error.URLError:
            undetermined += 1
            continue
        if status in (404, 410):
            dead.append(f"{where}: HTTP {status} — {url}")
        elif status in (401, 403) or status >= 500:
            undetermined += 1

    return AssetCheckResult(
        passed=not dead,
        severity=AssetCheckSeverity.WARN,
        metadata={
            "sources": len(rows),
            "urls_checked": len(urls) - skipped,
            "dead": "\n".join(dead) if dead else "none",
            "undetermined": undetermined,
            "skipped_template_or_placeholder": skipped,
            "remedy": (
                "A dead URL in meta_sources is served to every consumer who reads "
                "the catalogue. Fix the manifest, regenerate the sources seed, and "
                "redeploy — the value comes from the seed, not from the manifest."
            ),
        },
    )
