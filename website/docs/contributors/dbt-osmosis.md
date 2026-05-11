# dbt-osmosis: schema.yml hygiene

Atlas uses [**dbt-osmosis**](https://github.com/z3z1ma/dbt-osmosis) to keep dbt `schema.yml` files in sync with the actual columns in the warehouse, and to propagate column descriptions across the dbt lineage automatically. This page explains *what* it does, *why* Atlas relies on it, and *what behaviour to expect* when you work with it.

For the related CI gate that fails a PR if any column lacks a description, see [check-osmosis.md](./check-osmosis.md).

---

## What dbt-osmosis is

dbt-osmosis is a small CLI that reads your dbt project's `manifest.json` and reconciles each `schema.yml` against the warehouse:

1. **Discovers columns** in built models / seeds / sources, and adds missing entries to `schema.yml` (so `schema.yml` stops drifting away from reality).
2. **Propagates descriptions across lineage**: write a `kommune_nr` description once on `dim_kommune`, and every downstream model with a `kommune_nr` column inherits the same description. Same for `value`, `source_id`, and any other column that flows through multiple models.
3. **Provides a dry-run + check mode** that exits non-zero if osmosis would change anything — perfect for CI.

Atlas runs it via `uv` (the Python env manager pinned in `atlas-data/dbt/`):

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt-osmosis yaml document            # propagate + write
uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run  # see what would change
uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run --check  # exits 1 if anything would change
```

Configured via `+dbt-osmosis: schema.yml` in [`dbt_project.yml`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/dbt_project.yml) — one `schema.yml` per directory (Atlas's existing layout).

---

## Why Atlas relies on it

### 1. Column descriptions become public OpenAPI documentation

Atlas's public HTTP API is **PostgREST against the `api_v1.*` schema** — auto-generated wrapper views over `marts.mart_*` (see [api-v1.md](./api-v1.md) for the wrapper layer; [INVESTIGATE-postgrest-api-v1-wrapper.md](../ai-developer/plans/completed/INVESTIGATE-postgrest-api-v1-wrapper.md) for the design rationale). PostgREST auto-generates a Swagger 2.0 spec from Postgres `COMMENT ON COLUMN ...` metadata. dbt writes those comments on `marts.*` from `schema.yml` descriptions on every `dbt run`; the api_v1 generator copies them onto the wrapper views. So:

> The text you write in `schema.yml` is the text an external developer reads when they hit `api.atlas.helpers.no/docs`.

This is why every column in every Atlas model must have a description — not just internal hygiene, but the public API contract.

### 2. Description propagation scales

Atlas has 30+ dbt models with significant column overlap (every kommune-level mart has `kommune_nr`, `kommune_name`, `fylke_name`, `year`, `updated_at`). Without propagation, you'd write the same description 30 times — and they'd drift. With osmosis:

- Write canonical descriptions on the upstream source (`dim_kommune`, `dim_fylke`, source declarations in `sources.yml`).
- Run `dbt-osmosis yaml document`.
- Every downstream model with the same column name inherits.

The OpenAPI spec stays consistent across endpoints because the descriptions come from one canonical place.

### 3. Free CI gate

`dbt-osmosis yaml document --dry-run --check` exits 1 if anything would change — meaning either a new column appeared in the warehouse that `schema.yml` doesn't know about, or a description didn't propagate where it should. Atlas's `check-osmosis.sh` wraps this for the strict-mode gate (see [check-osmosis.md](./check-osmosis.md)).

---

## What to expect when you use it

### Two-pass convergence

dbt-osmosis is not always idempotent on the first pass. On a project with many existing schema.yml files, `dbt-osmosis yaml document` may need **two consecutive runs** to fully converge — the first pass discovers and writes descriptions; the second pass propagates them deeper into the lineage and removes redundant placeholders. After two passes, `--dry-run --check` exits 0 and stays at 0.

This was first observed during PLAN-001 phase 1 (the initial baseline). If you see osmosis report "would write changes" after a fresh run, just run it again — that's normal.

### `data_type:` placeholders

When dbt-osmosis discovers a column in the warehouse that's not yet in `schema.yml`, it adds a bare entry like:

```yaml
- name: kommune_nr
  data_type: text
```

That `data_type:` line is **not** a description — it's a discovery placeholder. To document the column, replace it (or add alongside) with:

```yaml
- name: kommune_nr
  description: 4-digit zero-padded kommune code, SSB canonical form (e.g. '0301' = Oslo).
```

After the next `yaml document` run, osmosis often removes the standalone `data_type:` placeholder once a description is present, but not always — `check-osmosis.sh`'s lenient counter helps you spot lingering placeholders (the strict gate is what enforces *every column has a description*).

### Description propagation goes downstream only

Osmosis cascades descriptions from a parent model to its children, not sideways or upstream. So:

- Describe a column on `dim_kommune` → propagates to every fact/mart that joins it. ✓
- Describe a column on `fact_kommune_indicators` → propagates to every `mart_*` view that selects from it. ✓
- Describe a column on `indicators__ssb_08764` → does **not** propagate to `indicators__ssb_06913` (they're siblings, not parent/child). ✗

For columns that repeat across siblings (e.g. `contents_label` on every per-source indicator passthrough), describe them at the canonical source — usually in [`models/indicators/sources.yml`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/models/indicators/sources.yml) or on the corresponding `dim_*` table — and let propagation do the rest.

---

## Day-to-day workflow

```bash
cd atlas-data/dbt

# Add or change a column description in schema.yml — usually on a dim_ or fact_
$EDITOR models/dimensions/schema.yml

# Propagate descriptions and write to all schema.yml files
uv run --env-file ../ingest/.env dbt-osmosis yaml document

# Repeat once if anything changed (two-pass convergence)
uv run --env-file ../ingest/.env dbt-osmosis yaml document

# Verify everything is documented and stable
uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run --check
echo "exit=$?"   # should be 0

# Final gate: every column must have a description (repo-wide)
./check-osmosis.sh
```

---

## When you don't need to run osmosis

- **Description-only edits** (you change wording in `schema.yml` but don't add new columns) — `dbt parse` is sufficient. The strict gate in CI runs the same `--dry-run --check` so it catches anything you missed. **However, if the column lives in a `mart_*` model under `models/marts/api/`, also re-run `./regenerate-api-v1.sh`** so the description propagates into the public-API surface (per [api-v1.md](./api-v1.md)).
- **Code changes that don't touch dbt models** — no osmosis needed.
- **Frontend or ingest TypeScript changes** — no osmosis needed.

---

## Cross-references

- [check-osmosis.md](./check-osmosis.md) — the gate that enforces "every column documented" on `marts.*` (sibling of `check-api-v1.md` which covers `api_v1.*`)
- [api-v1.md](./api-v1.md) — the public-API wrapper layer; descriptions you write here propagate into `api_v1.*` via the generator and become the OpenAPI spec
- [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/README.md) — dbt project layout and command cheatsheet (kept in-source for while-coding reference)
- [PLAN-001](../ai-developer/plans/completed/PLAN-001-api-mart-views.md) — installed dbt-osmosis as part of the public API mart-view work
- [PLAN-002](../ai-developer/plans/completed/PLAN-002-fill-schema-yml-description-gaps.md) — closed the 180-column description backlog and tightened the gate to the whole project
- [PLAN-004](../ai-developer/plans/completed/PLAN-004-postgrest-api-v1-wrapper.md) — built the `api_v1` wrapper layer that consumes these descriptions
