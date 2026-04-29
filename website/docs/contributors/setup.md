# Setting up your dev environment

This is the first-time setup needed to clone Atlas and run anything end-to-end. Once you can run `npm run ingest:ssb-08764` and `dbt run` locally, you're ready to follow [adding-a-source.md](./adding-a-source.md).

The full per-tool docs live alongside the code; this page is a guided ordering with the gotchas called out.

---

## Prerequisites

You need:

- **Node.js ≥ 20** (uses built-in `fetch` and `import.meta.url`). Check with `node --version`.
- **npm** (Atlas's `package.json` uses npm; pnpm also works).
- **uv** — the Python env manager dbt uses. Install with `brew install uv` (macOS) or see [uv's install docs](https://github.com/astral-sh/uv).
- **Postgres** reachable from your machine. Atlas runs against Postgres in the [Urbalurba Infrastructure Stack (UIS)](https://github.com/helpers-no/urbalurba-infrastructure) for local dev — UIS spins up a Postgres pod inside Rancher Desktop k8s. See [Connecting to Postgres in UIS](#connecting-to-postgres-in-uis) below for the port-forward step. If you don't have UIS, any local Postgres ≥ 14 works for ingest + dbt; you'll skip the frontend until you point at a real Atlas database.
- **`git`** with a configured user.

---

## Clone

```bash
git clone https://github.com/terchris/atlas.git
cd atlas
```

The repo has three top-level codebases:

- [`atlas-data/`](https://github.com/terchris/atlas/tree/main/atlas-data) — TypeScript ingest + dbt project. **Most contributor work happens here.**
- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) — Next.js app (reads `marts.*`).
- [`website/`](https://github.com/terchris/atlas/tree/main/website) — Docusaurus-bound docs source (this site).

---

## Connecting to Postgres in UIS

Postgres runs as a pod inside the local k3s cluster (Rancher Desktop). The pod listens on cluster-internal port `5432`, but that ClusterIP service isn't reachable from your host machine directly — you need a `kubectl port-forward`.

Atlas's `.env` expects Postgres on `localhost:35432`. Open the forward in a long-lived terminal (or background process) and leave it running while you work:

```bash
kubectl port-forward svc/postgresql 35432:5432
```

Verify:

```bash
nc -z localhost 35432 && echo "ok"
# or
psql "$DATABASE_URL" -c 'select 1'
```

If `dbt debug --connection` reports `connection refused` on `localhost:35432`, the port-forward dropped — restart it. The forward survives normal terminal use but ends when you `Ctrl-C` or close the shell that started it.

You can verify the Postgres pod itself is healthy with:

```bash
kubectl get pod -n default -l app.kubernetes.io/name=postgresql
kubectl logs -n default postgresql-0 --tail=20
```

Pod logs typically show `database system is ready to accept connections` when Postgres is up.

If you don't have UIS, point Atlas at any local Postgres ≥ 14 by editing `atlas-data/ingest/.env`'s `DATABASE_URL` / `PG*` variables. The cluster topology stops mattering once `psql "$DATABASE_URL" -c 'select 1'` works.

---

## Set up the ingest layer

The ingest layer is a TypeScript project under `atlas-data/ingest/`.

```bash
cd atlas-data/ingest
npm install
```

Copy the example env file and fill it in:

```bash
cp .env.example .env
$EDITOR .env
```

Required variables:

| Variable | What it is | Where to get it |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | UIS gives one out of the box; otherwise your local Postgres. |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Same as DATABASE_URL but separately for dbt | dbt's `profiles.yml` reads these. |
| `ATLAS_SCRAPE_CONTACT_EMAIL` | Your contact email; embedded in scrapers' User-Agent | Use the address you want site operators to reach you at if a scrape causes problems. **Required for scraping sources** (hard-fails if unset); not needed for SSB/FHI/Brreg API ingests. |

Smoke test the ingest:

```bash
npm run ingest:ssb-08764
```

If your `DATABASE_URL` is set, this writes ~1 800 rows to `raw.ssb_08764`. Check:

```bash
psql "$DATABASE_URL" -c "select count(*) from raw.ssb_08764;"
```

For more on each ingest module's shape, see [ingest-modules.md](./ingest-modules.md).

---

## Set up the dbt layer

dbt is a Python project. Atlas pins it via `requirements.txt` and runs it through `uv`.

```bash
cd atlas-data/dbt

# Create a project-local Python 3.12 venv at .venv/
uv venv

# Install dbt-core + dbt-postgres + dbt-osmosis
uv pip install -r requirements.txt

# Install dbt package dependencies (dbt_utils)
uv run --env-file ../ingest/.env dbt deps
```

Smoke test:

```bash
uv run --env-file ../ingest/.env dbt debug    # verifies connection + profile + packages
uv run --env-file ../ingest/.env dbt run      # builds all models
uv run --env-file ../ingest/.env dbt test     # runs all tests
./check-osmosis.sh                            # verifies every column has a description
```

If `dbt run` errors complaining about missing `raw.*` tables, you skipped the ingest step — go back and run at least `ingest:ssb-08764`. dbt sources require something to read from.

For more on dbt-osmosis and the description gate, see [dbt-osmosis.md](./dbt-osmosis.md) and [check-osmosis.md](./check-osmosis.md).

---

## (Optional) Set up the frontend

If you want to view changes in the Next.js app:

```bash
cd atlas-frontend
npm install
npm run dev
```

Default port 3000. The frontend connects to Postgres via the same `.env` settings; if your local DB has at least one source loaded + dbt run, the data-explorer page (`/data`) should work.

---

## Useful day-to-day commands

| Command | Where | What it does |
|---|---|---|
| `npm run typecheck` | `atlas-data/ingest/` | TypeScript compile — must pass before commit |
| `npm run ingest:<source>` | `atlas-data/ingest/` | Run one ingest module |
| `npm run migrate` | `atlas-data/ingest/` | Apply Postgres migrations (idempotent) |
| `dbt run --select <model>` | `atlas-data/dbt/` | Build one model |
| `dbt test --select <model>` | `atlas-data/dbt/` | Run tests on one model |
| `dbt-osmosis yaml document` | `atlas-data/dbt/` | Propagate column descriptions across schema.yml files |
| `./check-osmosis.sh` | `atlas-data/dbt/` | Verify every column is documented (PR-blocker) |

For the testing workflow before opening a PR, see [testing.md](./testing.md).

---

## Common gotchas

- **`uv: command not found`** — install with `brew install uv` (macOS) or [uv's docs](https://github.com/astral-sh/uv). Don't use `pip install dbt-core` directly; the env will diverge from CI.
- **dbt errors with `permission denied for schema raw`** — your Postgres role doesn't have `CREATE` on `raw`. UIS sets this up automatically; a fresh Postgres needs `GRANT CREATE ON SCHEMA raw TO <your-role>;`.
- **`dbt debug` says "connection refused" on `localhost:35432`** — the `kubectl port-forward` to UIS Postgres dropped or was never started. See [Connecting to Postgres in UIS](#connecting-to-postgres-in-uis).
- **`ATLAS_SCRAPE_CONTACT_EMAIL` unset** — only matters if you're running a scraping source (`ingest:redcross-branches` etc.). For SSB/FHI ingests, you can leave it blank.
- **TypeScript errors after pulling main** — `npm install` again. Atlas pins types tightly and stale `node_modules/` causes type drift.
- **`dbt-osmosis` says "would write changes" after a fresh run** — run it twice; osmosis is two-pass on a populated project. See [dbt-osmosis.md § two-pass convergence](./dbt-osmosis.md#two-pass-convergence).

---

## Cross-references

- [adding-a-source.md](./adding-a-source.md) — once setup is working, this is what you do next
- [testing.md](./testing.md) — the local test workflow before opening a PR
- [data-journey.md](./data-journey.md) — what the pieces are and how they fit together
- [`atlas-data/ingest/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/README.md) — full ingest-side details
- [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/README.md) — full dbt-side details
- [Urbalurba Infrastructure Stack](https://github.com/helpers-no/urbalurba-infrastructure) — local dev k8s with Postgres, Authentik, Gravitee, etc.
