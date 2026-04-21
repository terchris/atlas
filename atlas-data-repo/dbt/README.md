# atlas-data dbt

dbt Core project for Atlas. Transforms `raw.*` landing tables (populated by `../ingest/`) into `marts.*` tables that the Next.js frontend and any analyst tooling read from.

Scope is intentionally narrow — see [`docs/stack/suggested-stack.md § dbt scope`](../../docs/stack/suggested-stack.md) in the parent Atlas repo for the seven dbt patterns ratified for v1 (materialised tables, `source()`/`ref()`, `schema.yml` with the four standard tests, CLI commands, `dbt_utils.union_relations`). Anything outside those patterns (incremental, snapshots, exposures, Python models, custom macros beyond `dbt_utils`) is deferred until a concrete need appears.

## Prerequisites

- [uv](https://github.com/astral-sh/uv) — Python package/env manager (`brew install uv`)
- A Postgres database reachable via the PG* env vars in [`../ingest/.env`](../ingest/.env.example)
- The `raw.*` schema populated by at least one ingest run (see [`../ingest/README.md`](../ingest/README.md))

## Setup (once)

```bash
cd atlas-data-repo/dbt

# Create a project-local Python 3.12 venv at .venv/
uv venv

# Install dbt-core + dbt-postgres pinned via requirements.txt
uv pip install -r requirements.txt

# Install dbt package dependencies (dbt_utils)
uv run --env-file ../ingest/.env dbt deps
```

## Commands

All commands take `--env-file ../ingest/.env` to pull PG* credentials. You can wrap this in a shell alias if you prefer.

```bash
# Verify connection, profile, package deps
uv run --env-file ../ingest/.env dbt debug

# Rebuild all models
uv run --env-file ../ingest/.env dbt run

# Rebuild one model
uv run --env-file ../ingest/.env dbt run --select indicators__ssb_08764

# Run all tests
uv run --env-file ../ingest/.env dbt test

# Run tests on one model
uv run --env-file ../ingest/.env dbt test --select indicators__ssb_08764

# Check source freshness (uses loaded_at_field declared in sources.yml)
uv run --env-file ../ingest/.env dbt source freshness

# Build docs site locally (opens browser at localhost:8080)
uv run --env-file ../ingest/.env dbt docs generate
uv run --env-file ../ingest/.env dbt docs serve
```

## Project layout

```
dbt/
├── dbt_project.yml          # Project config; sets indicators/ → marts schema as tables
├── profiles.yml             # Postgres connection via PG* env vars
├── packages.yml             # External packages (dbt_utils)
├── requirements.txt         # Python deps (dbt-core, dbt-postgres)
├── macros/
│   └── generate_schema_name.sql   # Override: +schema: marts → "marts" (not "{target}_marts")
├── models/
│   └── indicators/
│       ├── sources.yml      # Declares raw.ssb_08764 + its freshness policy + tests
│       ├── indicators__ssb_08764.sql  # Per-source passthrough with source_id added
│       └── schema.yml       # Model-level column descriptions + tests
├── analyses/                # (empty — ad-hoc SQL that isn't materialised)
├── snapshots/               # (empty — not used in v1)
├── seeds/                   # (empty — static CSVs, if we ever need them)
├── tests/                   # (empty — custom singular tests)
├── .venv/                   # uv-managed (gitignored)
├── target/                  # dbt build artefacts (gitignored)
├── dbt_packages/            # installed packages (gitignored)
├── logs/                    # dbt logs (gitignored)
└── README.md
```

## The model today

One model, feeding the `marts` schema:

| Model | Materialisation | Source | Rows |
|---|---|---|---|
| `indicators__ssb_08764` | `table` in `marts` | `raw.ssb_08764` | ~1 790 |

The per-source model is a near-passthrough: it prepends `source_id = 'ssb-08764'` so downstream `indicator_values` (future) can union per-source tables without column-name collisions. Every subsequent SSB-style source follows the same shape.

## Tests today

Nine tests pass on every `dbt test` run:

- `not_null` on `source_id`, `region_code`, `year`, `contents_code`, `updated_at`
- `accepted_values` on `source_id` (must equal `'ssb-08764'`)
- `accepted_values` on `contents_code` (five allowed SSB codes)
- `dbt_utils.accepted_range` on `year` (2000–2040)
- `dbt_utils.unique_combination_of_columns` on `(source_id, region_code, year, contents_code)`

## Adding a new per-source model

To add, e.g., `ssb-12944`:

1. Ensure the corresponding `raw.ssb_12944` table exists (via a migration) and the ingest script has been run at least once.
2. Add an entry under `sources:` in [`models/indicators/sources.yml`](models/indicators/sources.yml).
3. Create `models/indicators/indicators__ssb_12944.sql` by copying the 08764 file and changing the source reference + literal source_id.
4. Add a model block to [`models/indicators/schema.yml`](models/indicators/schema.yml).
5. `dbt run --select indicators__ssb_12944` then `dbt test --select indicators__ssb_12944`.

Typical per-source effort: ~10 minutes.

## What's next

- **`indicator_values` mart** — unions every `indicators__*` model into one long table. Not yet built; add when we have the second per-source model.
- **`kommune_dim`** — dimension table built from SSB Klass / Kartverket. Required before `kommune_indicators` (the main serving table for Next.js).
- **`kommune_indicators`** — joins `indicator_values` with `kommune_dim`. The single table the Coverage-gap explorer reads.
- **dbt source freshness tied to Dagster** — once Dagster is wired in, freshness violations surface as red assets in the Dagster UI.

See [`../../docs/stack/data-journey-ssb-08764.md`](../../docs/stack/data-journey-ssb-08764.md) for the full end-to-end picture.
