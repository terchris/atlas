"""
build_sources_seed.py — scan per-source manifest.yml files and emit the
dbt seed CSV that backs marts._sources_manifest.

Reads atlas-data/ingest/src/sources/<id>/manifest.yml for every source,
validates each against the required-field list (eight top-level fields
plus four declared tag namespaces), and writes a CSV at
atlas-data/dbt/seeds/sources/manifest.csv.

Validation fails loudly when any required field is missing or still
holds a TODO placeholder. A bad manifest blocks the whole CSV emission;
seed regeneration is all-or-nothing.

The `tags` column is a comma-separated `namespace:value` string in the
fixed namespace order (provider, topic, geo, cadence). The downstream
mart_meta_sources model splits it back into a Postgres text[] for
PostgREST `?tags=cs.{...}` filtering — see PLAN-007 phase 3.

Usage:
    cd atlas-data/dbt
    uv run python scripts/build_sources_seed.py

Defaults assume the canonical layout (sources at ../ingest/src/sources,
seed at seeds/sources/_sources_manifest.csv); override via --sources-dir
and --out for tests.

See the PLAN for the full design rationale:
website/docs/ai-developer/plans/active/PLAN-007-data-display-open-by-default.md
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


REQUIRED_FIELDS: tuple[str, ...] = (
    "source_id",
    "upstream_id",
    "upstream_url",
    "upstream_title",
    "description",
    "publisher",
    "license",
    "license_url",
    "periodicity",
    "eu_theme",
    "attribution",
)

DIMENSION_FIELDS: tuple[str, ...] = (
    "source_id",
    "code",
    "meaning",
    "value_format",
    "notes",
)

REQUIRED_DIMENSION_KEYS: tuple[str, ...] = ("code", "meaning")

REQUIRED_TAG_NAMESPACES: tuple[str, ...] = (
    "provider",
    "topic",
    "geo",
    "cadence",
)

# EU Data Theme codes (EU Publications Office controlled vocabulary).
# Validated against the eu_data_theme.csv seed; manifests with an unknown
# code fail the gate. See INVESTIGATE-felles-datakatalog-classification.md.
EU_DATA_THEME_CODES: frozenset[str] = frozenset({
    "AGRI", "ECON", "EDUC", "ENER", "ENVI", "GOVE", "HEAL",
    "INTR", "JUST", "REGI", "SOCI", "TECH", "TRAN",
})

CSV_FIELDS: tuple[str, ...] = REQUIRED_FIELDS + ("tags",)


@dataclass(frozen=True)
class ValidationError:
    path: Path
    message: str

    def __str__(self) -> str:
        return f"{self.path}: {self.message}"


def _is_todo(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    s = value.strip()
    return s == "" or s == "TODO" or s.startswith("TODO ")


def validate(manifest: dict[str, Any], path: Path) -> list[ValidationError]:
    errors: list[ValidationError] = []
    for field in REQUIRED_FIELDS:
        if _is_todo(manifest.get(field)):
            errors.append(ValidationError(path, f"missing or TODO field '{field}'"))
    tags = manifest.get("tags")
    if not isinstance(tags, dict):
        errors.append(ValidationError(path, "'tags' must be a YAML mapping"))
    else:
        for ns in REQUIRED_TAG_NAMESPACES:
            if _is_todo(tags.get(ns)):
                errors.append(ValidationError(path, f"missing or TODO tag '{ns}'"))
    eu_theme = manifest.get("eu_theme")
    if isinstance(eu_theme, str) and eu_theme.strip() and eu_theme.strip() not in EU_DATA_THEME_CODES:
        errors.append(ValidationError(
            path,
            f"unknown eu_theme '{eu_theme.strip()}' — expected one of {sorted(EU_DATA_THEME_CODES)}",
        ))
    dims = manifest.get("dimensions")
    if not isinstance(dims, list) or len(dims) == 0:
        errors.append(ValidationError(path, "'dimensions' must be a non-empty list"))
    else:
        for i, dim in enumerate(dims):
            if not isinstance(dim, dict):
                errors.append(ValidationError(path, f"dimensions[{i}] must be a mapping"))
                continue
            for key in REQUIRED_DIMENSION_KEYS:
                if _is_todo(dim.get(key)):
                    errors.append(ValidationError(
                        path, f"dimensions[{i}] missing or TODO '{key}'"
                    ))
    return errors


def render_tags(tags: dict[str, str]) -> str:
    return ",".join(f"{ns}:{tags[ns]}" for ns in REQUIRED_TAG_NAMESPACES)


def normalise_value(value: Any) -> str:
    """Collapse multiline YAML scalars to single-line CSV cells.

    YAML block scalars (`|`) preserve newlines; CSV consumers (dbt seed
    loader, PostgREST clients) prefer single-line strings. dbt seed cells
    can hold multiline values when quoted, but the indirection isn't worth
    the parsing fragility downstream.
    """
    if value is None:
        return ""
    text = str(value).strip()
    return " ".join(text.split())


def load_manifests(sources_dir: Path) -> tuple[list[tuple[Path, dict[str, Any]]], list[ValidationError]]:
    manifests: list[tuple[Path, dict[str, Any]]] = []
    errors: list[ValidationError] = []
    for manifest_path in sorted(sources_dir.glob("*/manifest.yml")):
        try:
            with manifest_path.open() as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            errors.append(ValidationError(manifest_path, f"YAML parse error: {exc}"))
            continue
        if not isinstance(data, dict):
            errors.append(ValidationError(manifest_path, "manifest is not a YAML mapping"))
            continue
        errors.extend(validate(data, manifest_path))
        manifests.append((manifest_path, data))
    return manifests, errors


def emit_csv(manifests: list[tuple[Path, dict[str, Any]]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for _, manifest in manifests:
            row = {field: normalise_value(manifest.get(field)) for field in REQUIRED_FIELDS}
            row["tags"] = render_tags(manifest["tags"])
            writer.writerow(row)


def emit_dimensions_csv(manifests: list[tuple[Path, dict[str, Any]]], out_path: Path) -> int:
    """Emit one row per source × dimension. Returns total dimension count."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with out_path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=DIMENSION_FIELDS)
        writer.writeheader()
        for _, manifest in manifests:
            sid = manifest["source_id"]
            for dim in manifest.get("dimensions") or []:
                writer.writerow({
                    "source_id": sid,
                    "code": normalise_value(dim.get("code")),
                    "meaning": normalise_value(dim.get("meaning")),
                    "value_format": normalise_value(dim.get("value_format")),
                    "notes": normalise_value(dim.get("notes")),
                })
                total += 1
    return total


README_BEGIN = "<!-- BEGIN auto-generated source table — do not edit; run `uv run python atlas-data/dbt/scripts/build_sources_seed.py --readme atlas-data/ingest/src/sources/README.md` -->"
README_END = "<!-- END auto-generated source table -->"


def render_readme_table(manifests: list[tuple[Path, dict[str, Any]]]) -> str:
    lines = [
        "| Source | Provider | What it is | Topic | EU theme | Geo | Cadence |",
        "|---|---|---|---|---|---|---|",
    ]
    for _, manifest in manifests:
        sid = manifest["source_id"]
        tags = manifest["tags"]
        desc = normalise_value(manifest.get("description"))
        eu_theme = normalise_value(manifest.get("eu_theme"))
        # Cap description length so the table stays readable. Per-source
        # README is the place for full prose.
        if len(desc) > 140:
            desc = desc[:137].rstrip() + "…"
        lines.append(
            f"| [{sid}](./{sid}/) "
            f"| {tags['provider']} "
            f"| {desc} "
            f"| {tags['topic']} "
            f"| {eu_theme} "
            f"| {tags['geo']} "
            f"| {tags['cadence']} |"
        )
    return "\n".join(lines)


def update_readme(readme_path: Path, manifests: list[tuple[Path, dict[str, Any]]]) -> bool:
    """Replace the table between BEGIN/END markers in `readme_path`.

    Returns True if the file was modified, False if it was already up to date.
    Raises if the markers are missing.
    """
    if not readme_path.exists():
        raise FileNotFoundError(f"{readme_path} does not exist")
    text = readme_path.read_text()
    if README_BEGIN not in text or README_END not in text:
        raise ValueError(
            f"{readme_path}: missing BEGIN/END markers. Add\n"
            f"  {README_BEGIN}\n  ...\n  {README_END}\n"
            "around the auto-generated table region."
        )
    before, _, rest = text.partition(README_BEGIN)
    _, _, after = rest.partition(README_END)
    new_block = f"{README_BEGIN}\n{render_readme_table(manifests)}\n{README_END}"
    new_text = f"{before}{new_block}{after}"
    if new_text == text:
        return False
    readme_path.write_text(new_text)
    return True


DEFAULT_SOURCES_DIR = Path(__file__).resolve().parents[2] / "ingest" / "src" / "sources"
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "seeds" / "sources" / "_sources_manifest.csv"
DEFAULT_DIMENSIONS_OUT = Path(__file__).resolve().parents[1] / "seeds" / "sources" / "_sources_dimensions.csv"
DEFAULT_README = Path(__file__).resolve().parents[2] / "ingest" / "src" / "sources" / "README.md"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan manifest.yml files and emit the marts._sources_manifest seed."
    )
    parser.add_argument(
        "--sources-dir",
        type=Path,
        default=DEFAULT_SOURCES_DIR,
        help=f"Path to ingest sources directory (default: {DEFAULT_SOURCES_DIR})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Path to seed CSV (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--dimensions-out",
        type=Path,
        default=DEFAULT_DIMENSIONS_OUT,
        help=f"Path to dimensions seed CSV (default: {DEFAULT_DIMENSIONS_OUT})",
    )
    parser.add_argument(
        "--readme",
        type=Path,
        nargs="?",
        const=DEFAULT_README,
        default=None,
        help=(
            "Also update the markdown table in the given README.md "
            f"between BEGIN/END markers (default if flag is bare: {DEFAULT_README})"
        ),
    )
    parser.add_argument(
        "--no-csv",
        action="store_true",
        help="Skip CSV emission (useful with --readme to update only the README)",
    )
    args = parser.parse_args()

    sources_dir: Path = args.sources_dir
    if not sources_dir.is_dir():
        print(f"Not a directory: {sources_dir}", file=sys.stderr)
        return 2

    manifests, errors = load_manifests(sources_dir)

    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        print(
            f"\n{len(errors)} validation error(s) across {len(manifests)} manifest(s); "
            "seed not emitted",
            file=sys.stderr,
        )
        return 1

    if not manifests:
        print(f"No manifest.yml files found under {sources_dir}", file=sys.stderr)
        return 1

    if not args.no_csv:
        emit_csv(manifests, args.out)
        print(f"emitted {len(manifests)} rows → {args.out}", file=sys.stderr)
        dim_count = emit_dimensions_csv(manifests, args.dimensions_out)
        print(f"emitted {dim_count} dimension rows → {args.dimensions_out}", file=sys.stderr)

    if args.readme is not None:
        try:
            changed = update_readme(args.readme, manifests)
        except (FileNotFoundError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        verb = "updated" if changed else "unchanged"
        print(f"{verb} markdown table in {args.readme}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
