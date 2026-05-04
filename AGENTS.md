# Atlas — Agent Instructions

See `CLAUDE.md` for full project context.

## Cursor Cloud specific instructions

### System dependencies

The Cloud VM requires these installed before any work:
- **Node.js ≥20** (via nodesource)
- **PostgreSQL 16** (via apt; start with `pg_ctlcluster 16 main start`)
- **uv** (via `pip install uv`)

### PostgreSQL setup

A local Postgres runs on **port 5432** (not the UIS convention of 35432). The database `atlas_db` is owned by the `atlas` user with password `atlas_dev_password`. Schemas `raw`, `marts`, and `public` have `CREATE` granted to `atlas`.

Before any data work, ensure Postgres is running: `pg_isready || pg_ctlcluster 16 main start`.

### Environment files (gitignored, must be recreated each session)

- `atlas-data/ingest/.env` — copy from `.env.example`, set `PGPORT=5432` and `PGPASSWORD=atlas_dev_password`
- `atlas-contributor-frontend/.env.local` — needs `DATABASE_URL=postgresql://atlas:atlas_dev_password@localhost:5432/atlas_db`
- `atlas-frontend/.env.local` — needs `NEXT_PUBLIC_API_URL`; the customer frontend requires a PostgREST instance (not available in Cloud VM by default)

### Running services

| Service | Directory | Command | Port |
|---|---|---|---|
| Contributor frontend | `atlas-contributor-frontend/` | `npm run dev` | 4000 |
| Customer frontend | `atlas-frontend/` | `npm run dev` | 3001 |

The contributor frontend reads `marts.*` directly from Postgres; it works fully with the local DB.
The customer frontend requires PostgREST at `NEXT_PUBLIC_API_URL` — the `/data` catalog will show errors without it.

### Standard commands

Documented in `website/docs/contributors/setup.md`. Key commands:

- **Ingest typecheck**: `cd atlas-data/ingest && npm run typecheck`
- **Ingest tests**: `cd atlas-data/ingest && npm test`
- **dbt commands**: `cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt <cmd>`
- **PR gates**: typecheck, `dbt parse`, `./check-osmosis.sh` (see `CLAUDE.md`)

### Gotchas

- `check-osmosis.sh` may fail if dbt-osmosis detects missing column descriptions — this is a pre-existing repo condition, not a setup error. The strict gate (`--check`) compares live DB state against schema.yml.
- `dbt test` will show 2 expected failures on a fresh setup: `api_v1` schema tests (no PostgREST) and `dim_kommune` relationship tests (need additional ingests beyond `ssb-08764`).
- Always run `npm install` after pulling main — stale `node_modules/` causes type drift.
- The dbt Python venv is at `atlas-data/dbt/.venv/`; install deps with `uv pip install -r requirements.txt`.
