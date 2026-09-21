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
            " — Red Cross's own data rather than the state's. `frr` is a volunteer "
            "register held in an auth-gated schema and is NOT served on the public API.")


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
         "    GET /meta_endpoints for what is queryable, /meta_sources for every upstream",
         "    with its freshness, /indicator_summary for every published series. Those are",
         "    the live answer; the counts here are regenerated per release.",
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


def main():
    check = "--check" in sys.argv
    targets = [
        (DOCS, BEGIN, END, markdown(), "## Open by default"),
        (TEMPLATE, Y_BEGIN, Y_END, yaml_block(), "provides:"),
    ]
    stale = []
    for path, b, e, block, anchor in targets:
        new = splice(path, b, e, block, anchor)
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
