# `check-osmosis.sh`: the schema.yml documentation gate

`atlas-data/dbt/check-osmosis.sh` is the CI gate that fails a PR if any column in any dbt model, seed, or source is missing a description. It wraps `dbt-osmosis` (see [dbt-osmosis.md](./dbt-osmosis.md)) and adds Atlas-specific reporting.

It covers `marts.*` schema.yml hygiene. The **sibling gate** [`check-api-v1.sh`](./api-v1.md#the-five-validation-gates) covers the `api_v1.*` wrapper layer's generator-output integrity (drift, coverage, static description coverage). Both gates must be green to merge a PR; they have non-overlapping scopes.

This page covers what `check-osmosis.sh` does, when it runs, what failure looks like, and how to fix it.

---

## What the gate enforces

Two checks, both run by default; either alone if you pass `--strict-only`:

### 1. Strict — every column described (repo-wide)

Runs `dbt-osmosis yaml document --dry-run --check` across the whole project. Exits **1** if any column in any `schema.yml` is missing a description, or if osmosis would otherwise need to write changes (two-pass convergence not yet complete, new column not yet documented, etc.).

This is the gate. **A new column without a description fails CI.** Originally scoped to `models/marts/api/` only ([PLAN-001](../ai-developer/plans/completed/PLAN-001-api-mart-views.md)); tightened to the whole project after [PLAN-002](../ai-developer/plans/completed/PLAN-002-fill-schema-yml-description-gaps.md) phase 6 closed the original 180-column backlog.

### 2. Lenient — heuristic backlog count

Prints a per-file count of bare `data_type:` lines (osmosis's discovery placeholders — see [dbt-osmosis.md § data_type placeholders](./dbt-osmosis.md#data_type-placeholders)). Should be 0 when every column is documented; >0 means a placeholder is still hanging around.

The lenient count is **advisory only** — the strict check is the gate. The lenient count can over-report (a column with both a description AND a `data_type:` line still gets counted, because the script just greps for `^        data_type:`), so it's a trend signal, not authoritative.

---

## When the gate runs

- **Locally** — run it manually before any commit that touches `models/` or `seeds/`:
  ```bash
  cd atlas-data/dbt
  ./check-osmosis.sh             # strict + lenient report
  ./check-osmosis.sh --strict-only  # CI-friendly, just the gate
  ```
- **In CI** — wired up as a required check on PRs that touch dbt files. (Current CI configuration: see [`.github/workflows/`](https://github.com/terchris/atlas/tree/main/.github/workflows) once it's added; the gate is currently enforced via local-discipline + reviewer culture.)

---

## What failure looks like

### Strict-mode failure

```
→ strict check: every column in every schema.yml must have a description
  ✗ project has missing descriptions
    Re-run without --check to see what would change:
    uv run --env-file ../ingest/.env dbt-osmosis yaml document --dry-run
exit 1
```

The exit-1 message tells you the next command to run. `--dry-run` (without `--check`) prints which file(s) would be modified and what columns are missing descriptions.

### Lenient-report drift

```
→ backlog report (heuristic — bare data_type: lines per schema.yml)

  models/dimensions/schema.yml                          1 columns

  TOTAL                                                 1 columns
```

A non-zero TOTAL points at the file where a placeholder lingers. Open the file, find the bare `data_type:` line, replace with a `description:`.

---

## How to fix a failure

### Case A — you added a new column

1. Open the relevant `schema.yml` (the `--dry-run` output names the file).
2. Add a `description:` block for the new column. See sibling columns for tone and length — Atlas conventions are short and concrete (1–3 sentences, mention the unit or canonical form when relevant).
3. Run `uv run --env-file ../ingest/.env dbt-osmosis yaml document` to propagate the description across the lineage.
4. Re-run a second time (osmosis is two-pass — see [dbt-osmosis.md § two-pass convergence](./dbt-osmosis.md#two-pass-convergence)).
5. Verify: `./check-osmosis.sh` → strict ✓ + TOTAL = 0.

### Case B — you renamed or deleted a column

1. Update the corresponding entry in `schema.yml` (rename it, or remove it).
2. Run `dbt run` to rebuild the affected models.
3. Run `dbt-osmosis yaml document` to reconcile schema.yml with the warehouse.
4. Re-run `./check-osmosis.sh`.

### Case C — a description didn't propagate

You added a description on the canonical source (e.g. `dim_kommune.kommune_nr`) but a downstream model still shows a bare `data_type:` line.

1. Run `dbt run` first if the downstream model hasn't been rebuilt.
2. Run `dbt-osmosis yaml document` twice (the second pass usually catches what the first missed).
3. If after two passes the description still hasn't propagated, check that the column name matches exactly (case-sensitive), and that the model actually depends on the source (osmosis only cascades along the dbt lineage, not between sibling models).

---

## Prerequisites

- `uv` (the Python env manager) installed. See [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/README.md) for first-time setup.
- `.venv/` set up under `atlas-data/dbt/` with dbt + dbt-osmosis installed.
- `ingest/.env` present with `PG*` env vars pointing at a Postgres with `marts.*` populated.

---

## Why a documentation gate matters

PostgREST projects column descriptions verbatim into the public OpenAPI spec at `api.atlas.helpers.no/docs`. A column without a description shows up as an empty entry in the spec — which means external developers can't tell what it represents. The gate makes "every column has public-facing documentation" a precondition for merge, not a follow-up.

See [dbt-osmosis.md § why Atlas relies on it](./dbt-osmosis.md#why-atlas-relies-on-it) for the longer rationale.

---

## Cross-references

- [dbt-osmosis.md](./dbt-osmosis.md) — what dbt-osmosis is, how propagation works, two-pass convergence
- [api-v1.md](./api-v1.md) — sibling gate (`check-api-v1.sh`) covering the public-API wrapper layer; non-overlapping scope
- [`atlas-data/dbt/check-osmosis.sh`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/check-osmosis.sh) — the script itself
- [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/README.md) — dbt project layout and command cheatsheet
- [PLAN-002](../ai-developer/plans/completed/PLAN-002-fill-schema-yml-description-gaps.md) — closed the 180-column backlog and tightened the gate to repo-wide
- [PLAN-004](../ai-developer/plans/completed/PLAN-004-postgrest-api-v1-wrapper.md) — built `check-api-v1.sh` and the `api_v1` wrapper layer it gates
