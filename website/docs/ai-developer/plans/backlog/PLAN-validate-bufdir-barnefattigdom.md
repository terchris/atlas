# PLAN — Validate bufdir-barnefattigdom (post-merge PR #58)

**Status:** backlog (operational checklist; not a feature build)  
**Scope:** Confirm `feat(data): onboard bufdir-barnefattigdom (#58)` behaves end-to-end: TypeScript reads Bufdir/SSB upstreams, `raw.*` is populated, dbt builds `marts.indicators__bufdir_barnefattigdom`.  
**Depends on:** Postgres reachable from this machine; `atlas-data/ingest/.env` with `DATABASE_URL` **and** libpq vars aligned with `profiles.yml` (see `AGENTS.md` / `atlas-data/dbt/profiles.yml`). **No `psql` required** — validate with ingest logs, NDJSON, Node `postgres`, dbt.

---

## Principles

1. **Source first** — prove TypeScript can read Strapi + Azure APIM (+ Klass) before relying on dbt.
2. **Layered** — NDJSON-only → `raw` upsert → `dbt run` / `dbt test`.

---

## Phase 1 — Upstream only (no Postgres writes)

**Goal:** Ingest code can fetch and parse upstream; no DB dependency.

| Step | Command / action | Pass |
|------|------------------|------|
| 1a | `cd atlas-data/ingest && npm ci` (if needed) | Exit 0 |
| 1b | `npm run typecheck` | Exit 0 |
| 1c | Run ingest with **no** DB: `DATABASE_URL= npx tsx src/sources/bufdir-barnefattigdom/index.ts` | Exit 0 |
| 1d | Logs | `http.json.ok` for Strapi + `klass.fetch.done` + repeated `apim.overview` / `apim.detailsmultiple` without fatal errors |
| 1e | Output | `atlas-data/ingest/output/bufdir-barnefattigdom.ndjson` exists; spot-check a few lines (expect `region_code`, `year`, `indicator_api_id`, `category_unit`/`category_format`, numeric `value` or null) |

**Notes:** Full run can take **many minutes** (all indicators × kommune batches). For a quicker smoke, consider temporarily restricting batch size in code **only for local debugging** — do not commit hacks; prefer waiting once for a clean validation.

---

## Phase 2 — Postgres `raw` layer

**Goal:** Migration applies; upsert matches PK and row grain.

| Step | Command / action | Pass |
|------|------------------|------|
| 2a | `cd atlas-data/ingest && npm run migrate` | Exit 0; includes `048_raw_bufdir_barnefattigdom.sql` |
| 2b | `npm run ingest:bufdir-barnefattigdom` (uses `.env` → `DATABASE_URL`) | Exit 0; log shows `postgres.upsert.done` with `rows_written > 0` |
| 2c | Sanity query via **Node** (example): short `tsx`/`node` script with `DATABASE_URL` using `postgres` package — `select count(*) as n from raw.bufdir_barnefattigdom` | `n` matches order of magnitude of NDJSON row count |
| 2d | Spot rows | `order by loaded_at desc limit 5`: non-null PK columns; `kommune`-level `region_code` typically 4 digits |

---

## Phase 3 — dbt `marts` layer

**Goal:** Models compile against `sources.yml`; tests pass against loaded `raw`.

| Step | Command / action | Pass |
|------|------------------|------|
| 3a | `cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt parse` | Exit 0 |
| 3b | `uv run --env-file ../ingest/.env dbt run --select indicators__bufdir_barnefattigdom` | Exit 0; table/view in `marts` |
| 3c | `uv run --env-file ../ingest/.env dbt test --select indicators__bufdir_barnefattigdom` | Exit 0 (or only **expected** warns documented in model, if any) |
| 3d | Optional repo gate | `./check-osmosis.sh` after warehouse matches committed `schema.yml` |

---

## Phase 4 — Optional product checks

- Contributor app / SQL: confirm `contents_code` / `contents_label` and `kommune_nr` null vs 4-digit behaviour match README expectations (bydel deferred).
- If `fact_kommune_indicators` is extended later, re-run join tests for this `source_id`.

---

## Outcome

- **Done:** Phases 1–3 pass on a clean clone with valid `.env`.  
- **Escalate:** HTTP 4xx/5xx from Bufdir/APIM/Klass → upstream or network; ingest 0 rows → Strapi payload or region batching logic; `dbt test` failures → grain, dims (`dim_kommune` / `dim_fylke` relationships), or stale seeds.
