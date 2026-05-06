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

import yaml


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


def _build_raw_table_map(sources_root: Path) -> dict[str, str]:
    """Scan every `<sources_root>/<source_id>/manifest.yml` and return a map
    `raw_table_name → source_id` covering all multi-table + simple-rename
    sources.

    Each manifest declares its raw tables in one of two ways:

      raw_tables:           # explicit list when the source owns >1 raw table
        - ssb_08484         # or when the table name doesn't match the
        - ssb_08487         # `source_id.replace('-', '_')` default rule
        - ssb_09405
        - ssb_09406

    Or the field is omitted, in which case the default is
    `[source_id.replace('-', '_')]` — single raw table whose name matches the
    folder name with hyphens translated to underscores.

    Operational raw tables that no source folder claims (`raw.ingest_runs`,
    `raw.sitemap_log`) simply don't appear in the resulting map; lineage
    edges to them are dropped naturally.
    """
    mapping: dict[str, str] = {}
    if not sources_root.exists():
        return mapping
    for manifest_path in sorted(sources_root.glob("*/manifest.yml")):
        try:
            data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            continue
        source_id = data.get("source_id")
        if not source_id or not isinstance(source_id, str):
            continue
        raw_tables = data.get("raw_tables")
        if raw_tables is None:
            raw_tables = [source_id.replace("-", "_")]
        if not isinstance(raw_tables, list):
            continue
        for table in raw_tables:
            if isinstance(table, str) and table:
                mapping[table] = source_id
    return mapping


def _table_name_to_source_id(
    table_name: str, raw_table_map: dict[str, str]
) -> str | None:
    """Look up the source_id for a raw table name; return None when no source
    folder claims it (e.g. operational tables `ingest_runs`, `sitemap_log`).

    The map is built from `<atlas-data>/ingest/src/sources/*/manifest.yml`'s
    `raw_tables:` field; see `_build_raw_table_map`. No fallback to the bare
    `replace('-', '_')` rule — every legitimate source must declare its raw
    tables in its manifest (the default value for a single-table source is
    derived from `source_id` automatically).
    """
    return raw_table_map.get(table_name)


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


def extract_lineage(
    manifest: dict, raw_table_map: dict[str, str]
) -> list[tuple[str, str]]:
    """Return [(model_name, source_id), ...] sorted, deduped.

    `raw_table_map` is built once at startup from each manifest.yml's
    `raw_tables:` field via `_build_raw_table_map`. Lineage edges to raw
    tables not in the map (operational tables like `raw.ingest_runs`) are
    dropped silently.
    """
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
            source_id = _table_name_to_source_id(table_name, raw_table_map)
            if source_id is None:
                # Operational table or a source folder that hasn't declared
                # this raw table in its manifest — drop the edge so the
                # lineage seed cleanly joins on _sources_manifest.
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
    repo_root = project_root.parent.parent  # atlas-data/dbt → atlas-data → repo
    sources_root = repo_root / "atlas-data" / "ingest" / "src" / "sources"

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--manifest",
        default=str(project_root / "target" / "manifest.json"),
        help="Path to dbt's target/manifest.json (default: <project>/target/manifest.json)",
    )
    p.add_argument(
        "--sources-root",
        default=str(sources_root),
        help="Path to the per-source manifest.yml folder root (default: <repo>/atlas-data/ingest/src/sources)",
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
    sources_root_path = Path(args.sources_root)

    if not manifest_path.exists():
        print(
            f"ERROR: manifest not found at {manifest_path}. Run `dbt parse` first.",
            file=sys.stderr,
        )
        return 2

    raw_table_map = _build_raw_table_map(sources_root_path)
    if not raw_table_map:
        print(
            f"WARNING: no raw_tables found by scanning {sources_root_path} — "
            f"emitting an empty lineage seed. Did the sources path move?",
            file=sys.stderr,
        )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    edges = extract_lineage(manifest, raw_table_map)

    if args.check:
        # Build the would-be CSV in memory and compare. csv.writer emits CRLF
        # line endings; read_text normalises CRLF to LF on read. Strip both to
        # LF before comparing so the gate doesn't false-positive on platform
        # line-ending differences.
        from io import StringIO

        sio = StringIO()
        w = csv.writer(sio)
        w.writerow(["model_name", "source_id"])
        for m, s in edges:
            w.writerow([m, s])
        new_text = sio.getvalue().replace("\r\n", "\n").rstrip("\n")
        existing_raw = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
        existing = existing_raw.replace("\r\n", "\n").rstrip("\n")
        if new_text == existing:
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
