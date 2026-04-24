# Plan 001: Scraping infrastructure

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Active

**Goal**: Ship the shared scraping toolkit defined in [INVESTIGATE-ngo-scraping-infrastructure.md](../backlog/INVESTIGATE-ngo-scraping-infrastructure.md) — Crawlee dependency, two raw tables (`raw.ingest_runs`, `raw.sitemap_log`), the shared TypeScript library under `ingest/src/lib/scraping/` with test coverage, the minimal `mart_ingest_health` dbt view, env-var conventions, and the per-source folder convention. After this plan, per-NGO scrape PLANs (Folkehjelp first) can implement sources against a stable foundation without re-litigating infrastructure.

**Last Updated**: 2026-04-24

**Investigation**: [INVESTIGATE-ngo-scraping-infrastructure.md](../backlog/INVESTIGATE-ngo-scraping-infrastructure.md) — 25 resolved Q's, zero open.
**Prerequisites**: none (all foundation already in place — Postgres, dbt, ingest repo, migrate runner).
**Blocks**: [INVESTIGATE-folkehjelp-supply.md](../backlog/INVESTIGATE-folkehjelp-supply.md)'s scrape PLAN — the first per-NGO consumer of this infrastructure.
**Priority**: Medium

---

## Overview

Six phases, estimated **~10–12 h**. The investigation's 6–8h estimate pre-dates Q19/Q20/Q22/Q23/Q25, which added sitemap_log, mandatory raw columns, the concurrent-run lock, the test suite, and the file-responsibilities convention. The toolkit surface roughly doubled; adjust accordingly.

**Built in PLAN-001:**

- **Dependencies**: `crawlee`, `fast-json-stable-stringify` added to `atlas-data-repo/ingest/package.json`. Dev deps: `vitest`, `pg-mem`.
- **Migrations**: `023_raw_ingest_runs.sql`, `024_raw_sitemap_log.sql`.
- **Shared library** under `atlas-data-repo/ingest/src/lib/scraping/`:
  - `ua.ts` — env-driven UA builder, hard-fail on missing `ATLAS_SCRAPE_CONTACT_EMAIL`.
  - `record_hash.ts` — canonical JSON + NFC + sha256 hasher.
  - `html_raw_hash.ts` — body-level hasher (audit-only).
  - `robots.ts` — `robots.txt` fetcher and per-URL allow/deny verifier.
  - `sitemap_log.ts` — sitemap-log reader/writer, orphan detection, fetch-skip decisions.
  - `ingest_runs.ts` — run-lifecycle writer with concurrent-run lock.
  - `upsert_record.ts` — generic `upsertRecord()` helper for the §C.5 mandatory columns.
  - `kv.ts` — thin wrapper around Crawlee's `KeyValueStore` for cache reads/writes.
  - `index.ts` — module re-exports.
- **Tests** (`vitest`):
  - `__tests__/` folder co-located under `src/lib/scraping/`.
  - Unit + integration coverage per §G.2 of the investigation.
- **dbt model**: `mart_ingest_health` (3-column minimal view per Q14).
- **`.gitignore`** entry for `.crawlee-cache/` under `atlas-data-repo/ingest/`.
- **Documentation**:
  - New `atlas-data-repo/ingest/README.md` listing the three env vars (§F).
  - New `atlas-data-repo/ingest/src/sources/README.md` documenting the per-source folder convention (§B.3).
  - Extended [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with `source_slug`, `record_hash`, `html_raw_hash`, `url`, `raw.ingest_runs`, `raw.sitemap_log`.

**NOT built in PLAN-001:**

- Any per-NGO scraper (Folkehjelp, NKS, Frelsesarmeen, …) — each is a follow-up PLAN citing this infrastructure.
- The `raw.html_archive` upgrade-path table from §C.1.2 — out of scope for v1 per the investigation.
- Dagster integration — Dagster is a separate platform-service initiative; this PLAN's app-layer lock is designed to coexist with it (see §E.3.1 of the investigation).
- CI pipeline changes — the tests run locally via `npm test`; integrating with the repo's existing CI is a separate small PR if warranted.

---

## Phase 1: Dependencies and scaffolding — DONE

### Tasks

- [x] 1.1 Install runtime deps: `crawlee ^3.16.0`, `fast-json-stable-stringify ^2.1.0`. Major-pinned via caret per existing project convention.
- [x] 1.2 Install dev deps: `vitest ^4.1.5`, `pg-mem ^3.0.14`.
- [x] 1.3 Added `"test": "vitest run --passWithNoTests"` and `"test:watch": "vitest"` to `package.json` scripts. The `--passWithNoTests` flag makes the empty-suite interim state (pre-Phase 3) a clean exit-0 instead of exit-1.
- [x] 1.4 Created `atlas-data-repo/ingest/vitest.config.ts` with the include glob from the PLAN.
- [x] 1.5 Created `src/lib/scraping/` + `__tests__/` subfolder + `index.ts` stub. Stub contains only a module-level comment listing the Phase 3/4 exports to land here + `export {};` to keep TypeScript happy until real exports land.
- [x] 1.6 Added `.crawlee-cache/` to `atlas-data-repo/ingest/.gitignore` (file already existed; appended the new entry).
- [x] 1.7 Extended the **existing** `atlas-data-repo/ingest/README.md` with an "Environment variables" section (inserted between "Install" and "Run one source"). **Deviation from plan**: the PLAN said "create" but the README already existed with substantive content describing the current ingest flow — extending it was the correct action. Env-var table matches §F of the investigation, with a clarifying note that non-scraper modules (SSB, FHI, Brreg, Red Cross API) don't read these variables.

### Validation

```bash
cd atlas-data-repo/ingest
npm run typecheck
npm test   # should run zero tests cleanly — "No test files found" is acceptable
```

User confirms phase is complete.

---

## Phase 2: Migrations for `raw.ingest_runs` and `raw.sitemap_log`

### Tasks

- [ ] 2.1 Create `atlas-data-repo/migrations/023_raw_ingest_runs.sql` with the schema from §E.3 of the investigation. Add a partial unique index to make the concurrent-run lock (§E.3.1) a database-enforced constraint, not just an application-layer check:
  ```sql
  CREATE UNIQUE INDEX raw_ingest_runs_one_inprogress_per_source
      ON raw.ingest_runs (source_slug)
   WHERE finished_at IS NULL;
  ```
  Include this index in the migration so a second concurrent `INSERT` is rejected at the DB layer (defense in depth against a race between the SELECT and the INSERT).
- [ ] 2.2 Create `atlas-data-repo/migrations/024_raw_sitemap_log.sql` with the schema from §C.2. The PK on `(source_slug, url)` is the only index needed for v1.
- [ ] 2.3 Run `npm run migrate` from `atlas-data-repo/ingest/`. Confirm both tables exist and are empty.
- [ ] 2.4 Add source entries for both tables to a new `atlas-data-repo/dbt/models/shared/sources.yml` (per [P1S.Q1]) — infrastructure tables aren't supply or indicators, so they get their own folder. Create the `shared/` folder if it doesn't exist.

### Validation

```bash
cd atlas-data-repo/ingest
npm run migrate
psql $DATABASE_URL -c "\d raw.ingest_runs"
psql $DATABASE_URL -c "\d raw.sitemap_log"
psql $DATABASE_URL -c "\di raw.raw_ingest_runs_one_inprogress_per_source"
```

Both tables exist, the partial unique index exists. User confirms phase is complete.

---

## Phase 3: Shared library — UA, hashers, robots

### Tasks

- [ ] 3.1 **`ua.ts`** — exports `buildUserAgent(): string` and a cached `USER_AGENT` constant. Reads `process.env.ATLAS_SCRAPE_CONTACT_EMAIL`; throws a descriptive error if unset or empty (per [Q13]). Format: `Atlas/0.1 (https://github.com/terchris/atlas; <email>)`. Hard-code the version `0.1` and repo URL as module constants.
- [ ] 3.2 **`record_hash.ts`** — exports `recordHash(record: unknown): string`. Uses `fast-json-stable-stringify` for canonical serialization, then `node:crypto` `createHash('sha256')` → hex digest. 64 hex chars (per [Q18] / [Q21]).
- [ ] 3.3 **`html_raw_hash.ts`** — exports `htmlRawHash(body: string): string`. Canonicalization: strip `<head>…</head>`, strip known per-render attributes (CSRF `<meta>` tokens, nonce attributes), collapse whitespace runs. Then sha256. Per §C.3.1. Keep the canonicalization conservative; remember this is an audit-only signal so perfect determinism isn't required.
- [ ] 3.4 **`robots.ts`** — exports `fetchRobots(host: string): Promise<RobotsRules>` and `isAllowed(rules: RobotsRules, url: string, userAgent: string): boolean`. Use a simple parser (or a tiny dep like `robots-parser` — check npm for active maintenance before adding). Per §A.3 + §D.4 the investigation requires re-checking robots.txt on every run, so this module gets called from `discover.ts` in per-source folders.
- [ ] 3.5 **Tests** under `src/lib/scraping/__tests__/`:
  - `ua.test.ts` — throws on missing env; produces exact UA string on valid env.
  - `record_hash.test.ts` — same input → same hash; key reordering in source object → same hash (canonicalization); NFC vs NFD strings in the record → same hash (spec via test: `recordHash({name: 'Oslo'.normalize('NFD')}) === recordHash({name: 'Oslo'.normalize('NFC')})` after the parser's own NFC normalization; documents why the normalize-before-hash convention exists).
  - `html_raw_hash.test.ts` — whitespace differences → same hash; CSRF/nonce attributes → same hash; genuine content difference → different hash.
  - `robots.test.ts` — given fixture robots.txt files, verifies allow/deny for representative URLs; `Crawl-Delay` parsing if we implement it.
- [ ] 3.6 Update `src/lib/scraping/index.ts` with re-exports of the four modules.

### Validation

```bash
cd atlas-data-repo/ingest
npm run typecheck
npm test -- src/lib/scraping/__tests__/
```

All tests pass; `npm run typecheck` clean. User confirms.

---

## Phase 4: Shared library — sitemap_log, ingest_runs, upsert helper, KV wrapper

### Tasks

- [ ] 4.1 **`sitemap_log.ts`** — implements the §C.2 procedure:
  - `readPriorState(client, sourceSlug): Promise<Map<string, {stored_lastmod: Date | null, last_seen_at: Date}>>` — reads current `raw.sitemap_log` state for a source. Must be called *before* any writes in the run (per [Q19] correctness requirement).
  - `decideFetch(priorState, discoveredUrls, rawRowExists): Array<{url, action: 'fetch' | 'skip'}>` — pure function; implements the four-condition skip rule from §C.2 step 3, including NULL handling and the "no raw row" clause.
  - `upsertDiscovered(client, sourceSlug, discoveredUrls): Promise<void>` — writes the current `lastmod` and `last_seen_at = now()` for every URL discovered this run. Runs *after* `decideFetch`.
  - `detectOrphans(client, sourceSlug, runStartedAt): Promise<string[]>` — returns URLs where `last_seen_at < runStartedAt` for this `source_slug`.
- [ ] 4.2 **`ingest_runs.ts`** — implements the §E.3.1 lock:
  - `startRun(client, sourceSlug): Promise<{run_id: bigint; started_at: Date}>` — inserts with `finished_at = NULL`. If the partial unique index from Phase 2.1 rejects (conflict on existing in-progress row), fetch the conflicting row and throw a clear error (`"Source <slug> is already being ingested by run_id=<n> (started <ts>); aborting."`).
  - `finishRun(client, runId, { exit_code, rows_scraped, rows_parsed, rows_skipped, warnings_count, errors_count, notes }): Promise<void>` — sets `finished_at = now()` + counters.
- [ ] 4.3 **`upsert_record.ts`** — exports `upsertRecord(client, tableName, record, { skipIfHashMatches: boolean }): Promise<'inserted' | 'updated' | 'skipped'>`. Generic upsert for the §C.5 mandatory columns (`url`, `record_hash`, `html_raw_hash`, `is_active`, `loaded_at`) plus source-specific columns passed through. The skip-if-hash-matches short-circuits the DB write when `record_hash` equals the stored value (§C.3).
- [ ] 4.4 **`kv.ts`** — thin wrapper: a factory returning a Crawlee `KeyValueStore` scoped to a per-source subdirectory (respects `CRAWLEE_STORAGE_DIR`). Exposes `get(key)`, `set(key, body, metadata)`, `has(key)`. Mostly a convenience layer so per-source code doesn't touch Crawlee internals directly.
- [ ] 4.5 **Tests** under `src/lib/scraping/__tests__/`, against `pg-mem`:
  - `sitemap_log.test.ts` — first-run yields zero orphans and zero skips; second run with same URLs skips; second run with one URL removed detects it as orphan; NULL `lastmod` always fetches; URL with no prior raw row always fetches.
  - `ingest_runs.test.ts` — `startRun` then `startRun` for same slug throws; `startRun` then `finishRun` then `startRun` succeeds (lock released); the thrown error includes the conflicting `run_id`.
  - `upsert_record.test.ts` — unchanged hash skips; changed hash updates; new URL inserts; `is_active=false` preserved on orphan (passed-in value wins over default `true`).
- [ ] 4.6 Update `src/lib/scraping/index.ts` with re-exports of the four new modules.

### Validation

```bash
cd atlas-data-repo/ingest
npm run typecheck
npm test
```

All tests pass (unit tests from Phase 3 still green; new Phase 4 tests pass). `npm run typecheck` clean. User confirms.

---

## Phase 5: `mart_ingest_health` dbt model

### Tasks

- [ ] 5.1 Create `atlas-data-repo/dbt/models/marts/mart_ingest_health.sql` with the 3-column view from §E.3 of the investigation (`source_slug`, `last_run_at`, `last_status`). Use `distinct on (source_slug)` ordered by `finished_at desc` to return the most-recent finished row per source. **Add a SQL comment at the top** (per [P1S.Q4]) noting that an empty result is expected until the first scraper writes to `raw.ingest_runs` — something like `-- NOTE: empty until the first scraper writes to raw.ingest_runs. Empty output is correct, not a wiring bug.`
- [ ] 5.2 Add a schema.yml entry for the new mart. Columns: `source_slug` (not_null, unique), `last_run_at` (not_null), `last_status` (accepted_values: `['ok', 'fail']`).
- [ ] 5.3 Add the mart to the ERD file at [`docs/stack/erd.md`](../../../stack/erd.md) (per the "surfaces in docs/stack/erd.md once built" note in the Files-produced list).
- [ ] 5.4 Run `dbt build` and verify PASS count increased by the expected number of new tests (+3 for the three assertions above). Zero errors.

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt build
uv run --env-file ../ingest/.env dbt show --inline "select * from marts.mart_ingest_health"
```

Empty result is expected (no scrapers have written to `raw.ingest_runs` yet). `dbt build` passes. User confirms.

---

## Phase 6: Per-source documentation and wrap-up

### Tasks

- [ ] 6.1 Create `atlas-data-repo/ingest/src/sources/README.md` documenting the per-source folder convention from §B.3 — the folder listing, the **File responsibilities** paragraph (Q25), migration naming pattern, npm script naming pattern. Include a "checklist for adding a new scraper source" section mirroring PLAN-002's Red Cross source README style.
- [ ] 6.2 Extend [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with sections for:
  - `source_slug` (identifier format, kebab-case, matches npm script suffix)
  - `record_hash` + `html_raw_hash` (column semantics)
  - `url` (verbatim sitemap URL, no normalization)
  - `raw.ingest_runs`, `raw.sitemap_log` (shared infrastructure tables)
- [ ] 6.3 Add a short "Scraping infrastructure" cross-reference to [`atlas-data-repo/CONTRIBUTING.md`](../../../../atlas-data-repo/CONTRIBUTING.md) pointing to the investigation doc and this plan, so the existing CONTRIBUTING's raw-table convention guidance is discoverable from scraper authoring.
- [ ] 6.4 Final check: run all gates.
  ```bash
  cd atlas-data-repo/ingest
  npm run typecheck
  npm test

  npm run migrate   # should be a no-op after Phase 2

  cd ../dbt
  uv run --env-file ../ingest/.env dbt build
  ```
- [ ] 6.5 Move this plan to `docs/ai-developer/plans/completed/PLAN-001-scraping-infrastructure.md`; update Status to `Completed` with the completion date and a one-line summary of what shipped.

### Validation

All gates pass. User confirms by reading the three new README/docs files and agreeing they're useful entry points for the next per-source PLAN.

---

## Acceptance Criteria

- [ ] `npm run typecheck` clean in `atlas-data-repo/ingest/`.
- [ ] `npm test` passes with the full shared-lib suite (unit + integration via pg-mem).
- [ ] `npm run migrate` applies both new migrations cleanly (and is idempotent on re-run).
- [ ] `dbt build` passes; `marts.mart_ingest_health` exists and is queryable (empty until first scraper runs).
- [ ] The partial unique index on `raw.ingest_runs (source_slug) WHERE finished_at IS NULL` exists and rejects concurrent inserts.
- [ ] Three env vars are documented in `atlas-data-repo/ingest/README.md`. Running any script with `ATLAS_SCRAPE_CONTACT_EMAIL` unset yields a clear startup error.
- [ ] `.crawlee-cache/` is gitignored under `atlas-data-repo/ingest/`.
- [ ] Per-source folder convention is documented in `atlas-data-repo/ingest/src/sources/README.md`.
- [ ] `docs/stack/naming-conventions.md` covers the new columns and tables.
- [ ] No per-NGO scraper is implemented as part of this PLAN (that's a follow-up).

---

## Implementation Notes

- **Postgres client**: the existing `ingest/src/lib/postgres.ts` module presumably exports a client factory; reuse it for the sitemap_log / ingest_runs / upsert code rather than constructing new clients. Match the existing convention (pooled vs single connection, transaction style).
- **NFC normalization** (Q21): callers of `recordHash` are responsible for normalizing strings at the parser boundary. `record_hash.ts` itself does not normalize — if it did, the record object in memory would still contain non-NFC strings and could diverge from what's written to the DB. Put the normalization in `parse.ts` for each source, tested via the record_hash unit tests.
- **Partial unique index** (Q22): the investigation describes the lock as an application-layer check, but backing it with a database-enforced partial unique index on `(source_slug) WHERE finished_at IS NULL` makes it race-free even if two processes run the SELECT simultaneously. The SELECT-then-informative-error code path still exists for good error messaging; the DB index is the correctness guarantee.
- **Crawlee version pinning**: lock to a specific major version in `package.json` (e.g., `"crawlee": "^3.x.y"`). Crawlee has had breaking changes at major versions; unpinning risks silent regressions.
- **pg-mem compatibility**: pg-mem supports most Postgres features but not all (e.g., full-text search, some window functions). The sitemap_log and ingest_runs queries are plain CRUD so pg-mem should suffice. If something doesn't work, fall back to a testcontainer-based Postgres or ignore the integration test locally and let CI run it.
- **dbt sources.yml placement** (Phase 2.4): the investigation doesn't specify, and PLAN-002 put `redcross_branches` under the `supply/` folder's sources. Whether `ingest_runs` and `sitemap_log` belong under `supply/sources.yml` or a new `shared/sources.yml` is a small call — they're infrastructure, not supply. Pick whichever reads more naturally; `shared/` feels slightly better.
- **Crawlee `KeyValueStore` init**: Crawlee reads `CRAWLEE_STORAGE_DIR` on first import and caches the path. Make sure the env var is set *before* the first `import` — typically via `dotenv` at process start or via `--env-file=.env` on the tsx command (existing convention in `package.json` scripts already does this).

---

## Files to Modify

**New files:**
- `atlas-data-repo/ingest/src/lib/scraping/ua.ts`
- `atlas-data-repo/ingest/src/lib/scraping/record_hash.ts`
- `atlas-data-repo/ingest/src/lib/scraping/html_raw_hash.ts`
- `atlas-data-repo/ingest/src/lib/scraping/robots.ts`
- `atlas-data-repo/ingest/src/lib/scraping/sitemap_log.ts`
- `atlas-data-repo/ingest/src/lib/scraping/ingest_runs.ts`
- `atlas-data-repo/ingest/src/lib/scraping/upsert_record.ts`
- `atlas-data-repo/ingest/src/lib/scraping/kv.ts`
- `atlas-data-repo/ingest/src/lib/scraping/index.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/ua.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/record_hash.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/html_raw_hash.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/robots.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/sitemap_log.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/ingest_runs.test.ts`
- `atlas-data-repo/ingest/src/lib/scraping/__tests__/upsert_record.test.ts`
- `atlas-data-repo/ingest/vitest.config.ts`
- `atlas-data-repo/ingest/README.md`
- `atlas-data-repo/ingest/src/sources/README.md`
- `atlas-data-repo/migrations/023_raw_ingest_runs.sql`
- `atlas-data-repo/migrations/024_raw_sitemap_log.sql`
- `atlas-data-repo/dbt/models/marts/mart_ingest_health.sql`

**Modified files:**
- `atlas-data-repo/ingest/package.json` — new deps, new scripts.
- `atlas-data-repo/ingest/.gitignore` — add `.crawlee-cache/` (create file if absent).
- `atlas-data-repo/dbt/models/marts/schema.yml` — entry for `mart_ingest_health`.
- `atlas-data-repo/dbt/models/shared/sources.yml` — entries for `raw.ingest_runs` and `raw.sitemap_log` (new folder per [P1S.Q1]).
- `atlas-data-repo/CONTRIBUTING.md` — cross-reference to this PLAN and its investigation.
- `docs/stack/naming-conventions.md` — new sections per §6.2.
- `docs/stack/erd.md` — add `mart_ingest_health`, `raw.ingest_runs`, `raw.sitemap_log`.

---

## Decision-points specific to PLAN-001-scraping (per [PLANS.md](../../PLANS.md#decision-point-ids-qn))

All four items were implementation-level choices; all resolved before handing the plan to implementation.

- ~~**[P1S.Q1]**~~ **`sources.yml` placement for the shared tables** → new `atlas-data-repo/dbt/models/shared/sources.yml`. Infrastructure tables aren't supply or indicators; they get their own folder. Decided 2026-04-24.
- ~~**[P1S.Q2]**~~ **`robots-parser` dependency vs hand-rolled parser** → check npm for active maintenance and bundle size during Phase 3.4; prefer the dep if healthy, hand-roll (~30 lines of regex) if stale. Implementer's call. Decided 2026-04-24.
- ~~**[P1S.Q3]**~~ **Vitest setup for pg-mem integration tests** → one `pg-mem` instance per test via `beforeEach` — isolation trumps speed at this scale. Revisit if tests get slow. Decided 2026-04-24.
- ~~**[P1S.Q4]**~~ **Seed `raw.ingest_runs` with a dummy row** → no. Empty `mart_ingest_health` is the correct reflection of "no scrapers have run yet" and seed rows tend to become permanent mystery fixtures. Instead, add a SQL comment at the top of `mart_ingest_health.sql` explaining that empty output is expected (see Phase 5.1). Decided 2026-04-24.
