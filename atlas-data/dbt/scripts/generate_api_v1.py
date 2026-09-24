"""
generate_api_v1.py — emit the api_v1.* wrapper schema from dbt's manifest.

Reads target/manifest.json (produced by `dbt parse`), filters to models under
models/marts/api/, and writes one SQL migration that creates a view per model
in api_v1.<name without mart_ prefix>, with column COMMENT ON COLUMN
statements sourced from each model's schema.yml descriptions.

Output is idempotent — re-applying the migration is a no-op. New runs of this
generator overwrite the same file; the migration runner re-applies on every
`npm run migrate` (state-less by design — see atlas-data/ingest/scripts/migrate.ts).

Tracks the previous-generation view list in a state JSON file. When a model
disappears from models/marts/api/, the next generation emits
DROP VIEW IF EXISTS for it before the recreates — see PLAN-004 [Q17].

Usage:
    python generate_api_v1.py \\
        --manifest target/manifest.json \\
        --models-dir-prefix models/marts/api/ \\
        --state api_v1_state.json \\
        --out ../migrations/070_api_v1_generated.sql

See the PLAN for the full design rationale:
website/docs/ai-developer/plans/active/PLAN-004-postgrest-api-v1-wrapper.md
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path


# --- The shape of the data we extract from manifest.json -------------------


@dataclass(frozen=True)
class WrapperColumn:
    name: str
    description: str  # may be empty string


@dataclass(frozen=True)
class WrapperView:
    """One api_v1.<view_name> wrapper. The underlying is marts.<source_relation>."""

    view_name: str  # e.g. "indicator_summary"
    source_schema: str  # e.g. "marts"
    source_relation: str  # e.g. "mart_indicator_summary"
    columns: tuple[WrapperColumn, ...]
    # The model's own description, emitted as COMMENT ON VIEW.
    #
    # This is how a published view carries its own documentation to consumers:
    # PostgREST surfaces relation comments in its OpenAPI output, so an external
    # caller reading /rest/v1/ sees it without knowing meta_sources exists.
    #
    # 🔴 That matters legally, not only ergonomically. NLOD 2.0 requires
    # attribution to accompany redistributed data, and a consumer querying
    # api_v1.brreg_enhet has no reason to go and look up a separate catalogue
    # row. Putting the attribution in the view comment costs nothing per row —
    # unlike a repeated column across 1.17M records — and travels with the
    # endpoint.
    description: str = ""


# --- Manifest extraction ---------------------------------------------------


# 🔴 THE ROOT DOCUMENT. PostgREST surfaces this as the OpenAPI
# `info.description` — the first thing a consumer reads, and until 2026-09-21
# it named no relation at all.
#
# ⚠️ IT IS EMITTED HERE, NOT IN migrations/050, SO IT ACTUALLY LANDS. The
# migration runs once at install; this file is re-applied on every deploy. A
# pointer added only to the migration would be correct and invisible on every
# database that already exists.
#
# 🔴 WHY IT IS AN INDEX AND NOT A PARAGRAPH. ops-dev reported that nothing
# anywhere pointed at `meta_dimensions`, which had carried the answer to a
# question that cost a consumer a wrong year on a front page. Measuring it
# found meta_dimensions was not special: 8 of 19 relations were referenced
# from nowhere — not the root, not another relation's description. Naming
# them all costs one string; finding them cost a day (urb-agents #1335).
#
# check-root-document-indexes-every-relation.sh fails when a relation is
# added and not named here.
# 🔴 LINE 1 IS THE TITLE, THE REST IS THE DESCRIPTION. PostgREST splits the
# schema comment: the first line becomes OpenAPI `info.title`, and everything
# after the BLANK SEPARATOR LINE becomes `info.description` — both newlines
# are consumed, not one.
#
# 🔵 Measured 2026-09-21 against the served spec: comment 2413 chars, title
# 54, description 2357. I predicted 2358 by subtracting the title and a
# single newline. One character, and it is the difference between knowing
# the rule and approximating it.
#
# ⚠️ THAT IS WHY THE SERVED SPEC SHOWED `info.description: 0 characters` on
# 2026-09-21. migrations/050's comment is a SINGLE LINE, so all of it became
# the title and the description was empty. ops-dev could not tell that apart
# from "no comment set" from outside the database, and it is the reason this
# text now opens with a short title line and a blank line — otherwise the
# index of all 19 relations below would land inside `info.title`, correct and
# invisible, which is the failure this whole change exists to avoid
# (urb-agents #1335, #1328).
#
# 🔵 Inferred, not observed: I cannot reach a PostgREST from here. The
# measurement that confirms it is `info.title` on the served spec — if it
# holds the long 050 sentence rather than "PostgREST API", the comment was
# set all along and only the split was wrong.
# 🔴 THE PUBLIC SITE URL IS READ FROM website/hosts.mjs, NEVER TYPED HERE.
# Terje, urb-agents #1418: "there must be some info when you access the API
# about where you can find the good documentation." There was not — measured
# on the live spec, info.description contained ZERO occurrences of the site
# host and no URL of any kind, and the only externalDocs link PostgREST emits
# points at postgrest.org, which is the framework's default rather than
# anyone's choice.
#
# ⚠️ AND THIS IS THE LAST PLACE A WRONG HOSTNAME WOULD BE NOTICED. CLAUDE.md
# asserted a dead API host for four months and three agents worked from it
# (atlas#420). A schema COMMENT is worse: it is published to every consumer
# and nothing renders it where a maintainer looks. hosts.mjs is the one file
# kept true, so this reads it and FAILS LOUDLY rather than falling back —
# a silent default is how the last one survived.
def _public_site_url() -> str:
    """ATLAS_SITE_BASE_URL out of website/hosts.mjs. Raises if absent."""
    hosts = Path(__file__).resolve().parents[3] / "website" / "hosts.mjs"
    if not hosts.is_file():
        raise SystemExit(f"cannot find {hosts} — the site URL must come from hosts.mjs, not a literal")
    m = re.search(r"ATLAS_SITE_BASE_URL\s*=\s*(?:[^;]*?\|\|\s*)?['\"]([^'\"]+)['\"]",
                  hosts.read_text())
    if not m:
        raise SystemExit(f"ATLAS_SITE_BASE_URL not parseable from {hosts}")
    return m.group(1).rstrip("/")


SCHEMA_COMMENT_TEMPLATE = """Atlas — open semantic layer over Norwegian public data

DOCUMENTATION — the full guide to this API, its datasets, licences and
provenance. Start here if you are new:
  {site}
  {site}/api   this same document, browsable, with worked examples

⚠️ `info.version` IN THIS DOCUMENT IS POSTGREST'S VERSION, NOT ATLAS'S. It
reads 14.10 because PostgREST generates this spec and reports itself; Atlas
cannot set it and there is no Atlas version in here at all. A client that reads
`info.version` and believes it has the API's version is wrong — which is worse
than the field being absent, so it is written down here rather than left to be
discovered. `info.contact` and `info.license` are absent for the same reason:
PostgREST derives only the title and this description from the schema comment.
Licence and attribution are per-source and live in `meta_sources`.

Curated wrapper views over Norwegian public data and NGO supply data, served
by PostgREST. Values are republished as the upstream publishes them.

THE CATALOGUE:
  atlas_inventory   what Atlas publishes: per endpoint, how many records it
                    serves, when its data last arrived and last SUCCEEDED
                    (different columns), how many ingest attempts, and whether
                    the rows came from an ingest, a seed or the catalogue.
  meta_endpoints    every relation below, with tags. The index.
  meta_sources      one row per ingested source: licence, publisher,
                    coverage, freshness, downstream model count.
  meta_dimensions   one row per source x upstream dimension: what that coded
                    column MEANS and its value format. Read it before
                    interpreting a code, and before deriving a fact about a
                    dimension from prose.

INDICATORS — municipal figures from SSB, FHI and Bufdir:
  indicator_summary            one row per (source, measure): latest year,
                               coverage, value range.
  indicator_latest_values      per-kommune values at the latest year.
  indicator_missing_kommuner   which kommuner an indicator does NOT cover.
  coverage_gap_barnefattigdom  the same question for child poverty.
  unattributed_totals          the remainder belonging to no kommune, so
                               totals reconcile.
  kommune_befolkning_alder     population by age band and sex.
  bufdir_indicator_alias       Bufdir indicator naming.

SUPPLY — voluntary-sector presence:
  ngo_index, ngo_overview      organisations and their summary.
  activity_catalog             what each organisation does.
  kommune_ngo_summary          per-kommune rollup.
  kommune_ngo_totals           national totals; reconcile these against
                               unattributed_totals.
  distrikt_summary             chapters by district.
  kommune_local_chapters       chapters resolved to a kommune.

REFERENCE:
  dim_kommune                  the municipality dimension. Keeps SSB's 9999
                               'Uoppgitt' because Klass 131 publishes it; the
                               analytical relations exclude it.
  brreg_enhet                  the Bronnoysund register mirror.

TIME IS THE DIMENSION MOST OFTEN MISREAD. A year here can be the FIRST year
of a multi-year window. indicator_summary.latest_year pairs with
latest_year_window_years, and indicator_latest_values.year with window_years;
the span is year .. year + window_years - 1. meta_dimensions carries the
upstream's own words for the same fact.

FORMATS. Every relation answers JSON by default and CSV on request, via the
Accept header:

  curl -H "Accept: text/csv" <base>/indicator_latest_values
  curl -H "Accept: application/vnd.pgrst.object+json" <base>/dim_kommune?kommune_nr=eq.0301

CSV opens directly in Excel. Add ?limit=100 while exploring; an unfiltered
relation can be large. Row counts come back in the Content-Range response
header when you send Prefer: count=exact.

DID YOU GET EVERYTHING? Compare that Content-Range total against the number of
rows you received — not against your own ?limit. A server-side row cap applies
BELOW your limit, so a cap of 1000 against limit=20000 returns 1000 rows and a
comparison with your own limit still passes. Atlas has no cap set today; this
check keeps you correct if that changes, and no client can read the setting
from outside. brreg_enhet carries the cost caveat: on that relation a
count=exact over a predicate that cannot use an index scans 1.17 million rows.
Do not substitute count=planned to make it cheap — it is a planner estimate
whose error is unbounded in both directions. Measured: 118 for a pattern
matching nothing, and 1176875 against an actual 1175169 unfiltered, i.e. MORE
rows than exist, which would raise a false truncation alarm on a complete
answer."""

SCHEMA_COMMENT = SCHEMA_COMMENT_TEMPLATE.format(site=_public_site_url())


def _sql_string(text):
    """A Postgres string literal. One place that doubles apostrophes."""
    return "'" + text.replace("'", "''") + "'"


def _strip_mart_prefix(name: str) -> str:
    """Drop the leading 'mart_' so api_v1 names are unprefixed (PLAN-004 [Q2])."""
    return name[len("mart_") :] if name.startswith("mart_") else name


def extract_wrappers(
    manifest: dict, models_dir_prefix: str = "models/marts/api/"
) -> list[WrapperView]:
    """Walk manifest.json; return one WrapperView per dbt model under api/."""
    wrappers: list[WrapperView] = []
    for node in manifest.get("nodes", {}).values():
        if node.get("resource_type") != "model":
            continue
        if not node.get("original_file_path", "").startswith(models_dir_prefix):
            continue
        cols = tuple(
            WrapperColumn(name=c["name"], description=(c.get("description") or "").strip())
            for c in node["columns"].values()
        )
        wrappers.append(
            WrapperView(
                view_name=_strip_mart_prefix(node["name"]),
                source_schema=node["schema"],
                source_relation=node.get("alias") or node["name"],
                columns=cols,
                description=(node.get("description") or "").strip(),
            )
        )
    wrappers.sort(key=lambda w: w.view_name)
    return wrappers


# --- SQL emission ----------------------------------------------------------


def _quote_literal(s: str) -> str:
    """Postgres single-quoted string with embedded ' doubled."""
    return "'" + s.replace("'", "''") + "'"


def _wrap_for_sql_comment(s: str) -> str:
    """Single-line for SQL header comments; collapse newlines."""
    return s.replace("\n", " ").replace("\r", "").strip()


def render_sql(wrappers: list[WrapperView], removed_views: list[str]) -> str:
    """Build the migration SQL body. Deterministic; safe to diff."""
    out: list[str] = [
        "-- atlas-data/dbt/api_v1_generated.sql",
        "-- AUTO-GENERATED by atlas-data/dbt/scripts/generate_api_v1.py — do not hand-edit.",
        "-- Re-running ./regenerate-api-v1.sh after a dbt-model change is the source of truth.",
        "--",
        "-- Apply via ./apply-api-v1.sh AFTER `dbt run` — the wrappers reference",
        "-- marts.mart_* tables which only exist after dbt has built them.",
        "-- All statements are idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).",
        "--",
        "-- For design rationale see:",
        "--   website/docs/ai-developer/plans/active/PLAN-004-postgrest-api-v1-wrapper.md",
        "--",
        "-- ROLLBACK: undeploy + purge UIS first (./uis undeploy postgrest --app atlas",
        "-- + ./uis configure postgrest --app atlas --purge), then DROP SCHEMA api_v1 CASCADE.",
        "",
        "CREATE SCHEMA IF NOT EXISTS api_v1;",
        "",
        "COMMENT ON SCHEMA api_v1 IS",
        "  " + _sql_string(SCHEMA_COMMENT) + ";",
        "",
    ]

    if removed_views:
        out.append("-- Views removed since the previous generation (PLAN-004 [Q17])")
        for v in removed_views:
            out.append(f"DROP VIEW IF EXISTS api_v1.{v} CASCADE;")
        out.append("")

    for w in wrappers:
        fq_source = f"{w.source_schema}.{w.source_relation}"
        out.append(f"-- {w.view_name}  ←  {fq_source}")
        out.append(
            f"CREATE OR REPLACE VIEW api_v1.{w.view_name} AS SELECT * FROM {fq_source};"
        )
        if w.description:
            out.append(
                f"COMMENT ON VIEW api_v1.{w.view_name} IS "
                f"{_quote_literal(w.description)};"
            )
        for c in w.columns:
            if c.description:
                out.append(
                    f"COMMENT ON COLUMN api_v1.{w.view_name}.{c.name} IS "
                    f"{_quote_literal(c.description)};"
                )
        out.append("")

    # 🔴 THIS GRANT IS SELECT-ONLY AND THE OpenAPI DOCUMENT WILL CONTRADICT IT.
    # DO NOT TRY TO FIX THAT HERE, AND ESPECIALLY NOT WITH openapi-mode.
    #
    # PostgREST advertises post/patch/delete on 15 of the 17 api_v1 relations.
    # Every one is refused by Postgres — 42501, probed live by ops-dev on
    # 2026-09-20 (urb-agents #1284). Nothing is exposed; the document is wrong.
    #
    # The dead ends, so nobody re-walks them (tor-agent, #1296):
    #
    #   openapi-mode = follow-privileges   Not configured ANYWHERE, so the
    #                                      upstream default applies and setting
    #                                      it explicitly is a no-op.
    #
    #                                      ⚠️ Provenance, because it was
    #                                      overstated once (#1303). MEASURED
    #                                      unset in four places: the pod spec
    #                                      env, the process at pid 1,
    #                                      pg_roles.rolconfig and
    #                                      pg_db_role_setting — PostgREST reads
    #                                      configuration from the database as
    #                                      well as the environment, and the
    #                                      first report checked only the
    #                                      environment. INFERRED, and still
    #                                      inferred: that unset means
    #                                      follow-privileges. No PostgREST
    #                                      endpoint reports the effective
    #                                      setting — the admin server exposes
    #                                      /live, /ready and /metrics, not
    #                                      /config — so nobody can close that
    #                                      last link from outside.
    #   openapi-mode = ignore-privileges   ⚠️ The only value that changes
    #                                      anything, and it advertises every
    #                                      method REGARDLESS of grants by
    #                                      design. It would make the defect
    #                                      permanent while looking like a fix.
    #   a stale privilege cache            Falsified. publish_api_v1 ends with
    #                                      NOTIFY pgrst, 'reload schema'; the
    #                                      10:07 run on 2026-09-20 provably
    #                                      reloaded (new comment text went live)
    #                                      and the method counts were unchanged.
    #   adding REVOKE statements here      Revoking what was never granted is a
    #                                      no-op on both the grant and the spec.
    #
    # ✅ It is structural: PostgREST v14.10 advertises writes for any
    # AUTO-UPDATABLE view, independently of who may write it. The only two
    # relations that do not advertise are kommune_ngo_summary and
    # kommune_ngo_totals — the only two that GROUP BY. Same structural line that
    # decides whether count=estimated is accurate.
    #
    # 🔵 So documentation is the layer, permanently, not as a stopgap. I called
    # it "the wrong layer, pending a platform fix"; there is no platform fix
    # short of an upstream PostgREST change. An external consumer had already
    # encoded the advertisement as a structural fact — it derived
    # table-versus-view from the write verbs and mislabelled 15 relations since
    # its first commit — which is why this is worth a comment and not a shrug.
    #
    # Guarded grants. UIS's ./uis configure postgrest creates atlas_web_anon
    # (per their INVESTIGATE-postgrest.md) but isn't yet implemented. The DO
    # block lets this migration apply both before and after UIS runs configure
    # — see PLAN-004 [Q11/Q12](ii).
    #
    # ⚠️ DO NOT delete these as "duplicating what ./uis configure already does".
    # They look redundant and are not.
    #
    # `ALTER DEFAULT PRIVILEGES` applies only to objects created by the role that
    # SET it. UIS's configure runs as `postgres`, so its default ACL reads
    # `atlas_web_anon=r/postgres` and covers objects postgres creates. The api_v1
    # views are created by the `atlas` role, by this SQL — so the platform's
    # default privileges do not reach them.
    #
    # This block is therefore the thing that keeps the public API working across a
    # refresh: every `dbt run` drops the api_v1 views via CASCADE, the api_v1 asset
    # re-creates them as `atlas`, and it is the ALTER DEFAULT PRIVILEGES below —
    # owned by `atlas` — that makes the new views readable by the anon role.
    # Remove it and the API goes dark after the next transform, silently, with the
    # views present and empty of permission rather than of rows.
    #
    # Verified locally 2026-08-25: a view created as `atlas` in api_v1 is readable
    # by atlas_web_anon, and pg_default_acl shows `atlas ... {atlas_web_anon=r/atlas}`
    # — set by this block, not by the platform.
    out.extend(
        [
            "-- Grant SELECT to the per-app anon role if it exists (created by UIS's",
            "-- ./uis configure postgrest --app atlas). Guarded so this migration",
            "-- applies cleanly against environments where UIS hasn't run configure yet.",
            "DO $$ BEGIN",
            "  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_web_anon') THEN",
            "    GRANT USAGE ON SCHEMA api_v1 TO atlas_web_anon;",
            "    GRANT SELECT ON ALL TABLES IN SCHEMA api_v1 TO atlas_web_anon;",
            "    ALTER DEFAULT PRIVILEGES IN SCHEMA api_v1",
            "      GRANT SELECT ON TABLES TO atlas_web_anon;",
            "  END IF;",
            "END $$;",
            "",
            "-- Tell PostgREST to reload its schema cache so newly-added or removed",
            "-- views surface immediately. No-op if no PostgREST is listening.",
            "NOTIFY pgrst, 'reload schema';",
            "",
        ]
    )
    return "\n".join(out)


def render_state(wrappers: list[WrapperView]) -> str:
    """The state file: just the list of view names, sorted, JSON-formatted."""
    payload = {
        "format_version": 1,
        "views": sorted(w.view_name for w in wrappers),
    }
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


# --- CLI -------------------------------------------------------------------


def _read_state(path: Path) -> list[str]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return list(data.get("views", []))


def render_relations_seed(manifest: dict, wrappers: "list[WrapperView]") -> str:
    """CSV of every api_v1 relation, for models that need to know what is served.

    🔴 WHY A GENERATED SEED. `meta_sources.downstream_model_count` answered
    "how many models" when consumers needed "can I reach this", and four
    parties each built a different partial proxy for the real question — the
    CI gate, that field, a consumer's hand-kept list, and an ops-dev summary.
    Three of the four were wrong on 2026-09-21 and one of them reached a
    consumer as "the eight FHI sources served" when it was seven
    (urb-agents #1344).

    ⚠️ The gate got it right by reading THIS file's output. A dbt model cannot
    read api_v1_generated.sql, so the same answer is emitted as a seed and
    both derive from one place. check-api-v1.sh already fails when the
    generated artefacts drift from the models, so the seed cannot go stale
    without CI noticing.

    `derives_from_fact` is transitive, not direct: indicator_summary reaches
    fact_kommune_indicators through its own parents.
    """
    nodes = manifest.get("nodes", {})
    fact_ids = {k for k, n in nodes.items()
                if n.get("name") == "fact_kommune_indicators"}

    def reaches_fact(uid, seen=None):
        seen = seen or set()
        if uid in seen:
            return False
        seen.add(uid)
        deps = nodes.get(uid, {}).get("depends_on", {}).get("nodes", [])
        return any(d in fact_ids or reaches_fact(d, seen) for d in deps)

    by_name = {n["name"]: uid for uid, n in nodes.items()
               if n.get("resource_type") == "model"}
    rows = ["relation_name,mart_name,derives_from_fact"]
    for w in wrappers:
        mart = w.source_relation
        uid = by_name.get(mart)
        rows.append(f"{w.view_name},{mart},"
                    f"{'true' if uid and reaches_fact(uid) else 'false'}")
    return "\n".join(rows) + "\n"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", required=True, type=Path, help="Path to target/manifest.json")
    p.add_argument(
        "--models-dir-prefix",
        default="models/marts/api/",
        help='Filter manifest models by original_file_path prefix (default "models/marts/api/")',
    )
    p.add_argument(
        "--state",
        required=True,
        type=Path,
        help="Path to api_v1_state.json (read previous, write new)",
    )
    p.add_argument("--out", required=True, type=Path, help="Output SQL migration path")
    p.add_argument(
        "--relations-seed",
        type=Path,
        help="Optional: write the api_v1 relation list as a dbt seed CSV",
    )
    args = p.parse_args()

    manifest = json.loads(args.manifest.read_text())
    wrappers = extract_wrappers(manifest, args.models_dir_prefix)

    prev_views = set(_read_state(args.state))
    current_views = {w.view_name for w in wrappers}
    removed = sorted(prev_views - current_views)

    sql = render_sql(wrappers, removed)
    state = render_state(wrappers)

    args.out.write_text(sql)
    args.state.write_text(state)
    if args.relations_seed:
        args.relations_seed.write_text(render_relations_seed(manifest, wrappers))
    print(
        f"wrote {args.out} ({len(wrappers)} wrappers, "
        f"{len(removed)} removed) and {args.state}"
    )


if __name__ == "__main__":
    main()
