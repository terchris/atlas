#!/usr/bin/env python3
"""
Generate the "what Atlas holds" summary into the two places a developer reads
it: website/docs/developers/index.md and atlas-data/template-info.yaml.

🔴 WHY GENERATED. Atlas gained nine sources and two public relations in one
day. A hand-written inventory is wrong by the next merge, and this repo has
now shipped that defect three times in two days — fhi-depresjon advertising
fourteen years it never held, the marts table counts going stale twice, and my
own "42-88 ms" survived in a description long after it was false.

⚠️ SO: few numbers, all derived, and a pointer to the live catalogue for
anything that changes faster than a release. meta_sources and meta_endpoints
are queryable; this summary exists to tell a developer those exist and roughly
what they will find, not to duplicate them.

Usage:  generate-holdings.py            rewrite both files
        generate-holdings.py --check    exit 1 if either is out of date
"""
import csv, collections, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "atlas-data/dbt/seeds/sources/_sources_manifest.csv"
GENERATED = ROOT / "atlas-data/dbt/api_v1_generated.sql"
DOCS = ROOT / "website/docs/developers/index.md"
TEMPLATE = ROOT / "atlas-data/template-info.yaml"

BEGIN, END = "<!-- BEGIN holdings (generated) -->", "<!-- END holdings (generated) -->"
Y_BEGIN, Y_END = "# BEGIN holdings (generated)", "# END holdings (generated)"

PUBLISHER_NOTE = {
    "Statistisk sentralbyrå": "population, income, families, housing, education, crime",
    "Folkehelseinstituttet": "public health, and the Ungdata youth surveys",
    "Brønnøysundregistrene": "the company and voluntary-organisation registers",
    "Barne-, ungdoms- og familiedirektoratet": "child poverty",
    "Norges Røde Kors": "local chapters and their activities",
}
THEME_NOTE = {"SOCI": "society", "HEAL": "health", "EDUC": "education",
              "GOVE": "government", "JUST": "justice", "ECON": "economy",
              "ENVI": "environment", "REGI": "regions"}


def collect():
    rows = list(csv.DictReader(MANIFEST.open()))
    sql = GENERATED.read_text()
    views = re.findall(r"CREATE OR REPLACE VIEW api_v1\.(\w+) IS?", sql)
    views = re.findall(r"CREATE OR REPLACE VIEW api_v1\.(\w+)", sql)
    pubs = collections.Counter(r["publisher"] for r in rows)
    themes = collections.Counter(r.get("eu_theme") or "?" for r in rows)
    lics = collections.Counter(r.get("license") or "?" for r in rows)
    return rows, sorted(set(views)), pubs, themes, lics





def _marts_counts():
    """
    How many relations land in schema `marts`, tables and views separately.

    🔴 THE LAST HAND-EDITED NUMBER IN template-info.yaml, and it caught me three
    times in one day — 63, then 72, then 80. `render-template-info.sh` computed
    the right answer each time in order to tell me I was wrong, and I typed the
    correction in by hand. A number a gate can compute is a number nobody should
    be typing.

    ⚠️ DELIBERATELY A SECOND IMPLEMENTATION, not a shared one. The bash gate
    greps the model files; this walks them in Python. If they ever disagree one
    of them is wrong and I find out — sharing the derivation would make the gate
    agree with the generator by construction and check nothing. That is
    ops-dev's three-independent-routes point applied to a number instead of a
    deploy.

    The rule, same as the gate states it: a model lands in marts if it declares
    `schema='marts'` or lives under models/{indicators,dimensions,marts}; views
    are counted apart; every seed lands in marts.
    """
    root = ROOT / "atlas-data/dbt"
    tables = views = 0
    for f in (root / "models").rglob("*.sql"):
        text = f.read_text()
        m = re.search(r"schema='([a-z_]+)'", text)
        schema = m.group(1) if m else (
            "marts" if any(part in f.parts for part in ("indicators", "dimensions", "marts"))
            else "other")
        if schema != "marts":
            continue
        if "materialized='view'" in text:
            views += 1
        else:
            tables += 1
    seeds = len(list((root / "seeds").rglob("*.csv")))
    return tables + seeds, views, tables, seeds


def _relations():
    """
    The published relations and the first sentence of each COMMENT ON VIEW.

    🔵 Read from api_v1_generated.sql, which is generated from the dbt manifest
    — so the list cannot drift from what is actually served, and the wording is
    the same text PostgREST hands a consumer as its OpenAPI description.
    """
    sql = GENERATED.read_text()
    out = []
    for m in re.finditer(r"COMMENT ON VIEW api_v1\.(\w+) IS '((?:[^']|'')*)';", sql, re.S):
        name, body = m.group(1), m.group(2).replace("''", "'")
        first = re.split(r"(?<=[.!?])\s", body.strip().replace("\n", " "), maxsplit=1)[0]
        first = re.sub(r"\s+", " ", first).strip()
        out.append((name, first))
    return sorted(out)


def _nonpublic(rows):
    """
    ⚠️ The honest sentence about the sources that are NOT open public data.
    An earlier version of this generator wrote "everything served is public
    data" while its own licence count said `internal (1)` — a claim contradicted
    by the line above it.
    """
    other = [r for r in rows if (r.get("license") or "") != "NLOD"]
    if not other:
        return "Every source is open public data."
    bits = []
    for r in sorted(other, key=lambda r: r["source_id"]):
        bits.append(f"`{r['source_id']}` ({r['license']})")
    return ("The exceptions are " + " and ".join(bits) +
            " — Red Cross's own data rather than the state's.")


def markdown():
    rows, views, pubs, themes, lics = collect()
    L = [BEGIN, ""]
    L.append(f"**{len(rows)} upstream sources** from **{len(pubs)} publishers**, "
             f"served as **{len(views)} read-only relations**.")
    L += ["", "| publisher | sources | broadly |", "|---|---|---|"]
    for p, n in pubs.most_common():
        L.append(f"| {p} | {n} | {PUBLISHER_NOTE.get(p, '—')} |")
    L += ["", "By EU data theme: " + " · ".join(
        f"**{t}** {n} ({THEME_NOTE.get(t, t)})" for t, n in themes.most_common()) + "."]
    nlod = lics.get("NLOD", 0)
    L += ["", f"Licences: **NLOD** for {nlod} of {len(rows)} — Norwegian public data, "
              "free to reuse with attribution. " + _nonpublic(rows)]
    L += ["", "### What you can query", "",
          "| relation | what it holds |", "|---|---|"]
    for name, first in _relations():
        L.append(f"| `{name}` | {first} |")
    L += ["", "Every relation, with its columns and their descriptions:", "",
          "```bash", "curl -s $ATLAS/meta_endpoints        # what is queryable",
          "curl -s $ATLAS/meta_sources          # every upstream, with freshness",
          "curl -s $ATLAS/indicator_summary     # every published series",
          "```", "",
          ":::warning `downstream_model_count` says a source has a model, not that you can reach it",
          "",
          "A source can have `downstream_model_count > 0` and still produce nothing you can "
          "query — the model exists and feeds no published relation. `fhi-innvandrere` is in "
          "that state today: one model, 32 720 rows ingested, absent from `indicator_summary` "
          "and from every `api_v1` relation.",
          "",
          "**The measure that answers \"can I use it\" is whether the source appears in "
          "`indicator_summary`, or whether some `api_v1` relation carries it.** Subtracting "
          "those from `meta_sources` gives what Atlas holds and does not yet serve.",
          "", ":::", "",
          "⚠️ Those three are the live answer. The numbers above are regenerated "
          "on release; coverage, row counts and freshness change between releases "
          "and are only true in the catalogue.", "", END]
    return "\n".join(L)


def yaml_block():
    rows, views, pubs, themes, lics = collect()
    L = [Y_BEGIN,
         "data:",
         f"  sources: {len(rows)}",
         f"  publishers: {len(pubs)}",
         f"  public_relations: {len(views)}",
         "  holds: >-",
         "    Norwegian public data at kommune level, joined into one semantic layer:",
         "    " + "; ".join(f"{p} ({n})" for p, n in pubs.most_common()) + ".",
         f"    Published as read-only PostgREST relations under api_v1. NLOD for",
         f"    {lics.get('NLOD', 0)} of {len(rows)} — Norwegian public data, free to reuse with",
         "    attribution. " + _nonpublic(rows),
         "  discover: >-",
         # 🔵 THE FOUR A CONSUMER NEEDS, and the last two were added because
         # each went unfound by someone who needed exactly what it holds.
         # meta_dimensions carries what every coded column MEANS and nothing
         # pointed at it for weeks (urb-agents #1335). served_as says whether
         # a source reaches a consumer at all; it is live, three agents use
         # it as a gate, and it appeared nowhere in this artifact until
         # dev-templates noticed (urb-agents #1353).
         "    GET /meta_endpoints for what is queryable, /meta_sources for every upstream",
         "    with its freshness and a served_as array naming the relations it actually",
         "    reaches (empty means nothing published depends on it), /meta_dimensions for",
         "    what each coded column MEANS — read it before interpreting a code —, and",
         "    /indicator_summary for every published series. Those are the live answer;",
         "    the counts here are regenerated per release.",
         Y_END]
    return "\n".join(L)


def splice(path, begin, end, block, anchor=None):
    text = path.read_text()
    if begin in text and end in text:
        new = re.sub(re.escape(begin) + r".*?" + re.escape(end), lambda _: block,
                     text, flags=re.S)
    else:
        if anchor is None or anchor not in text:
            raise SystemExit(f"✗ no markers and no anchor in {path}")
        new = text.replace(anchor, block + "\n\n" + anchor, 1)
    return new


def _rewrite_counts(text):
    """The two claims render-template-info.sh checks, written rather than typed."""
    tables, views, models, seeds = _marts_counts()
    text = re.sub(r"\d+ marts BASE TABLEs", f"{tables} marts BASE TABLEs", text)
    text = re.sub(r"\(plus \d+\s*\n?\s*marts views\)",
                  lambda m: m.group(0).replace(re.search(r"\d+", m.group(0)).group(0), str(views)),
                  text)
    text = re.sub(r"\(plus \d+ marts views\)", f"(plus {views} marts views)", text)
    text = re.sub(r'the "\d+ marts views" above', f'the "{views} marts views" above', text)
    # 🔴 THE COUNTING RULE'S OWN NUMBERS, which were typed and went stale three
    # times (#824, #1263, #1353). They are written in the form `models=46` so a
    # YAML fold cannot break the token apart — the 2026-09-21 failure included a
    # phrase invisible to grep for exactly that reason.
    text = re.sub(r"models=\d+", f"models={models}", text)
    text = re.sub(r"seeds=\d+", f"seeds={seeds}", text)
    text = re.sub(r"views=\d+", f"views={views}", text)
    return text


def main():
    check = "--check" in sys.argv
    targets = [
        (DOCS, BEGIN, END, markdown(), "## Open by default"),
        (TEMPLATE, Y_BEGIN, Y_END, yaml_block(), "provides:"),
    ]
    stale = []
    for path, b, e, block, anchor in targets:
        new = splice(path, b, e, block, anchor)
        if path == TEMPLATE:
            new = _rewrite_counts(new)
        if new != path.read_text():
            stale.append(path.relative_to(ROOT))
            if not check:
                path.write_text(new)
    if check:
        if stale:
            print("✗ the holdings summary is out of date in:")
            for s in stale:
                print(f"    {s}")
            print("  Run atlas-data/uis/generate-holdings.py and commit the result.")
            return 1
        print("✓ the holdings summary matches the manifests in both places")
        return 0
    print("✓ regenerated" if stale else "✓ already current",
          "—", ", ".join(str(s) for s in stale) or "no change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
