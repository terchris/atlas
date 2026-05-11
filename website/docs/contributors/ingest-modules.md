# Ingest modules

Atlas's ingest layer is one folder per upstream source under [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources). Each folder is a self-contained TypeScript module that fetches from upstream and writes to `raw.*` in Postgres. This page covers the **template for writing one** — what files go where, what the `index.ts` looks like, and how scraping sources differ from API sources.

For the full end-to-end workflow that ties this into dbt and the catalogue, see [adding-a-source.md](./adding-a-source.md). For a worked example, see [data-journey.md](./data-journey.md).

---

## Conventions

- **One folder per source.** Folder name = source id (matches the catalogue id in [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/blob/main/docs/research/samfunnspuls/data-sources.md)).
- **Entry point is `index.ts`.** Exports `SOURCE_ID`, `run()`, and any types callers need.
- **manifest.yml alongside the code** — *all* structured catalogue metadata (publisher, license, periodicity, dimensions, tags, EU theme, attribution). The catalogue's customer-facing `mart_meta_*` views read from this. See the [manifest.yml schema](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema).
- **README.md alongside the code** — *prose-only* contributor notes: what the script does, observed quirks, known issues, references. Anything structured belongs in `manifest.yml`, not Markdown.
- **`run()` wraps work in `recordIngestRun()`** — the wrapper inserts into `raw.ingest_runs` and owns sql lifecycle. Source modules do NOT call `closeSql()` themselves.
- **npm script per source**: `"ingest:<id>": "tsx src/sources/<id>/index.ts"` in [`atlas-data/ingest/package.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/package.json).

The full implemented-sources catalogue (SSB, FHI, Brreg, Red Cross, Bufdir, and other providers) is in the in-source [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) (auto-generated table). New entries land there during step 6 of [adding-a-source.md](./adding-a-source.md).

---

## API source — the baseline template

Most Atlas sources are API-based (SSB PxWebAPI, FHI's PxWebAPI, Red Cross Organizations API). The standard recipe:

1. Create `atlas-data/ingest/src/sources/<source-id>/` (folder name matches the catalogue `id`).
2. Copy [`atlas-data/ingest/src/sources/ssb-08764/index.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/ssb-08764/index.ts) and adapt: new `SOURCE_ID`, new `TABLE_ID` (or fetch logic for non-SSB sources), adjust `toIndicatorRow()` if the upstream dimensions differ.
3. Write `<source-id>/README.md` — prose-only: what the script does, known quirks, known issues / TODOs, references. *No structured tables* (those live in `manifest.yml`).
4. **Bootstrap, fill, review the manifest** — three sub-steps:
    1. `npm run sources:bootstrap-manifest -- <source-id>` — fetches upstream metadata (SSB PxWebAPI table info, FHI dataset metadata, etc.) and writes a skeleton `manifest.yml` with `source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `publisher`, `periodicity`, `license` (NLOD default for SSB / FHI / KOSTRA) prefilled. The fallback template is used for sources without a structured upstream API (e.g. scraping sources, internal feeds) — those get a TODO-stamped skeleton.
    2. `npm run sources:fill-manifest-todos` — parses the per-source `README.md` and fills `description`, `attribution`, and the four `tags:` namespaces. Idempotent: only fills `TODO`/empty fields, never overwrites human-authored content. Re-running on a fully-populated manifest is a no-op.
    3. **Review + author `dimensions:` by hand.** The auto-fill is heuristic — `tags.topic` uses regex first-match-wins (order matters: `ngo-supply` before `reference` before `income`/`education`/`health`/`social`/`demographics`), `tags.geo` uses kommune > fylke > bydel priority. Spot-check the result. The `dimensions:` block (one entry per upstream dimension with `code`, `meaning`, `value_format`, `notes`) is editorial content the catalogue can't compute — write it by hand from the source's `## Response shape` knowledge or by inspecting upstream metadata. For sources whose READMEs don't follow the standard `## Upstream` table convention, add an entry to `MANUAL_OVERRIDES` in `fill-manifest-todos.ts` rather than hand-editing every field.
    4. Commit the `manifest.yml` alongside the source code. After commit, **`npm run ingest:<source>` does not modify the manifest** — future field changes happen via PR like any other code change. Avoids "PR diff has mystery edits from a CI run."
5. Add `"ingest:<source-id>": "tsx src/sources/<source-id>/index.ts"` to [`atlas-data/ingest/package.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/package.json).
6. Regenerate the implemented-sources index: `cd atlas-data/dbt && uv run python scripts/build_sources_seed.py --readme`. This rebuilds the seed CSVs and the auto-generated table in [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md).
7. **Refresh the reports / indicators investigation.** Open [`INVESTIGATE-reports-and-indicators-from-catalogue.md`](https://github.com/terchris/atlas/blob/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-reports-and-indicators-from-catalogue.md) and follow the *Maintenance* checklist at the bottom: bump the source count, slot the new source into a thematic cluster, walk the 10 reports to identify which gain a column, and note any new dimensions / crosswalks the source introduces. This must land in the same commit as the source itself — the doc is the menu, and the menu has to match what the catalogue actually serves.
8. **Bring the data + catalog to consistent state**: `npm run ingest:<source-id>` to populate the new `raw.<source>` table, then `npm run dbt:rebuild` to rebuild marts + apply the api_v1 wrappers + run tests + regenerate dbt docs against the new shape. Without this last step, `marts.*` won't include any models that join the new source, and `target/catalog.json` (which the dbt docs UI introspects) will reference a stale schema.

Typical per-source effort for an SSB table: ~30 minutes. API ingests from NGOs (e.g. Red Cross) similar.

### When to re-run what — the trigger matrix

After any change to dbt models, manifests, or seeds, several artefacts can fall out of sync. The matrix below names the right command for each kind of change.

| You changed | Run | What it does |
|---|---|---|
| Added a new ingest source (new folder + manifest) | `npm run ingest:<source>` then `npm run dbt:rebuild` | Populates `raw.<source>`; rebuilds marts + api_v1 + tests + docs against the new raw table |
| Edited a model SQL (`models/marts/.../*.sql`) | `npm run dbt:rebuild` | `dbt run` rebuilds the touched models + downstream; `apply-api-v1.sh` recreates api_v1 wrappers; tests verify; docs regenerate |
| Edited a `schema.yml` description | `npm run dbt:rebuild` | Same as above — descriptions flow from schema.yml → dbt-osmosis → COMMENT ON COLUMN → PostgREST spec → `target/catalog.json` |
| Edited a `manifest.yml` | `cd ../dbt && uv run python scripts/build_sources_seed.py --readme` then `npm run dbt:rebuild` | Regenerates the `_sources_manifest` + `_sources_dimensions` seed CSVs, then runs the cheap end of the pipeline |
| Added a new committed seed CSV | `npm run bootstrap -- --only seed,run,api,test,docs` | Loads the seed, rebuilds dependents, refreshes |
| Cluster reset (post-rancher-desktop reset, fresh laptop) | `npm run bootstrap` | Full 8-phase pipeline — migrate, refresh raw-writing seeds, all ingests, dbt seed/run, api_v1, test, docs |

`npm run dbt:rebuild` is shorthand for `npm run bootstrap -- --only seed,run,api,test,docs` — runs the five cheap phases that any model/seed/manifest change requires. **~35-50 min total** (dbt test is the long pole at ~30-45 min on full-volume facts). For fast iteration when you don't need test verification, use `npm run bootstrap -- --only seed,run,api,docs` (~5-8 min). Idempotent — safe to re-run.

### How descriptions flow — schema.yml → PostgREST → MCP

When you write a description in `schema.yml`, it ends up in *seven* places. Knowing the chain helps when something goes stale.

```
schema.yml description
  │
  ├─→ dbt-osmosis  (propagates the description ACROSS the dbt graph,
  │                  so dim_kommune.kommune_nr's description flows to
  │                  every downstream mart/api_v1 model that selects it)
  │
  ├─→ pg_description  (Postgres-native COMMENT ON; written by dbt's
  │                    +persist_docs setting on every dbt run for
  │                    every model + seed; written by api_v1_generated.sql
  │                    for api_v1.* wrappers; written by raw migrations
  │                    for raw.*)
  │
  ├─→ PostgREST OpenAPI spec  (auto-included as `description` per
  │                            column whenever pg_description has a row)
  │
  ├─→ /data/[schema]/[table]  (customer-frontend table viewer, reads
  │                            the OpenAPI spec)
  │
  ├─→ atlas-frontend api-types.ts  (typed surface, regenerated via
  │                                  `npm run api:types`)
  │
  ├─→ target/catalog.json  (dbt docs UI, refreshed by `dbt docs generate`
  │                         in bootstrap Phase 8)
  │
  └─→ MCP tool definitions  (LLM agents introspecting via Postgres MCP
                              or dbt-MCP read pg_description / manifest.json)
```

The `+persist_docs` config in [`atlas-data/dbt/dbt_project.yml`](https://github.com/terchris/atlas/blob/main/atlas-data/dbt/dbt_project.yml) is what physically pushes schema.yml descriptions into Postgres. Without it, only api_v1.* views had descriptions (via `apply-api-v1.sh`'s explicit COMMENT ON statements); marts.* and seed-loaded marts had none, which made the multi-schema PostgREST surface useless to AI agents discovering Atlas through the marts schema. dbt-osmosis (propagation) and persist_docs (DB write) are complementary, not competing — Atlas needs both.

**Raw.\*** is the exception: descriptions on `raw.*` columns come from explicit `COMMENT ON COLUMN` statements in the migration SQL files (e.g. `migrations/032_raw_fhi_innvkat.sql`), not from dbt sources YAML. If you want richer raw.* descriptions, edit the migration; persist_docs doesn't apply to dbt sources.

### `index.ts` required structure

- **`import` shared helpers** from `../../lib/*` (`pxweb`, `klass`, `postgres`, `logger`, `output`, `types`). Don't reimplement what's in `lib/`.
- **Declare row type inline.** Do not add it to `lib/types.ts` — that's reserved for cross-cutting types.
- **Export `SOURCE_ID`** as a constant matching the catalogue `id` exactly (e.g. `"ssb-08764"`).
- **Module-level constants**: `TABLE_ID`, `TARGET_TABLE`, `OUTPUT_PATH`, `WRITE_COLUMNS`, `CONFLICT_KEYS`.
- **Declare `<SourceName>Summary` type** for the run-return shape.
- **Export `async function run(): Promise<<SourceName>Summary>`** — entry point.
- **Include `toRow(px: PxRow): <RowType>`** that validates every upstream dimension exists and returns the row.
- **End with `run().catch(err => { logger.error(...); process.exit(1); })`** — top-level invocation.

### `index.ts` forbidden patterns

- ❌ No inline `writeNdjson` — use [`lib/output.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/lib/output.ts).
- ❌ No inline Postgres client — use [`lib/postgres.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/lib/postgres.ts).
- ❌ No hard-coded credentials — read `DATABASE_URL` from env via the lib.
- ❌ No NDJSON-only mode when `DATABASE_URL` is set: with a database configured, writing to Postgres is required.

### Per-source README structure

The README is **prose-only** — quirks, decisions, debugging audit trail. Anything *structured* (provider, URL, license, attribution, dimension semantics, tags) belongs in `manifest.yml`. The README never duplicates manifest fields.

Required sections, in this order:

1. `# <source-id>` header + one-line description
2. **What the script does** — 1–3 sentences
3. **Known quirks** — observations from actually running the script (prefix codes, default filter behaviour, unexpected suppressions, server-side guards that change response shape, etc.)
4. **Known issues / TODOs** — open items the next maintainer should know about
5. **References** — links to upstream docs, shared libs, related decisions

Treat the README as the audit trail for someone debugging this source three months later when upstream changes shape. The catalogue entry — what shoppers see — is generated from `manifest.yml`, not the README.

### Per-source `manifest.yml`

Every source folder ships a `manifest.yml` that drives the catalogue's `marts._sources_manifest` and `marts._sources_dimensions` seeds. Required fields are documented in detail in [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md#manifestyml-schema):

- 10 top-level fields (`source_id`, `upstream_id`, `upstream_url`, `upstream_title`, `description`, `publisher`, `license`, `license_url`, `periodicity`, `eu_theme`, `attribution`)
- 4-namespace `tags:` map (`provider`, `topic`, `geo`, `cadence`)
- `dimensions:` list — one entry per upstream dimension with `code`, `meaning`, `value_format`, `notes`

`build_sources_seed.py` validates required fields + the `eu_theme` allowlist + the `dimensions:` shape, then emits two seed CSVs the dbt project loads as `marts._sources_manifest` and `marts._sources_dimensions`. After commit, the manifest is human-authored — ingest runs do NOT modify it.

---

## Scraping sources — additional convention {#scraping-sources}

NGO scraping sources (those that fetch and parse HTML) follow an **extended folder layout** on top of the baseline above. Design rationale and the full decision log live in [INVESTIGATE-ngo-scraping-infrastructure.md](../ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md); this section is the practical checklist.

### Folder layout

```
sources/<source-slug>/
├── README.md          — source overview, refresh cadence, owner contact, known quirks
├── index.ts           — orchestration: ingest_runs start/end, Crawlee, discover → parse → upsertRecord
├── discover.ts        — sitemap or HTML-index enumeration; reads/writes raw.sitemap_log; returns fetch/skip decisions and orphans
├── parse.ts           — pure function (html, url) → Record; NFC normalization here; no I/O
├── overrides.json     — manual overrides (slug → kommune, name → orgnr, etc.)
├── types.ts           — TS types for the source's record shape
└── __tests__/
    ├── parse.test.ts  — golden-file tests: parse(fixture.html) deep-equals fixture.expected.json
    └── fixtures/
        ├── <case-a>.html
        ├── <case-a>.expected.json
        └── …          — aim for 2–3 fixtures per source
```

### File responsibilities

- **`parse.ts`** is pure: no DB, no HTTP, no filesystem. Takes raw HTML + URL, returns a typed record. All Unicode NFC normalization happens here at the parser boundary.
- **`discover.ts`** owns discovery I/O: fetches sitemap(s) or HTML index; calls `readPriorState` and `upsertDiscovered` against `raw.sitemap_log`; returns the list of URLs to fetch and the list of orphans.
- **`index.ts`** orchestrates end-to-end: `startRun` to acquire the concurrent-run lock, creates the Crawlee crawler, drives discover → Crawlee fetch loop → `parse.ts` → `upsertRecord` (from [`src/lib/scraping/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/scraping)), propagates orphans to `is_active=false`, writes the `finishRun` row.
- **`overrides.json`** and **`types.ts`** carry source-specific configuration and types.

### Mandatory raw-table columns

Every scraper's `raw.<source>_*` **parent** table must include these on top of source-specific fields:

| Column | Type | Purpose |
|---|---|---|
| `url` | `TEXT NOT NULL UNIQUE` (or PK) | Join key against `raw.sitemap_log.url`. Store verbatim; no normalization. |
| `record_hash` | `TEXT NOT NULL` | sha256 of canonical JSON of the extracted record. Skip signal. |
| `html_raw_hash` | `TEXT` (nullable) | Audit-only; for template-drift forensics via `mart_ingest_health`. |
| `is_active` | `BOOLEAN NOT NULL DEFAULT true` | Flipped to `false` on fetch-time 404 or sitemap orphan. |
| `loaded_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Project convention. |

Child tables (activities under a chapter, sub-locations under a branch) do **not** carry these columns — they're owned by the parent row and delete-and-reinserted when the parent's `record_hash` changes.

### Migration naming

- Per-source tables: `NNN_raw_<source_slug>.sql` — e.g. `NNN_raw_folkehjelp_chapters.sql`.
- Shared infrastructure tables already live at `raw.ingest_runs` and `raw.sitemap_log`. Don't re-create them.
- NNN is a repository-wide sequential counter; take the next free number (see `ls atlas-data/migrations/`).

### Environment variables

Scraping sources read three env vars from the ingest `.env` — documented in [`atlas-data/ingest/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/README.md) under "Environment variables":

- `ATLAS_SCRAPE_CONTACT_EMAIL` (required; hard-fails if unset)
- `CRAWLEE_STORAGE_DIR` (optional; dev uses repo-local `.crawlee-cache/`, prod uses an ephemeral in-pod path)
- `CRAWLEE_LOG_LEVEL` (optional; dev `INFO`, prod `WARNING`, `DEBUG` for troubleshooting)

### Checklist for a new scraping source

1. Confirm the investigation doctrine: check native API → check sitemap → check `robots.txt` → optional outreach email.
2. Create the folder under `src/sources/<slug>/` with the layout above.
3. Add the migration `NNN_raw_<slug>.sql`; include the mandatory columns.
4. Build the Crawlee-based pipeline using the shared library at [`src/lib/scraping/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/lib/scraping) (UA, hashers, robots, sitemap_log, ingest_runs, upsertRecord, kv).
5. Add 2–3 golden-file fixtures under `__tests__/fixtures/`; the parser test runs via `vitest`.
6. Add an `"ingest:<slug>"` script to `package.json`; add a row to the implemented-sources table.
7. The corresponding `supply__<slug>_*.sql` dbt staging model is outside the ingest module's scope — each per-NGO PLAN handles its own staging and activity-to-category mapping.

---

## Cross-references

- [adding-a-source.md](./adding-a-source.md) — the full 11-step workflow this template fits into
- [data-journey.md](./data-journey.md) — worked example (SSB 08764)
- [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md) — implemented-sources catalogue (one row per source, current state of the world)
- [`atlas-data/ingest/src/sources/ssb-08764/index.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/ssb-08764/index.ts) — the canonical SSB-style template
- [INVESTIGATE-ngo-scraping-infrastructure.md](../ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md) — design rationale for the scraping toolkit
- [PLAN-001-scraping-infrastructure.md](../ai-developer/plans/completed/PLAN-001-scraping-infrastructure.md) — what shipped in `src/lib/scraping/`
