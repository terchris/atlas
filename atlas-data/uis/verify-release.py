#!/usr/bin/env python3
"""
Post-deploy verification for Atlas: one uniform check per dataset, plus a few
whole-release invariants. Runnable by someone who is not a data specialist.

    verify-release.py https://api-atlas.example.no
    verify-release.py https://api-atlas.example.no --only fhi-neet

🔴 WHY THIS EXISTS. Terje, 2026-09-21:

  "imac is no specialist on your data. you are the specialist and must be the
   one that write the test that imac must do in order to say that it works."

  "you need to come up with a way to test that is similar for all datasets.
   this so that it is simple to add and validate new datasets going forward."

⚠️ My deploy requests were prose — "indicator_summary 204 -> ~211+ distinct
source_ids" — which asks the deployer to decide whether 209 is a pass. That is
a domain judgement and the person running the deploy should not have to make
one.

🔵 THE CONTRACT IS THE SAME FOR EVERY DATASET, and what each one is expected to
do is DERIVED from the repo rather than declared in a list:

    a source unioned into fact_kommune_indicators
        -> must appear in indicator_summary with at least one series,
           and at least one kommune carrying a value
    a source with a dedicated published mart
        -> that relation must answer and return rows
    a source with downstream models but no published surface
        -> must have downstream_model_count > 0 (it feeds something)
    a declared exemption
        -> must NOT appear; frr is auth-gated by design

**So adding a dataset means adding a source and a model. This verifier then
expects it automatically.** Nothing to update here, and it cannot pass because
somebody forgot to — the failure mode of every hand-maintained checklist.

Needs only the Python standard library and network access. No dbt, no
database, no cluster credentials.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve()
DBT = next((p for p in (HERE.parents[1] / "dbt", pathlib.Path("/app/dbt"))
            if (p / "api_v1_generated.sql").exists()), None)

# Never served, by design. Mirrors check-every-source-is-served.sh; a name here
# needs a reason, not just an entry.
#   frr  Red Cross volunteer register — personal data, auth-gated, outside api_v1.
EXEMPT = {"frr": "auth-gated volunteer register, never served"}


def fetch(base, path, prefer=None):
    """Return (status, headers, rows). A transport failure is a status, not a crash."""
    req = urllib.request.Request(f"{base.rstrip('/')}/{path.lstrip('/')}")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, dict(r.headers), (json.loads(raw) if raw else [])
    except urllib.error.HTTPError as e:
        return e.code, {}, []
    except Exception as e:  # noqa: BLE001
        return f"{type(e).__name__}", {}, []


def expectations():
    """
    What each source is expected to do, read from the repo that shipped in this
    same image. Derived, never listed.
    """
    gen = (DBT / "api_v1_generated.sql").read_text()
    relations = sorted(set(re.findall(r"CREATE OR REPLACE VIEW api_v1\.(\w+)", gen)))

    fact = (DBT / "models/marts/fact_kommune_indicators.sql").read_text()
    in_fact = {m.replace("_", "-") for m in
               re.findall(r"ref\('indicators__([a-z0-9_]+)'\)", fact)}
    in_fact |= set(re.findall(r"'(ssb-crime-tables)'", fact))

    lineage = (DBT / "seeds/sources/lineage.csv").read_text().splitlines()[1:]
    feeds = {}
    for line in lineage:
        if "," not in line:
            continue
        model, sid = (x.strip().strip('"') for x in line.split(",", 1))
        feeds.setdefault(sid, set()).add(model)

    # Relations built on fact_kommune_indicators — shared by every indicator
    # source, so never a single source's own surface.
    direct = (DBT / "seeds/sources/lineage_direct.csv").read_text().splitlines()[1:]
    fact_derived = {"mart_" + r for r in ()}
    for line in direct:
        parts = [x.strip().strip('"') for x in line.split(",")]
        if len(parts) >= 2 and parts[1] == "fact_kommune_indicators":
            fact_derived.add(parts[0])

    manifest = [l.split(",")[0].strip().strip('"') for l in
                (DBT / "seeds/sources/_sources_manifest.csv").read_text().splitlines()[1:]
                if l.strip()]

    out = {}
    for sid in sorted(set(manifest)):
        if sid in EXEMPT:
            out[sid] = ("exempt", EXEMPT[sid])
        elif sid in in_fact:
            out[sid] = ("indicator", "unioned into fact_kommune_indicators")
        else:
            # A published surface this source can be held to. ⚠️ NOT the
            # relations derived from fact_kommune_indicators — indicator_summary
            # and its siblings are shared by every indicator source, so treating
            # one as a given source's surface downgrades the check from "this
            # dataset is visible" to "this relation is up", which stays true
            # while the dataset is missing. A source that IS in the fact is
            # already classified above; one that is not should never claim a
            # fact-derived relation.
            # Found by simulating a new dataset, not by reading this.
            pub = sorted({m[5:] for m in feeds.get(sid, ())
                          if m.startswith("mart_") and m[5:] in relations
                          and m not in fact_derived})
            if pub:
                out[sid] = ("published", pub[0])
            elif any(m.startswith("mart_") for m in feeds.get(sid, ())):
                out[sid] = ("upstream", f"feeds {len(feeds[sid])} model(s)")
            elif feeds.get(sid):
                # 🔴 A model that reaches no published relation. "Has a model"
                # is not "reaches a consumer" — fhi-innvandrere had an indicator
                # model emitting nothing a consumer could query, and an earlier
                # version of this classifier called that `upstream` and passed
                # it (urb-agents #1329). ⚠️ The same conflation made the
                # standing-rule gate report 0 deferred while four sources were
                # unreachable.
                out[sid] = ("unreachable", f"has {len(feeds[sid])} model(s), "
                                           "none feeding a published relation")
            else:
                out[sid] = ("unserved", "no downstream model at all")
    return out, relations


def main(base, only=None):
    if DBT is None:
        print("✗ CANNOT VERIFY: no api_v1_generated.sql beside this script or at "
              "/app/dbt. Run from a checkout or inside the image.")
        return 2

    exp, relations = expectations()

    # One request each, reused across every dataset check.
    _, _, summary = fetch(base, "indicator_summary?select=source_id,kommuner_with_value")
    series = {}
    for r in summary:
        series.setdefault(r["source_id"], []).append(r.get("kommuner_with_value") or 0)
    _, _, zero = fetch(base, "meta_sources?downstream_model_count=eq.0&select=source_id")
    no_model = {r["source_id"] for r in zero}

    rows, failures = [], 0
    for sid, (kind, why) in sorted(exp.items()):
        if only and sid != only:
            continue
        if kind == "exempt":
            ok = sid in no_model or sid not in series
            detail = why
        elif kind == "indicator":
            n = len(series.get(sid, []))
            cov = max(series.get(sid, [0]))
            ok = n > 0 and cov > 0
            detail = f"{n} series, best coverage {cov} kommuner"
            if n == 0:
                detail = "ABSENT from indicator_summary"
            elif cov == 0:
                detail = f"{n} series but NO kommune carries a value"
        elif kind == "published":
            status, hdrs, _ = fetch(base, f"{why}?limit=0", prefer="count=exact")
            n = int((hdrs.get("Content-Range") or "*/0").split("/")[-1]) if hdrs else 0
            ok = status in (200, 206) and n > 0
            detail = f"api_v1.{why} -> HTTP {status}, {n} rows"
        elif kind == "unreachable":
            # Declared: these have written reasons in
            # check-every-source-is-served.sh. The check is that they stay
            # absent rather than half-appearing.
            ok = sid not in series
            detail = why + ("" if ok else "  |  but it IS in indicator_summary "
                                          "— reclassify it, the reason is stale")
        else:  # upstream
            ok = sid not in no_model
            detail = why if ok else "downstream_model_count = 0"
        # 🔴 EVERY non-exempt source must also have a lineage edge, whatever
        # its class. A source can be live in indicator_summary AND report
        # downstream_model_count = 0 — that is exactly what brreg-oppdateringer
        # did on 2026-09-21, served through five models with the edge missing
        # from the seed. ⚠️ It reads as honest understatement, which is the
        # direction nobody audits, and an earlier version of this verifier
        # passed that scenario because it only consulted the count for sources
        # it did not otherwise expect to see.
        if kind != "exempt" and sid in no_model:
            ok = False
            detail += "  |  but downstream_model_count = 0 — LINEAGE EDGE MISSING"
        rows.append((ok, sid, kind, detail))
        failures += not ok

    w = max(len(r[1]) for r in rows) if rows else 10
    print(f"{'':2}{'dataset':{w}}  {'expected':10}  detail")
    for ok, sid, kind, detail in rows:
        print(f"{'✓ ' if ok else '✗ '}{sid:{w}}  {kind:10}  {detail}")

    # Whole-release invariants that are not per-dataset.
    print()
    inv = []

    down = [r for r in relations
            if fetch(base, f"{r}?limit=0")[0] not in (200, 206)]
    inv.append((not down, "every published relation answers",
                f"{len(relations) - len(down)} of {len(relations)}"
                + ("" if not down else ".  DOWN: " + ", ".join(down))))

    _, _, tot = fetch(base, "kommune_ngo_totals?select=active_count")
    _, _, rem = fetch(base, "unattributed_totals?relation=eq.kommune_ngo_totals"
                            "&measure=eq.active_count&select=unattributed_value,total_value")
    if tot and rem:
        placed = sum(r.get("active_count") or 0 for r in tot)
        remainder = sum(r.get("unattributed_value") or 0 for r in rem)
        claimed = max((r.get("total_value") or 0) for r in rem)
        inv.append((placed + remainder == claimed and claimed > 0,
                    "placed + remainder equals the total",
                    f"{placed} + {remainder} = {placed + remainder} vs claimed {claimed}"))
    else:
        inv.append((False, "placed + remainder equals the total",
                    "could not read kommune_ngo_totals or unattributed_totals"))

    for ok, name, detail in inv:
        print(f"{'✓ ' if ok else '✗ '}{name}\n    {detail}")
        failures += not ok

    total = len(rows) + len(inv)
    print()
    if failures:
        print(f"✗ {failures} of {total} checks FAILED.")
        print("  Report the lines above before retrying — a retry overwrites the")
        print("  evidence, and the detail column is the diagnosis.")
        return 1
    print(f"✓ all {total} checks passed. The release works as intended.")
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
        args = [a for a in args if a != only]
    if len(args) != 1:
        print("usage: verify-release.py <api-base-url> [--only <source_id>]")
        sys.exit(2)
    sys.exit(main(args[0], only))
