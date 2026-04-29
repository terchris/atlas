"""Pytest fixtures for the api_v1 generator.

The fixtures use synthetic, hand-built dbt manifests — small enough to assert
on the rendered SQL output directly. The validation gates in PLAN-004 Phase 3
catch problems against the real project; these unit tests catch generator
bugs that produce syntactically valid but semantically wrong SQL.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_api_v1 import (  # noqa: E402
    WrapperColumn,
    WrapperView,
    extract_wrappers,
    render_sql,
    render_state,
)


# --- Synthetic manifests ---------------------------------------------------


def _model_node(
    name: str,
    *,
    schema: str = "marts",
    path: str = "models/marts/api/",
    columns: list[tuple[str, str]] | None = None,
) -> dict:
    """Build a manifest 'node' entry for a model. Just the fields the generator reads."""
    return {
        "resource_type": "model",
        "name": name,
        "alias": name,
        "schema": schema,
        "database": "test_db",
        "original_file_path": f"{path}{name}.sql",
        "columns": {
            col_name: {"name": col_name, "description": col_desc, "data_type": None}
            for col_name, col_desc in (columns or [])
        },
    }


def _manifest(*nodes: dict) -> dict:
    return {"nodes": {f"model.atlas.{n['name']}": n for n in nodes}}


# --- extract_wrappers ------------------------------------------------------


def test_extract_drops_mart_prefix():
    m = _manifest(_model_node("mart_indicator_summary", columns=[("col1", "first")]))
    out = extract_wrappers(m)
    assert len(out) == 1
    assert out[0].view_name == "indicator_summary"
    assert out[0].source_relation == "mart_indicator_summary"


def test_extract_keeps_unprefixed_name():
    """Model not starting with mart_ keeps its full name."""
    m = _manifest(_model_node("kommune_lookup", columns=[("k", "")]))
    out = extract_wrappers(m)
    assert out[0].view_name == "kommune_lookup"


def test_extract_filters_by_path_prefix():
    """Models outside models/marts/api/ are not wrapped."""
    m = _manifest(
        _model_node("mart_X", path="models/marts/api/", columns=[("a", "")]),
        _model_node("dim_kommune", path="models/dimensions/", columns=[("b", "")]),
        _model_node("fact_Y", path="models/marts/", columns=[("c", "")]),
    )
    out = extract_wrappers(m)
    assert [w.view_name for w in out] == ["X"]


def test_extract_skips_non_models():
    """Tests, sources, seeds — anything that isn't resource_type=='model'."""
    m = {
        "nodes": {
            "model.atlas.mart_a": _model_node("mart_a", columns=[("a", "")]),
            "test.atlas.foo": {
                "resource_type": "test",
                "original_file_path": "models/marts/api/_test.yml",
            },
        }
    }
    out = extract_wrappers(m)
    assert [w.view_name for w in out] == ["a"]


def test_extract_sorts_alphabetically():
    """Stable diffs — output order is deterministic."""
    m = _manifest(
        _model_node("mart_zulu", columns=[("c", "")]),
        _model_node("mart_alpha", columns=[("c", "")]),
        _model_node("mart_mike", columns=[("c", "")]),
    )
    out = extract_wrappers(m)
    assert [w.view_name for w in out] == ["alpha", "mike", "zulu"]


# --- render_sql ------------------------------------------------------------


def _wrapper(name: str, *cols: tuple[str, str]) -> WrapperView:
    return WrapperView(
        view_name=name,
        source_schema="marts",
        source_relation=f"mart_{name}",
        columns=tuple(WrapperColumn(n, d) for n, d in cols),
    )


def test_render_sql_happy_path():
    sql = render_sql(
        wrappers=[_wrapper("indicator_summary", ("year", "Calendar year."))],
        removed_views=[],
    )
    assert "CREATE SCHEMA IF NOT EXISTS api_v1;" in sql
    assert "CREATE OR REPLACE VIEW api_v1.indicator_summary AS SELECT * FROM marts.mart_indicator_summary;" in sql
    assert "COMMENT ON COLUMN api_v1.indicator_summary.year IS 'Calendar year.';" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql
    assert "DO $$ BEGIN" in sql  # guarded grant block


def test_render_sql_empty_models():
    sql = render_sql(wrappers=[], removed_views=[])
    assert "CREATE SCHEMA IF NOT EXISTS api_v1;" in sql
    assert "CREATE OR REPLACE VIEW" not in sql
    assert "DO $$ BEGIN" in sql  # grant block still emitted; harmless if no tables


def test_render_sql_drops_removed_views():
    sql = render_sql(
        wrappers=[_wrapper("kept", ("c", "x"))],
        removed_views=["gone_a", "gone_b"],
    )
    assert "DROP VIEW IF EXISTS api_v1.gone_a CASCADE;" in sql
    assert "DROP VIEW IF EXISTS api_v1.gone_b CASCADE;" in sql
    # Drops emitted before the recreates
    drop_pos = sql.index("DROP VIEW IF EXISTS api_v1.gone_a")
    create_pos = sql.index("CREATE OR REPLACE VIEW api_v1.kept")
    assert drop_pos < create_pos


def test_render_sql_skips_empty_descriptions():
    """Columns without descriptions don't get a COMMENT line."""
    sql = render_sql(
        wrappers=[_wrapper("v", ("a", "described"), ("b", ""))],
        removed_views=[],
    )
    assert "COMMENT ON COLUMN api_v1.v.a" in sql
    assert "COMMENT ON COLUMN api_v1.v.b" not in sql


def test_render_sql_escapes_apostrophes():
    """Postgres single-quoted strings — embedded ' must double."""
    sql = render_sql(
        wrappers=[_wrapper("v", ("c", "It's a kommune's identifier"))],
        removed_views=[],
    )
    assert "IS 'It''s a kommune''s identifier';" in sql


def test_render_sql_idempotent_for_same_input():
    """Two runs over the same input produce byte-identical SQL."""
    wrappers = [_wrapper("a", ("c1", "x")), _wrapper("b", ("c1", "y"))]
    a = render_sql(wrappers, [])
    b = render_sql(wrappers, [])
    assert a == b


def test_render_sql_grant_block_uses_guarded_pattern():
    """[Q11/Q12](ii) — guarded grant survives missing role."""
    sql = render_sql(wrappers=[_wrapper("v", ("c", "x"))], removed_views=[])
    assert "IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_web_anon')" in sql
    assert "ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1" in sql


# --- render_state ----------------------------------------------------------


def test_render_state_lists_view_names_sorted():
    state = render_state([_wrapper("zulu", ("c", "")), _wrapper("alpha", ("c", ""))])
    payload = json.loads(state)
    assert payload["views"] == ["alpha", "zulu"]
    assert payload["format_version"] == 1


def test_render_state_empty():
    state = render_state([])
    payload = json.loads(state)
    assert payload["views"] == []


# --- end-to-end: extract → render is consistent ----------------------------


def test_round_trip_synthetic_2_models():
    m = _manifest(
        _model_node(
            "mart_indicator_summary",
            columns=[("source_id", "source identifier"), ("year", "calendar year")],
        ),
        _model_node(
            "mart_ngo_index",
            columns=[("orgnr", "9-digit Brreg orgnr")],
        ),
    )
    wrappers = extract_wrappers(m)
    sql = render_sql(wrappers, [])
    state = render_state(wrappers)

    assert "api_v1.indicator_summary" in sql
    assert "api_v1.ngo_index" in sql
    assert "COMMENT ON COLUMN api_v1.indicator_summary.source_id IS 'source identifier';" in sql
    assert json.loads(state)["views"] == ["indicator_summary", "ngo_index"]
