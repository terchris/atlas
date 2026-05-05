"""
extract_lineage.py — emit the (model_name, source_id) lineage seed from
dbt's manifest.json.

After `dbt parse` produces target/manifest.json, this script walks the
dependency graph upward from each model in marts.* (and api_v1.*, although
those are generator-emitted views that don't appear in manifest.json) until
it hits the root raw.<table> sources. For each (model, root-source) pair it
emits one row in seeds/sources/lineage.csv.

`mart_meta_sources` reads this seed to compute `downstream_model_count`
(how many marts ride on each ingest source). `mart_meta_endpoints` reads
it to inherit tags from sources via the dbt lineage graph (union semantics
per PLAN-007 phase 3.2).

Usage:
    python extract_lineage.py                      # writes seeds/sources/lineage.csv
    python extract_lineage.py --check              # exit 1 if the file would change
    python extract_lineage.py --manifest path.json --out-csv path.csv  # explicit paths

Source-id translation:
    The dbt source declarations (`{{ source('raw', 'ssb_08764') }}`) carry
    the SQL-identifier form of the source name (underscores). Atlas's
    canonical source_id uses hyphens (`ssb-08764`). The seed needs the
    canonical hyphen form so it joins on `_sources_manifest.source_id`
    cleanly. Translation rule: `_` → `-` everywhere. Per PLAN-007 phase 3.3,
    this rule is uniform across all sources today (no exceptions).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Iterable


def _walk_to_root_sources(
    node_id: str, nodes: dict, sources: dict, seen: set[str] | None = None
) -> set[str]:
    """Return the set of `source.atlas.raw.<table>` ids reachable from node_id."""
    if seen is None:
        seen = set()
    if node_id in seen:
        return set()
    seen.add(node_id)

    # If node_id is itself a source, that's a leaf — return its raw table.
    if node_id.startswith("source."):
        if node_id in sources:
            return {node_id}
        return set()

    node = nodes.get(node_id)
    if not node:
        return set()

    parents = node.get("depends_on", {}).get("nodes", [])
    out: set[str] = set()
    for parent in parents:
        out |= _walk_to_root_sources(parent, nodes, sources, seen)
    return out


# Raw tables that don't follow the simple `_` → `-` rule (e.g. one source
# folder owns multiple raw tables, or the table is operational and has no
# catalogue source_id at all). Update this map when a new multi-table source
# lands or when an existing source's raw layout changes.
#
# Long-term, the right home for this is a `raw_tables: [...]` field on each
# source's manifest.yml — see PLAN-007 phase 3 follow-up notes. For now the
# explicit map keeps the lineage seed accurate without a wider schema change.
_RAW_TABLE_OVERRIDES: dict[str, str | None] = {
    # ssb-crime-tables: one source folder, four raw landing tables (each Px
    # endpoint is a separate table by SSB convention).
    "ssb_08484": "ssb-crime-tables",
    "ssb_08487": "ssb-crime-tables",
    "ssb_09405": "ssb-crime-tables",
    "ssb_09406": "ssb-crime-tables",
    # redcross-branches: one source folder, parent + activities tables.
    "redcross_branch_activities": "redcross-branches",
    # Operational tables — no catalogue source_id. Map to None so lineage
    # explicitly drops these edges (we don't want them appearing in the
    # downstream-model-count or tag-inheritance joins).
    "ingest_runs": None,
    "sitemap_log": None,
}


def _table_name_to_source_id(table_name: str) -> str | None:
    """Translate dbt source table_name → Atlas source_id, or None to drop the edge.

    Default rule: replace `_` with `-`. Override map handles multi-table
    source folders and operational tables that don't fit the rule.
    """
    if table_name in _RAW_TABLE_OVERRIDES:
        return _RAW_TABLE_OVERRIDES[table_name]
    return table_name.replace("_", "-")


def _model_qualifies(node: dict) -> bool:
    """Include `marts.*` models. Skip private-prefixed seeds + the lineage seed itself."""
    if node.get("resource_type") != "model":
        return False
    if node.get("schema") != "marts":
        return False
    name = node.get("name", "")
    # Seeds materialised in marts (`_sources_manifest`, `_sources_dimensions`,
    # `eu_data_theme`, `lineage`) aren't models — but a defensive skip on the
    # underscore-prefixed convention covers any future seeds that get
    # accidentally classified as models.
    if name.startswith("_"):
        return False
    if name == "lineage":
        return False
    return True


def extract_lineage(manifest: dict) -> list[tuple[str, str]]:
    """Return [(model_name, source_id), ...] sorted, deduped."""
    nodes = manifest.get("nodes", {})
    sources = manifest.get("sources", {})

    edges: set[tuple[str, str]] = set()
    for node_id, node in nodes.items():
        if not _model_qualifies(node):
            continue
        roots = _walk_to_root_sources(node_id, nodes, sources)
        for root_id in roots:
            src = sources.get(root_id)
            if not src:
                continue
            # Only `raw` sources matter for source_id derivation. (We don't
            # have non-raw sources today, but be defensive.)
            if src.get("source_name") != "raw":
                continue
            table_name = src.get("name") or ""
            source_id = _table_name_to_source_id(table_name)
            if source_id is None:
                # Operational table (raw.ingest_runs, raw.sitemap_log) — no
                # catalogue source_id; drop the edge so the lineage seed
                # cleanly joins on _sources_manifest.
                continue
            edges.add((node.get("name", ""), source_id))
    return sorted(edges)


def write_csv(edges: Iterable[tuple[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["model_name", "source_id"])
        for model, src in edges:
            writer.writerow([model, src])


def main() -> int:
    here = Path(__file__).resolve().parent
    project_root = here.parent

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--manifest",
        default=str(project_root / "target" / "manifest.json"),
        help="Path to dbt's target/manifest.json (default: <project>/target/manifest.json)",
    )
    p.add_argument(
        "--out-csv",
        default=str(project_root / "seeds" / "sources" / "lineage.csv"),
        help="Path to the output seed CSV (default: <project>/seeds/sources/lineage.csv)",
    )
    p.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if the existing CSV differs from what we would emit (CI mode)",
    )
    args = p.parse_args()

    manifest_path = Path(args.manifest)
    out_path = Path(args.out_csv)

    if not manifest_path.exists():
        print(
            f"ERROR: manifest not found at {manifest_path}. Run `dbt parse` first.",
            file=sys.stderr,
        )
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    edges = extract_lineage(manifest)

    if args.check:
        # Build the would-be CSV in memory and compare.
        from io import StringIO

        sio = StringIO()
        w = csv.writer(sio)
        w.writerow(["model_name", "source_id"])
        for m, s in edges:
            w.writerow([m, s])
        new_text = sio.getvalue()
        existing = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
        if new_text.strip() == existing.strip():
            print(f"ok: {out_path} is up to date ({len(edges)} edges)")
            return 0
        print(
            f"DRIFT: {out_path} would change. Re-run without --check to update.",
            file=sys.stderr,
        )
        return 1

    write_csv(edges, out_path)
    print(f"wrote {out_path} ({len(edges)} edges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
