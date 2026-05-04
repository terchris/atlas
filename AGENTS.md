# Atlas — Agent Instructions

See `CLAUDE.md` for full project context. If instructions conflict, `CLAUDE.md` and
task-specific runbooks under `website/docs/ai-developer/` win.

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

- During Cloud environment setup only, `check-osmosis.sh` can fail if the local
  database state does not match the checked-out schema docs yet. For PR work,
  especially source onboarding, this is still a required gate: fix missing
  descriptions instead of bypassing the check.
- `dbt test` can show expected failures in a fresh setup before all fixture
  ingests / PostgREST objects exist. Do not treat those as acceptable for a PR
  unless the task runbook explicitly says the live DB gates are out of scope.
- Prefer `npm ci` when `package-lock.json` is present. Use `npm install` only
  when intentionally updating dependencies or when a package lacks a lockfile.
- The dbt Python venv is at `atlas-data/dbt/.venv/`; install deps with `uv pip install -r requirements.txt`.
