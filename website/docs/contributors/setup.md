# Setting up your dev environment

This is the first-time setup needed to clone Atlas and run anything end-to-end. Once you can run `npm run ingest:ssb-08764` and `dbt run` locally, you're ready to follow [adding-a-source.md](./adding-a-source.md).

The full per-tool docs live alongside the code; this page is a guided ordering with the gotchas called out.

---

## Prerequisites

You need:

- **Node.js ≥ 20** (uses built-in `fetch` and `import.meta.url`). Check with `node --version`.
- **npm** (Atlas's `package.json` uses npm; pnpm also works).
- **uv** — the Python env manager dbt uses. Install with `brew install uv` (macOS) or see [uv's install docs](https://github.com/astral-sh/uv).
- **Postgres** reachable from your machine. Atlas runs against Postgres in the [Urbalurba Infrastructure Stack (UIS)](https://github.com/helpers-no/urbalurba-infrastructure) for local dev — UIS spins up a Postgres pod inside Rancher Desktop k8s. See [Bootstrap atlas_db on UIS Postgres](#connecting-to-postgres-in-uis) below for the one-shot setup. If you don't have UIS, any local Postgres ≥ 14 works for ingest + dbt; you'll skip the frontend until you point at a real Atlas database.
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

The two-frontend split (one PostgREST-only public app, one direct-Postgres internal diagnostics app) is deliberate and load-bearing — see [frontends.md](./frontends.md) for when to use which and why the split exists.

---

## Bootstrap `atlas_db` on UIS Postgres {#connecting-to-postgres-in-uis}

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

When you wipe the cluster (rancher-desktop reset, fresh laptop, UIS-image rebuild, anything that purges Postgres data) the `atlas` role's password rotates and `atlas_db` ceases to exist. The credentials previously written into `atlas-data/ingest/.env` are now stale. Bring Atlas back online with **four** commands:

1. Confirm the Postgres pod is up again — usually the cluster bootstrap deploys it automatically:

   ```bash
   kubectl get pod -n default -l app.kubernetes.io/name=postgresql
   ```

2. Re-bootstrap `atlas_db` and capture the new credentials. **Same command** as the first-time bootstrap; idempotent in the sense that the role + database get re-created with a fresh random password:

   ```bash
   ./uis configure postgresql --app atlas --database atlas_db --json
   ```

3. Update `atlas-data/ingest/.env` with the new password from the JSON output. The `DATABASE_URL` (with `localhost` not `host.docker.internal`) and `PGPASSWORD` lines are the only fields that need rotating; everything else (`PGHOST=localhost`, `PGPORT=35432`, `PGUSER=atlas`, `PGDATABASE=atlas_db`, `ATLAS_SCRAPE_CONTACT_EMAIL`) stays unchanged.

4. **Run the data bootstrap** — one command, walks every phase:

   ```bash
   cd atlas-data/ingest && npm run bootstrap
   ```

   Eight sequential phases, all idempotent:

   | Phase | What it does | Typical duration on fresh cluster |
   |---|---|---|
   | 1. `migrate` | Applies pending `raw.*` migrations. Brings the schema to the latest committed shape. | seconds |
   | 2. `refresh` | Runs every `refresh:*` seed-source whose `index.ts` writes to a `raw.*` table (auto-detected; today just `refresh:brreg-enheter`). The other `refresh:*` sources update committed CSV seeds and don't need re-running on a cluster reset. | 1–3 min |
   | 3. `ingest` | Runs every `npm run ingest:*` (41 sources today), validating each via `raw.ingest_runs`. Skips `frr` (private; needs Red Cross internal API access). | 7–10 min |
   | 4. `seed` | `dbt seed` — loads committed `seeds/*.csv` into `marts.*` (reference dims like `dim_postnummer`, `dim_ngo`, etc.). | seconds |
   | 5. `run` | `dbt run` — builds every dbt model. With `+persist_docs` enabled (`atlas-data/dbt/dbt_project.yml`), this also issues `COMMENT ON COLUMN` / `COMMENT ON TABLE` per materialised model so PostgREST's spec exposes the schema.yml descriptions. | 5-7 min |
   | 6. `api` | `apply-api-v1.sh` (creates `api_v1.*` wrapper views) + re-grants SELECT on `marts.*` + `raw.*` to `atlas_web_anon` + `NOTIFY pgrst, 'reload schema'`. The regrants are needed because dbt's CREATE TABLE in phase 5 doesn't reliably inherit the schema-level grants UIS configured via `ALTER DEFAULT PRIVILEGES` — without them, `Accept-Profile: marts` requests get 401. Guarded by `IF EXISTS` on the role so it's a no-op when PostgREST isn't deployed yet. | seconds |
   | 7. `test` | `dbt test` — runs every `not_null` / `relationships` / `accepted_values` test. **Slow**: 30-45 min on full-volume facts (`fact_kommune_indicators` × `dim_kommune` relationship is the long-pole). | 30-45 min |
   | 8. `docs` | `dbt docs generate` — refreshes `target/catalog.json` so the dbt-docs UI reflects the post-Phase-6 schema (api_v1.* views included). Without this phase, `target/catalog.json` drifts every time models change but no one runs `dbt docs generate` manually. | seconds |

   On any failure the script exits non-zero with the specific retry command (`npm run refresh:brreg-enheter`, `npm run ingest:<source>`, `(cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt run)`, etc.). Re-running the whole bootstrap is also safe — every phase is idempotent.

   Useful flags for partial / debug runs:

   ```bash
   npm run bootstrap -- --dry-run                       # list phase order, no execution
   npm run bootstrap -- --only migrate,refresh          # run only the data-loading phases
   npm run bootstrap -- --only api                      # just re-apply api_v1 + regrant (cheap)
   npm run bootstrap -- --only docs                     # just regenerate dbt docs (catalog.json)
   npm run bootstrap -- --skip test                     # everything except dbt test
   npm run bootstrap -- --include frr                   # also run the private frr ingest
   ```

   **Companion alias** for the post-edit cycle (you changed a model SQL or added one new ingest source — but everything else is already in place):

   ```bash
   npm run dbt:rebuild     # alias: bootstrap -- --only seed,run,api,test,docs
   ```

   Runs the five cheap phases that any model/seed change requires — `dbt seed` reloads committed CSVs (so seed schema.yml description edits flow), `dbt run` rebuilds models, `apply-api-v1.sh` recreates wrappers, `dbt test` verifies, `dbt docs generate` refreshes `target/catalog.json`. **Roughly 35-50 min total — `dbt test` is the long pole.** Use this instead of full `bootstrap` when you're not adding ingest sources or wiping the cluster. If you want to skip the test phase for fast iteration: `npm run bootstrap -- --only seed,run,api,docs` (~5-8 min). See [`ingest-modules.md` § When to re-run what](./ingest-modules.md#when-to-re-run-what--the-trigger-matrix) for the full trigger matrix.

5. (Optional) Verify everything is green:

   ```bash
   cd ../dbt && ./check-osmosis.sh                # ✓ all columns documented
   ```

If step 4 fails, the script's failure summary names the specific retry command — fix the underlying cause and either rerun just that piece or re-run the whole bootstrap.

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

Concrete example based on the JSON output from [Bootstrap atlas_db on UIS Postgres](#connecting-to-postgres-in-uis):

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

### Per-source `manifest.yml`

Every source folder under `atlas-data/ingest/src/sources/<id>/` carries a `manifest.yml` alongside the `index.ts` ingest module. It's the **single source of truth** for the source's catalogue metadata — provider, license, periodicity, EU theme, attribution, tags, and a hand-authored `dimensions:` block describing each upstream dimension. Per the contract in [PLAN-007 Phase 2.11](../ai-developer/plans/completed/PLAN-007-data-display-open-by-default.md), all *structured* metadata lives here; the per-source `README.md` is prose-only (what the script does, quirks, references).

Required top-level fields:

| Field | Purpose |
|---|---|
| `source_id` | Folder name (kebab-case); primary key (e.g. `ssb-08764`). |
| `upstream_id` | Upstream's own identifier (SSB table number, FHI dataset slug, etc.). |
| `upstream_url` | Canonical link to the source on the upstream's site. |
| `upstream_title` | The source's authoritative title (usually Norwegian). |
| `description` | One paragraph framing the dataset for the customer-facing catalogue. |
| `publisher` | Institution that publishes the data. |
| `license` + `license_url` | Default `NLOD` for Norwegian public-sector sources. |
| `periodicity` | ISO 8601 — `P1Y` annual, `P3M` quarterly, `P1M` monthly, `irregular` for ad-hoc. |
| `eu_theme` | EU Data Theme code (one of `AGRI`, `ECON`, `EDUC`, `ENER`, `ENVI`, `GOVE`, `HEAL`, `INTR`, `JUST`, `REGI`, `SOCI`, `TECH`, `TRAN`). Aligns Atlas with Felles datakatalog (DCAT-AP). Auto-derived from `tags.topic` by `fill-manifest-todos.ts`. |
| `attribution` | Citation string for academic / legal compliance. |

Plus the four declared `tags:` namespaces (each takes exactly one value per source):

```yaml
tags:
  provider: ssb           # ssb / fhi / redcross / brreg / bufdir / folkehjelp / …
  topic: income           # income / education / health / demographics / social / ngo-supply / reference
  geo: kommune            # kommune / fylke / national / bydel
  cadence: annual         # annual / quarterly / monthly / irregular / one-shot
```

And the editorial `dimensions:` block — one entry per upstream dimension, hand-authored:

```yaml
dimensions:
  - code: Region
    meaning: Region (national / fylke / kommune / bydel / historical)
    value_format: "Numeric code: 0 national, 2-digit fylke, 4-digit kommune, 6-digit bydel"
    notes: "~1036 codes when pulling full range"
```

Authoring a manifest for a new source is described in [adding-a-source.md](./adding-a-source.md) — three steps: bootstrap (auto), fill (auto), edit dimensions (by hand).

**After commit, the manifest is human-authored** — `npm run ingest:<source>` does not modify it. Field changes happen via PR like any other code change.

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

Atlas has two Next.js apps. Pick the one(s) you want to run. If you're not sure which fits your task, read [frontends.md](./frontends.md) first.

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

Default port `3001` (so it coexists with the contributor frontend on `4000`). No DB role; reads only via HTTP from `NEXT_PUBLIC_API_URL`. Notable routes:

- <http://localhost:3001> — homepage, two CTAs (*Browse all endpoints*, *Sources*).
- <http://localhost:3001/data> — tag-filtered catalog. ~120 endpoints across `api_v1`, `marts`, `raw` schemas. Sidebar facets: provider / topic / geo / cadence / eu_theme / layer. Bookmarkable filter URLs (e.g. `?tag=topic:income&tag=geo:kommune`).
- <http://localhost:3001/data/sources> — every upstream Atlas ingests, grouped by provider, with freshness signals.
- <http://localhost:3001/data/sources/ssb-08764> — per-source detail with manifest metadata + raw-table link + derived endpoints joined live against the lineage seed.
- <http://localhost:3001/data/api_v1/distrikt_summary> (or `/data/marts/dim_kommune`, `/data/raw/ssb_08764`) — per-endpoint table viewer with sort + search + pagination. Schema is dispatched via `Accept-Profile` per the multi-schema PostgREST contract.

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
- **`dbt debug` says "connection refused" on `localhost:35432`** — the UIS port expose dropped (auto-expose ends with the UIS container session). Re-attach with `./uis expose postgresql`. See [Bootstrap atlas_db on UIS Postgres](#connecting-to-postgres-in-uis).
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
