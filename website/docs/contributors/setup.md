# Setting up your dev environment

This is the first-time setup needed to clone Atlas and run anything end-to-end. Once you can run `npm run ingest:ssb-08764` and `dbt run` locally, you're ready to follow [adding-a-source.md](./adding-a-source.md).

The full per-tool docs live alongside the code; this page is a guided ordering with the gotchas called out.

---

## Prerequisites

You need:

- **Node.js ≥ 20** (uses built-in `fetch` and `import.meta.url`). Check with `node --version`.
- **npm** (Atlas's `package.json` uses npm; pnpm also works).
- **uv** — the Python env manager dbt uses. Install with `brew install uv` (macOS) or see [uv's install docs](https://github.com/astral-sh/uv).
- **Postgres** reachable from your machine. Atlas runs against Postgres in the [Urbalurba Infrastructure Stack (UIS)](https://github.com/helpers-no/urbalurba-infrastructure) for local dev — UIS spins up a Postgres pod inside Rancher Desktop k8s. See [Bootstrap atlas_db on UIS Postgres](#bootstrap-atlas_db-on-uis-postgres) below for the one-shot setup. If you don't have UIS, any local Postgres ≥ 14 works for ingest + dbt; you'll skip the frontend until you point at a real Atlas database.
- **`git`** with a configured user.

---

## Clone

```bash
git clone https://github.com/terchris/atlas.git
cd atlas
```

The repo has four top-level codebases:

- [`atlas-data/`](https://github.com/terchris/atlas/tree/main/atlas-data) — TypeScript ingest + dbt project. **Most contributor work happens here.**
- [`atlas-contributor-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend) — Next.js diagnostics app for contributors. Reads `marts.*` directly (no API layer); used to verify ingestion + dbt output. Dev/staging only — never deployed publicly. Default port `4000`.
- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) — Next.js customer app consuming the public PostgREST API at `api-atlas.helpers.no`. Deploys to `atlas.helpers.no`. **No DB role.** Self-contained / forkable as a reference implementation for external developers. Default port `3001`.
- [`website/`](https://github.com/terchris/atlas/tree/main/website) — Docusaurus-bound docs source (this site).

---

## Bootstrap `atlas_db` on UIS Postgres

Postgres runs as a pod inside the local k3s cluster (Rancher Desktop). UIS's per-app configure does the bootstrap (database + role + grants) and exposes the port to your host machine in one command:

```bash
./uis configure postgresql --app atlas --database atlas_db --json
```

This creates the `atlas_db` database, generates an `atlas` Postgres role with a random password, grants the role on the database, and auto-exposes the cluster service at `localhost:35432`. Sample output:

```json
{
  "status": "ok",
  "service": "postgresql",
  "local": {
    "host": "host.docker.internal",
    "port": 35432,
    "database_url": "postgresql://atlas:<password>@host.docker.internal:35432/atlas_db"
  },
  "database": "atlas_db",
  "username": "atlas",
  "password": "<generated>"
}
```

Copy the credentials into `atlas-data/ingest/.env` (or run the dedicated env-write step in [Set up the ingest layer](#set-up-the-ingest-layer) below). Treat the password like any other secret — `.env` is gitignored.

### Verify the connection from your host

Three checks, in increasing order of confidence. Run at least one before considering the bootstrap done.

**Reachability only** (fastest, doesn't authenticate — useful when you suspect the port-forward dropped):

```bash
nc -z localhost 35432 && echo "ok"
```

**Authenticated query — host has `psql`:**

```bash
psql "postgresql://atlas:<password>@localhost:35432/atlas_db" -c 'select 1'
```

**Authenticated query — host has no `psql`** (default on macOS unless you `brew install libpq`). Run `psql` from a throwaway docker container that talks back through `host.docker.internal` to the same port-forward — same auth path, no host-side install needed:

```bash
docker run --rm postgres:16-alpine \
  psql "postgresql://atlas:<password>@host.docker.internal:35432/atlas_db" \
  -c 'select 1'
```

Either authenticated query should print `?column?\n----------\n        1\n(1 row)`. The docker fallback works because `host.docker.internal` is Docker's magic DNS for "your host machine from inside a container" — the connection still ends up at the cluster's port-forward at `localhost:35432`.

If `dbt debug --connection` later reports `connection refused` on `localhost:35432`, the auto-expose dropped (it ends with the UIS container session). Re-attach with:

```bash
./uis expose postgresql
```

You can verify the Postgres pod itself is healthy with:

```bash
kubectl get pod -n default -l app.kubernetes.io/name=postgresql
kubectl logs -n default postgresql-0 --tail=20
```

Pod logs typically show `database system is ready to accept connections` when Postgres is up.

### After a cluster reset / fresh start

When you wipe the cluster (rancher-desktop reset, fresh laptop, UIS-image rebuild, anything that purges Postgres data) the `atlas` role's password rotates and `atlas_db` ceases to exist. The credentials previously written into `atlas-data/ingest/.env` are now stale. Bring Atlas back online in this order:

1. Confirm the Postgres pod is up again — usually the cluster bootstrap deploys it automatically:

   ```bash
   kubectl get pod -n default -l app.kubernetes.io/name=postgresql
   ```

2. Re-bootstrap `atlas_db` and capture the new credentials. **Same command** as the first-time bootstrap; idempotent in the sense that the role + database get re-created with a fresh random password:

   ```bash
   ./uis configure postgresql --app atlas --database atlas_db --json
   ```

3. Update `atlas-data/ingest/.env` with the new password from the JSON output. The `DATABASE_URL` (with `localhost` not `host.docker.internal`) and `PGPASSWORD` lines are the only fields that need rotating; everything else (`PGHOST=localhost`, `PGPORT=35432`, `PGUSER=atlas`, `PGDATABASE=atlas_db`, `ATLAS_SCRAPE_CONTACT_EMAIL`) stays unchanged.

4. Verify with one of the authenticated checks above + `dbt debug`:

   ```bash
   cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt debug
   ```

   `All checks passed!` is the green light.

5. Replay the migrations against the empty `atlas_db`:

   ```bash
   cd ../ingest && npm run migrate
   ```

   This brings `raw.*` schema (and any helpers in `marts.*`) back to the latest committed migration. Idempotent — every migration uses `if not exists`.

6. **Ingest the dim-spine sources first.** `dim_kommune` and `dim_fylke` build from SSB Klass classification 131 / 104. Without these, every `relationships → dim_kommune` / `→ dim_fylke` test in `dbt test` fails by definition (the dim is freshly-built but empty, so every foreign key has zero matches). Run before any `dbt run` / `dbt test`:

   ```bash
   npm run ingest:ssb-klass-kommuner   # ~1300 rows
   npm run ingest:ssb-klass-fylker     # ~40 rows
   ```

   These are fast (sub-10 seconds each) and idempotent.

7. Re-run dbt seeds + models. Order matters: `dbt seed` (loads CSV reference data), then `dbt run` (materializes every model including the dims that just got real raw data), then `dbt test`:

   ```bash
   cd ../dbt && uv run --env-file ../ingest/.env dbt seed && uv run --env-file ../ingest/.env dbt run && uv run --env-file ../ingest/.env dbt test
   ```

8. **Apply the api_v1 wrapper SQL.** The `dbt run` step builds `marts.mart_*` tables, but the `api_v1.*` wrapper views that the public API exposes are emitted by a separate generator (`./regenerate-api-v1.sh` writes the SQL; `./apply-api-v1.sh` applies it). Without this step, the `api_v1_rowcount_matches_marts` test errors because `api_v1.*` views don't exist yet:

   ```bash
   ./apply-api-v1.sh
   ```

   Idempotent — safe to re-run.

9. Verify everything is green:

   ```bash
   uv run --env-file ../ingest/.env dbt test       # PASS=474+ ERROR=0; one pre-existing postnummer WARN is OK
   ./check-osmosis.sh                              # ✓ all columns documented
   ```

10. (Optional but usually wanted) populate every `raw.*` table by running the catch-up script:

    ```bash
    cd ../ingest && npm run ingest:all
    ```

    Runs every public `npm run ingest:*` source sequentially, validates each via `raw.ingest_runs`, and prints a per-source row count. ~7–10 minutes total at current catalogue size (~3M rows). Skips `frr` (private; needs Red Cross internal API access). Fails non-zero on any source's spawn-error or validation-error so it's safe in CI.

    After it finishes, **refresh `mart_meta_sources`** so the catalogue's freshness signals reflect the new ingest runs:

    ```bash
    cd ../dbt && uv run --env-file ../ingest/.env dbt run --select mart_meta_sources && ./apply-api-v1.sh
    ```

    Without that step, `api_v1.meta_sources` keeps showing the pre-rebuild `last_ingested_at` values (null on a fresh cluster) until the next dbt run includes the mart.

    Smaller alternatives if you only want a smoke / debug subset:

    ```bash
    npm run ingest:all -- --dry-run                              # list what would run, no execution
    npm run ingest:all -- --only ssb-08764,fhi-alkohol           # subset
    npm run ingest:all -- --skip ssb-06913                       # everything except one slow source
    ```

If anything in steps 4–9 fails, fix before declaring the rebuild done. Step 10 is genuinely optional in the strict sense — the dim-spine ingests in step 6 are what `dbt test` requires — but it's the natural finish: the catalogue stays "data-empty" for 36+ sources until you run it.

### How Atlas reaches Postgres — dev vs production

Postgres is a single pod inside the local k3s cluster (Rancher Desktop) listening on cluster-internal port `5432`. Three different clients reach it three different ways:

| Client | Address | Why |
|---|---|---|
| **You, on your host machine** (running `npm run ingest:*`, `dbt run`, `psql`) | `localhost:35432` | The cluster's `5432` isn't reachable from the host directly. UIS's `./uis configure postgresql` (or `./uis expose postgresql`) opens a `kubectl port-forward`-style tunnel from `localhost:35432` to the cluster service `postgresql.default.svc.cluster.local:5432`. **`35432` is just the host-side port UIS picked** — high enough to avoid collisions with any system Postgres already running on `5432` on your laptop. |
| **A container running inside the same Docker host as the cluster** (like UIS's own `uis-provision-host` container) | `host.docker.internal:35432` | The container can't say "localhost" and mean your laptop, so Docker provides this magic DNS name. Same tunnel as above, just addressed differently. |
| **Atlas itself, when deployed as a container inside the k3s cluster (production / staging)** | `postgresql.default.svc.cluster.local:5432` | Same cluster, no port-forward needed. The pod talks to the postgresql Service via Kubernetes DNS, on the cluster-native port `5432`. |

The `./uis configure postgresql ... --json` output reflects the first two: the `local.database_url` field carries `host.docker.internal` (for in-Docker callers); for host-machine work like contributor dev, swap that for `localhost`. Same port `35432` either way.

**For contributors today: dev = `localhost:35432`.** The other two paths only matter once Atlas itself is containerised and deployed; the production deploy will set `DATABASE_URL` to the in-cluster form via a Kubernetes Secret, and the host-side port-forward stops being part of the picture.

**No UIS?** If you don't have UIS, skip this section and point Atlas at any local Postgres ≥ 14 by editing `atlas-data/ingest/.env`'s `DATABASE_URL` / `PG*` variables. You'll need to `CREATE DATABASE atlas_db;` and a role with full grants on it manually. The cluster topology stops mattering once `psql "$DATABASE_URL" -c 'select 1'` works.

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
| `DATABASE_URL` | Postgres connection string | The `local.database_url` field from `./uis configure postgresql --app atlas --database atlas_db --json`. From the host machine use `localhost:35432`, not `host.docker.internal`. |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Same as DATABASE_URL but separately for dbt | Same JSON output: `host` → `localhost`, `port` → `35432`, `username` → `PGUSER`, `password` → `PGPASSWORD`, `database` → `PGDATABASE`. |
| `ATLAS_SCRAPE_CONTACT_EMAIL` | Your contact email; embedded in scrapers' User-Agent | Use the address you want site operators to reach you at if a scrape causes problems. **Required for scraping sources** (hard-fails if unset); not needed for SSB/FHI/Brreg API ingests. |

Concrete example based on the JSON output from [Bootstrap atlas_db on UIS Postgres](#bootstrap-atlas_db-on-uis-postgres):

```bash
DATABASE_URL=postgresql://atlas:<password>@localhost:35432/atlas_db
PGHOST=localhost
PGPORT=35432
PGUSER=atlas
PGPASSWORD=<password>
PGDATABASE=atlas_db
ATLAS_SCRAPE_CONTACT_EMAIL=you@example.org
```

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
uv run --env-file ../ingest/.env dbt seed     # loads ref_*.csv + dim_postnummer.csv into marts.*
uv run --env-file ../ingest/.env dbt run      # builds all models
uv run --env-file ../ingest/.env dbt test     # runs all tests
./check-osmosis.sh                            # verifies every column has a description
```

`dbt seed` is required on a fresh database — `models/indicators/*.sql` left-join lookup tables (`ref_ssb_family_type`, `ref_fhi_utdann`, `ref_ssb_household_type`, `ref_ssb_nivaa`) that come from `seeds/`, and `models/supply/supply__redcross_branches.sql` joins `dim_postnummer`. Without seeds, `dbt run` errors with `relation "marts.ref_*" does not exist`.

If `dbt run` errors complaining about missing `raw.*` tables, you skipped the ingest step — go back and run at least `ingest:ssb-08764`. dbt sources require something to read from.

For more on dbt-osmosis and the description gate, see [dbt-osmosis.md](./dbt-osmosis.md) and [check-osmosis.md](./check-osmosis.md).

---

## (Optional) Serve `api_v1.*` via PostgREST

After `dbt run` succeeds, you can expose the public API surface (`api_v1.*` wrapper views over `marts.mart_*`) as a REST API by running PostgREST against your local `atlas_db`. UIS deploys and operates PostgREST as a multi-instance service; Atlas just generates and applies the schema.

```bash
# 1. Generate + apply api_v1 wrapper views (after dbt run)
cd atlas-data/dbt
./regenerate-api-v1.sh    # writes api_v1_generated.sql + api_v1_state.json (idempotent)
./apply-api-v1.sh         # applies the generated SQL to atlas_db

# 2. Configure + deploy PostgREST for the atlas app (UIS-side, run from your UIS CLI)
./uis configure postgrest --app atlas --database atlas_db --schemas api_v1,marts,raw --url-prefix api-atlas --json
./uis deploy postgrest --app atlas

# 3. Smoke test the live endpoints across all three exposed schemas
curl -s http://api-atlas.localhost/ | jq '{swagger, version: .info.version}'
# expect: {"swagger":"2.0","version":"14.10"}
curl -s http://api-atlas.localhost/indicator_summary | jq '.[0:3]'
# expect: 3 rows from marts.mart_indicator_summary (api_v1 schema, default)
curl -s -H 'Accept-Profile: marts' http://api-atlas.localhost/dim_kommune?limit=3 | jq 'length'
# expect: 3 (marts.dim_kommune via Accept-Profile header)
curl -s -H 'Accept-Profile: raw' http://api-atlas.localhost/ssb_08764?limit=3 | jq 'length'
# expect: 3 (raw.ssb_08764 via Accept-Profile header)
```

The `--schemas` flag (plural, comma-separated) is what tells UIS's configure handler to grant the `atlas_web_anon` role on each named schema and pin them as PostgREST's `db-schemas` value. Atlas opts into three schemas: **`api_v1`** (the curated wrapper views — production-stable contract), **`marts`** (every dbt-built table for "open by default" data exploration), and **`raw`** (verbatim ingest landings for full provenance). `private_marts` and `private_raw` stay outside this list deliberately — FRR personal data lives there and the public `atlas_web_anon` role doesn't get any grants on those schemas. Hitting `/frr_resources` returns 404 by default and 406 with `Accept-Profile: private_marts` because PostgREST refuses any schema name not in its configured list.

The configure step creates `atlas_authenticator` + `atlas_web_anon` Postgres roles in `atlas_db` and grants the anonymous role read access on `api_v1.*` + `marts.*` + `raw.*`. The deploy step renders a per-app Deployment + Service + IngressRoute in the `postgrest` namespace; `PGRST_DB_SCHEMAS` lives on the per-app secret so configure and deploy can't drift.

After adding a new mart to `models/marts/api/`, re-run `./regenerate-api-v1.sh` + `./apply-api-v1.sh` + `psql "$DATABASE_URL" -c "NOTIFY pgrst, 'reload schema';"` — no PostgREST redeploy needed.

For more on the wrapper layer, the generator, and the validation gates, see [api-v1.md](./api-v1.md).

---

## (Optional) Set up the frontends

Atlas has two Next.js apps. Pick the one(s) you want to run.

### Contributor frontend — direct Postgres, for ingestion verification

```bash
cd atlas-contributor-frontend
npm install
npm run dev
```

Default port `4000`. Reads `marts.*` directly via `postgres.js` using the same `.env` settings as ingest + dbt. If your local DB has at least one source loaded and `dbt run` has succeeded, the data-explorer page at <http://localhost:4000/data> should work. This app is contributor-facing only — it's how you confirm ingestion and dbt output landed correctly. Never deployed publicly.

### Customer frontend — PostgREST consumer, the public-facing app

```bash
cd atlas-frontend
cp .env.example .env.local                 # only NEXT_PUBLIC_API_URL is required; defaults to http://api-atlas.localhost
npm install
npm run dev
```

Default port `3001` (so it coexists with the contributor frontend on `4000`). No DB role; reads only via HTTP from `NEXT_PUBLIC_API_URL`. Visit <http://localhost:3001> for the homepage and <http://localhost:3001/data> for the introspection-driven data catalog (lists every `api_v1.*` endpoint with row counts and column descriptions, sourced live from PostgREST's spec).

For the customer frontend to return data, PostgREST has to be reachable at the configured `NEXT_PUBLIC_API_URL` — see the *(Optional) Serve `api_v1.*` via PostgREST* section above.

The customer frontend is structured as a **forkable reference implementation** for external developers building their own apps on Atlas's API. Its `README.md` markets it that way; treat changes there as documentation external readers will see.

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
- **`dbt debug` says "connection refused" on `localhost:35432`** — the UIS port expose dropped (auto-expose ends with the UIS container session). Re-attach with `./uis expose postgresql`. See [Bootstrap atlas_db on UIS Postgres](#bootstrap-atlas_db-on-uis-postgres).
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
