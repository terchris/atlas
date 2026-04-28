# Ingest modules

Atlas's ingest layer is one folder per upstream source under [`atlas-data/ingest/src/sources/`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources). Each folder is a self-contained TypeScript module that fetches from upstream and writes to `raw.*` in Postgres. This page covers the **template for writing one** — what files go where, what the `index.ts` looks like, and how scraping sources differ from API sources.

For the full end-to-end workflow that ties this into dbt and the catalogue, see [adding-a-source.md](./adding-a-source.md). For a worked example, see [data-journey.md](./data-journey.md).

---

## Conventions

- **One folder per source.** Folder name = source id (matches the catalogue id in [`docs/research/samfunnspuls/data-sources.md`](https://github.com/terchris/atlas/blob/main/docs/research/samfunnspuls/data-sources.md)).
- **Entry point is `index.ts`.** Exports `SOURCE_ID`, `run()`, and any types callers need.
- **README.md alongside the code.** Implementation notes, observed quirks, known issues. Strategic / catalogue-level metadata stays in the data-sources catalogue, not duplicated here.
- **npm script per source**: `"ingest:<id>": "tsx src/sources/<id>/index.ts"` in [`atlas-data/ingest/package.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/package.json).

The full implemented-sources catalogue (currently 20 sources — SSB, FHI, Brreg, Red Cross) is in the in-source [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md). New entries land there during step 6 of [adding-a-source.md](./adding-a-source.md).

---

## API source — the baseline template

Most Atlas sources are API-based (SSB PxWebAPI, FHI's PxWebAPI, Red Cross Organizations API). The standard recipe:

1. Create `atlas-data/ingest/src/sources/<source-id>/` (folder name matches the catalogue `id`).
2. Copy [`atlas-data/ingest/src/sources/ssb-08764/index.ts`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/ssb-08764/index.ts) and adapt: new `SOURCE_ID`, new `TABLE_ID` (or fetch logic for non-SSB sources), adjust `toIndicatorRow()` if the upstream dimensions differ.
3. Write `<source-id>/README.md` describing upstream, response shape, known quirks, how to run, references back to the catalogue.
4. Add a row to the implemented-sources table in [`atlas-data/ingest/src/sources/README.md`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/src/sources/README.md).
5. Add `"ingest:<source-id>": "tsx src/sources/<source-id>/index.ts"` to [`atlas-data/ingest/package.json`](https://github.com/terchris/atlas/blob/main/atlas-data/ingest/package.json).
6. Ensure the corresponding catalogue entry is up to date.

Typical per-source effort for an SSB table: ~30 minutes. API ingests from NGOs (e.g. Red Cross) similar.

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

Required sections, in this order:

1. `# <source-id>` header + one-line description
2. **What the script does** — 1–3 sentences
3. **Upstream** — table with: Provider, Table id, URL, Auth, Format, Licence, Attribution
4. **Response shape** — table of dimensions and their value counts
5. **Row shape emitted** — one JSON sample, including a suppressed example if relevant
6. **How to run locally** — the `npm run ingest:<source-id>` command
7. **Known quirks** — observations from actually running the script (prefix codes, default filter behaviour, unexpected suppressions, etc.)
8. **Known issues / TODOs** — open items the next maintainer should know about
9. **References** — catalogue entry, shared libs, related docs

Treat the README as the audit trail for someone debugging this source three months later when upstream changes shape.

---

## Scraping sources — additional convention

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
