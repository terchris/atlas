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
        -> must NOT appear

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
# ⚠️ EMPTY since 2026-09-24, when its only entry was removed on Terje's
# instruction (urb-agents #1453). Empty is correct, not a gap.
EXEMPT: dict[str, str] = {}


class Unreachable(Exception):
    """The API could not be talked to at all — not the same as data being absent."""


def fetch(base, path, prefer=None):
    """
    Return (status, headers, rows). A transport failure raises Unreachable.

    🔴 THE USER-AGENT IS NOT COSMETIC. urllib sends `Python-urllib/3.x` and
    Cloudflare answers 403 to it. Without this header every dataset reported
    "ABSENT from indicator_summary" — ~40 failures that looked exactly like
    total data loss, from one missing header (urb-agents #1328).

    ⚠️ And that was the worse half: the verifier could not tell "the API said
    no" from "the data is gone". A tool whose failure mode is indistinguishable
    from catastrophe is worse than no tool, because someone will act on it.
    Transport failures now raise and stop the run with one clear line.
    """
    req = urllib.request.Request(f"{base.rstrip('/')}/{path.lstrip('/')}")
    req.add_header("User-Agent", "atlas-verify-release/1.0 (+terchris/atlas)")
    req.add_header("Accept", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            # 🔴 LOWERCASED, BECAUSE HTTP HEADER NAMES ARE CASE-INSENSITIVE
            # AND dict() IS NOT. `dict(r.headers)` keeps whatever casing the
            # server sent, so `hdrs.get("Content-Range")` missed PostgREST's
            # `content-range` and every `published` relation reported 0 rows
            # and FAILED — brreg_enhet "0 rows" against 1,174,987 actual, on
            # 2026-09-21. ⚠️ Six of the run's nine failures were this, and
            # "0 rows" is indistinguishable from a relation that is genuinely
            # empty, which is the failure mode this tool exists to avoid
            # reporting (urb-agents #1332).
            return (r.status,
                    {k.lower(): v for k, v in r.headers.items()},
                    (json.loads(raw) if raw else []))
    except urllib.error.HTTPError as e:
        # 403/401/429 are the API refusing us, not a relation missing.
        if e.code in (401, 403, 429, 502, 503, 504):
            raise Unreachable(
                f"HTTP {e.code} from {path.split('?')[0]} — the API refused the "
                f"request itself. This is not a data problem."
            ) from e
        return e.code, {}, []
    except Exception as e:  # noqa: BLE001
        raise Unreachable(f"{type(e).__name__} talking to {base}") from e


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
            elif any(m in fact_derived for m in feeds.get(sid, ())):
                # It feeds a fact-derived relation, so it IS an indicator source
                # — ssb-crime-tables reaches the fact through a synthesised id
                # that the `ref()` scan cannot see.
                out[sid] = ("indicator", "feeds a fact-derived relation")
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
    try:
        return _run(base, only)
    except Unreachable as e:
        print(f"✗ CANNOT VERIFY: {e}")
        print("  Nothing below was checked. This is NOT evidence that any dataset")
        print("  is missing — the verifier could not reach the API at all.")
        return 2


def _run(base, only=None):
    if DBT is None:
        print("✗ CANNOT VERIFY: no api_v1_generated.sql beside this script or at "
              "/app/dbt. Run from a checkout or inside the image.")
        return 2

    exp, relations = expectations()

    # One request each, reused across every dataset check.
    #
    # 🔴 A MISSING COLUMN IS A RELEASE FACT, NOT FORTY DATASET FAILURES.
    # `latest_year_window_years` landed in cfb7aa2. Selecting it against an
    # older build returns PGRST204/42703 and PostgREST fails the WHOLE
    # request, so a naive select would report every dataset ABSENT — the
    # identical uniform-negative that the User-Agent bug produced above, one
    # level down, which is exactly where my last three lessons failed. So the
    # column is probed separately and its absence is reported once, as "this
    # build predates the column", and nothing else is claimed.
    status, _, windowed = fetch(
        base, "indicator_summary?select=source_id,latest_year_window_years")
    window_deployed = status in (200, 206)
    windows = {}
    if window_deployed:
        for r in windowed:
            w = r.get("latest_year_window_years")
            if w is not None:
                windows.setdefault(r["source_id"], []).append(w)

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
            elif window_deployed:
                # Every indicator series must carry a window length. 1 is a
                # legitimate answer (an annual series); NULL or absent is not,
                # because a consumer rendering `latest_year` alone prints a
                # date that can be wrong by four years (urb-agents #1331).
                ws = windows.get(sid)
                if not ws:
                    ok = False
                    detail += "  |  NO latest_year_window_years — a consumer " \
                              "cannot render its year safely"
                elif min(ws) < 1:
                    ok = False
                    detail += f"  |  latest_year_window_years = {min(ws)}, " \
                              "which is not a length"
                else:
                    detail += f", window {min(ws)}-{max(ws)}y"
        elif kind == "published":
            status, hdrs, _ = fetch(base, f"{why}?limit=0", prefer="count=exact")
            n = int((hdrs.get("content-range") or "*/0").split("/")[-1]) if hdrs else 0
            ok = status in (200, 206) and n > 0
            detail = f"api_v1.{why} -> HTTP {status}, {n} rows"
        elif kind == "unreachable":
            # Declared: these have written reasons in
            # check-every-source-is-served.sh. The check is that they stay
            # absent rather than half-appearing.
            ok = sid not in series
            detail = why + ("" if ok else "  |  but it IS in indicator_summary "
                                          "— reclassify it, the reason is stale")
        else:
            # 🔴 THERE IS NO LONGER AN `upstream` BRANCH, AND THAT IS THE FIX.
            # It tested only `sid not in no_model` — it never touched the API,
            # so it PASSED during a run where the API was unreachable and forty
            # other datasets failed. ⚠️ A branch that cannot fail is not a
            # check, and I had written a comment two levels up warning about
            # the shallower version of exactly this (urb-agents #1328).
            raise AssertionError(f"unclassified source {sid!r} ({kind}) — every "
                                 "class must assert something against the API")
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
        # 🔴 A DEFERRED SOURCE IS NOT A PASS. `unreachable` sources are
        # declared in BACKLOG with a reason, so they are not FAILURES — but
        # printing ✓ beside "has 1 model(s), none feeding a published
        # relation" reads as "this is fine", and it is not: nothing published
        # depends on it. ops-dev called this out on urb-agents #1332 as a
        # blind spot that was documented rather than closed. It still does not
        # fail the run; it no longer claims to be healthy.
        mark = ('⚠ ' if ok and kind == "unreachable" else '✓ ' if ok else '✗ ')
        print(f"{mark}{sid:{w}}  {kind:10}  {detail}")

    # Whole-release invariants that are not per-dataset.
    print()
    inv = []

    # Said once, as a property of the BUILD. The per-dataset window check
    # above is skipped when this is false, so it must be visible or the
    # report silently gets weaker without saying so — "a check can pass by
    # finding nothing to check".
    inv.append((window_deployed,
                "the build carries latest_year_window_years",
                "present; every indicator's window was checked"
                if window_deployed else
                "ABSENT — this build predates cfb7aa2, so no window was "
                "checked on any dataset. Consumers rendering `latest_year` "
                "alone can be wrong by up to four years (urb-agents #1331). "
                "This says nothing about the datasets themselves."))

    down = [r for r in relations
            if fetch(base, f"{r}?limit=0")[0] not in (200, 206)]
    inv.append((not down, "every published relation answers",
                f"{len(relations) - len(down)} of {len(relations)}"
                + ("" if not down else ".  DOWN: " + ", ".join(down))))

    # 🔴 RESOURCE EMBEDDING, WHICH NOTHING HAS EVER CHECKED. PostgREST derives
    # `?select=...,meta_sources(license)` from a FOREIGN KEY, and that FK is
    # created by a post-hook — `register_source_id_fk()` — which reruns on
    # every transform because both marts are tables and a rebuild of either
    # drops the constraint.
    #
    # ⚠️ THAT HOOK HAS A DEMONSTRATED FAILURE MODE, not a theoretical one. On
    # 2026-09-21 it aborted its model with `relation
    # "mart_meta_sources_source_id_key" already exists`: the guard checked
    # `conrelid`, which is table-scoped, while the collision was on an index
    # name, which is schema-scoped. It went unreported for five releases
    # (urb-agents #1337).
    #
    # 🔵 NO `limit`, DELIBERATELY, AND THE COUNT COMES FROM THE BODY. imac's
    # correction: the three outcomes are PGRST200 (FK gone), null embeds (FK
    # present, join matches nothing — the worse one), and data. A `limit=3`
    # can only see the first, because a subset mismatch shows as SOME nulls
    # and the first rows are the ones most likely to be fine. Counting the
    # parsed JSON also sidesteps the Content-Range header-case bug that
    # reported 0 rows for every published relation earlier today.
    #
    # ⚠️ PRESENCE OF A LICENCE, NEVER ITS VALUE. My own filing said to expect
    # "NLOD 2.0"; every row returns "NLOD", and the seed holds three distinct
    # values (NLOD, permissive, internal). Asserting the string would fail on
    # correct data.
    emb_status, _, emb = fetch(
        base, "indicator_summary?select=source_id,meta_sources(license)")
    if emb_status not in (200, 206):
        inv.append((False, "indicator_summary embeds meta_sources",
                    f"HTTP {emb_status} — PGRST200 here means the foreign key "
                    f"is GONE and every embedded query a consumer writes is "
                    f"broken"))
    elif not emb:
        inv.append((False, "indicator_summary embeds meta_sources",
                    "zero rows — cannot tell a broken embed from an empty "
                    "relation, so this is not a pass"))
    else:
        bad = [r["source_id"] for r in emb
               if not isinstance(r.get("meta_sources"), dict)
               or not r["meta_sources"].get("license")]
        inv.append((not bad, "indicator_summary embeds meta_sources",
                    f"{len(emb)} rows, all carrying a licence"
                    if not bad else
                    f"{len(bad)} of {len(emb)} rows have a null or licence-less "
                    f"embed — the FK exists and the join misses. "
                    f"e.g. {', '.join(sorted(bad)[:3])}"))

    # 🔴 A TYPED NUMBER POSING AS A MEASUREMENT. The published descriptions
    # assert "357 kommuner" in ten places across eight relations, and nothing
    # recomputed it. Norway merges kommuner — that is the entire reason
    # dim_kommune carries valid_from/valid_to — so the day the count changes,
    # ten served descriptions become confidently wrong and no check notices.
    #
    # 🔵 THE TECHNIQUE IS THE DEMO CONSUMER'S, from urb-agents #1384. It found
    # the same defect in its own page: a quartile table it had COMPUTED in a
    # scratch script and TYPED into prose. Its first test asserted the rendered
    # string had changed and failed, because a correct derivation produces a
    # string identical to the correct quotation. So it perturbed the input and
    # required the output to move.
    #
    # ⚠️ I cannot perturb a published database, so this is the reachable half:
    # derive the count from the data and require the prose to agree with it.
    # It catches the same thing one step later — after the count moves rather
    # than before — which is the difference between a stale number that fails
    # CI and one a consumer reports.
    for label, flt in (("active, non-sentinel", "is_active=eq.true&is_sentinel=eq.false"),
                       ("active, incl. sentinel", "is_active=eq.true")):
        st, hd, _ = fetch(base, f"dim_kommune?{flt}&limit=0", prefer="count=exact")
        n = int((hd.get("content-range") or "*/0").split("/")[-1]) if hd else 0
        if label.startswith("active,") and "non" in label:
            live_kommuner = n
        else:
            live_with_sentinel = n

    st, _, spec = fetch(base, "")
    if st in (200, 206) and isinstance(spec, dict):
        import re as _re
        claims = {}
        for name, d in (spec.get("definitions") or {}).items():
            texts = [d.get("description") or ""]
            texts += [(p.get("description") or "")
                      for p in (d.get("properties") or {}).values()]
            for t in texts:
                for tok in _re.findall(r"(?<![\d])(3\d\d)(?![\d])", t):
                    claims.setdefault(int(tok), set()).add(name)
        allowed = {live_kommuner, live_with_sentinel}
        stale = {k: v for k, v in claims.items() if k not in allowed}
        # ⚠️ MEMBERSHIP ALONE IS NOT ENOUGH, and the control proved it. If the
        # count falls 357 -> 356, the stale 357 becomes the WITH-SENTINEL
        # value and passes a set test — exactly the merger this check is for.
        # So the MODAL claim must equal the non-sentinel count: the number the
        # descriptions say most often is the one they mean by "kommuner".
        modal = max(claims, key=lambda k: len(claims[k])) if claims else None
        modal_ok = modal is None or modal == live_kommuner
        detail = (f"{live_kommuner} active non-sentinel, {live_with_sentinel} with it; "
                  f"every claim agrees (modal {modal})")
        if stale:
            detail = "; ".join(f"{k} claimed by {sorted(v)} but the live counts are "
                               f"{sorted(allowed)}" for k, v in sorted(stale.items()))
        elif not modal_ok:
            detail = (f"the descriptions say {modal} most often ({len(claims[modal])} "
                      f"relations) but only {live_kommuner} kommuner are active and "
                      f"non-sentinel — a merger would look exactly like this")
        inv.append((not stale and modal_ok,
                    "kommune counts in the published descriptions match the data",
                    detail))
    else:
        inv.append((False, "kommune counts in the published descriptions match the data",
                    f"could not read the OpenAPI root (HTTP {st}) — not checked"))

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
