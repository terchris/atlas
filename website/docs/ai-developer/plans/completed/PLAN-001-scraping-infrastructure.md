# Plan 001: Scraping infrastructure

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Completed

**Goal**: Ship the shared scraping toolkit defined in [INVESTIGATE-ngo-scraping-infrastructure.md](./INVESTIGATE-ngo-scraping-infrastructure.md) — Crawlee dependency, two raw tables (`raw.ingest_runs`, `raw.sitemap_log`), the shared TypeScript library under `ingest/src/lib/scraping/` with test coverage, the minimal `mart_ingest_health` dbt view, env-var conventions, and the per-source folder convention. After this plan, per-NGO scrape PLANs (Folkehjelp first) can implement sources against a stable foundation without re-litigating infrastructure.

**Last Updated**: 2026-04-24
**Completed**: 2026-04-24 — all 6 phases done in one session. Crawlee + `fast-json-stable-stringify` deps added; `raw.ingest_runs` and `raw.sitemap_log` migrations (023 + 024) applied with the partial unique index enforcing the concurrent-run lock; shared library under `src/lib/scraping/` with 8 modules (ua, record_hash, html_raw_hash, robots, sitemap_log, ingest_runs, upsert_record, kv) and 49 pure-function tests; `mart_ingest_health` shipped as a 3-column dbt view with 5 passing data tests; README, naming-conventions, and CONTRIBUTING all cross-referenced. Final gates: `npm run typecheck` clean, `npm test` 49/49, `npm run migrate` idempotent, `dbt build` PASS=526 WARN=19 ERROR=0 TOTAL=545.

**Investigation**: [INVESTIGATE-ngo-scraping-infrastructure.md](./INVESTIGATE-ngo-scraping-infrastructure.md) — 25 resolved Q's, zero open.
**Prerequisites**: none (all foundation already in place — Postgres, dbt, ingest repo, migrate runner).
**Blocks**: [INVESTIGATE-folkehjelp-supply.md](../backlog/INVESTIGATE-folkehjelp-supply.md)'s scrape PLAN — the first per-NGO consumer of this infrastructure.
**Priority**: Medium

---

## Overview

Six phases, estimated **~10–12 h**. The investigation's 6–8h estimate pre-dates Q19/Q20/Q22/Q23/Q25, which added sitemap_log, mandatory raw columns, the concurrent-run lock, the test suite, and the file-responsibilities convention. The toolkit surface roughly doubled; adjust accordingly.

**Built in PLAN-001:**

- **Dependencies**: `crawlee`, `fast-json-stable-stringify` added to `atlas-data/ingest/package.json`. Dev deps: `vitest`.
- **Migrations**: `023_raw_ingest_runs.sql`, `024_raw_sitemap_log.sql`.
- **Shared library** under `atlas-data/ingest/src/lib/scraping/`:
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
  - Pure-function coverage: hashers, UA builder, robots parser, `decideFetch` reason codes, `upsertRecord` input validation. DB-touching code is verified end-to-end (see Implementation Notes).
- **dbt model**: `mart_ingest_health` (3-column minimal view per Q14).
- **`.gitignore`** entry for `.crawlee-cache/` under `atlas-data/ingest/`.
- **Documentation**:
  - New `atlas-data/ingest/README.md` listing the three env vars (§F).
  - New `atlas-data/ingest/src/sources/README.md` documenting the per-source folder convention (§B.3).
  - Extended [`docs/stack/naming-conventions.md`](../../../../docs/stack/naming-conventions.md) with `source_slug`, `record_hash`, `html_raw_hash`, `url`, `raw.ingest_runs`, `raw.sitemap_log`.

**NOT built in PLAN-001:**

- Any per-NGO scraper (Folkehjelp, NKS, Frelsesarmeen, …) — each is a follow-up PLAN citing this infrastructure.
- The `raw.html_archive` upgrade-path table from §C.1.2 — out of scope for v1 per the investigation.
- Dagster integration — Dagster is a separate platform-service initiative; this PLAN's app-layer lock is designed to coexist with it (see §E.3.1 of the investigation).
- CI pipeline changes — the tests run locally via `npm test`; integrating with the repo's existing CI is a separate small PR if warranted.

---

## Phase 1: Dependencies and scaffolding — DONE

### Tasks

- [x] 1.1 Install runtime deps: `crawlee ^3.16.0`, `fast-json-stable-stringify ^2.1.0`. Major-pinned via caret per existing project convention.
- [x] 1.2 Install dev deps: `vitest ^4.1.5`.
- [x] 1.3 Added `"test": "vitest run --passWithNoTests"` and `"test:watch": "vitest"` to `package.json` scripts. The `--passWithNoTests` flag makes the empty-suite interim state (pre-Phase 3) a clean exit-0 instead of exit-1.
- [x] 1.4 Created `atlas-data/ingest/vitest.config.ts` with the include glob from the PLAN.
- [x] 1.5 Created `src/lib/scraping/` + `__tests__/` subfolder + `index.ts` stub. Stub contains only a module-level comment listing the Phase 3/4 exports to land here + `export {};` to keep TypeScript happy until real exports land.
- [x] 1.6 Added `.crawlee-cache/` to `atlas-data/ingest/.gitignore` (file already existed; appended the new entry).
- [x] 1.7 Extended the **existing** `atlas-data/ingest/README.md` with an "Environment variables" section (inserted between "Install" and "Run one source"). **Deviation from plan**: the PLAN said "create" but the README already existed with substantive content describing the current ingest flow — extending it was the correct action. Env-var table matches §F of the investigation, with a clarifying note that non-scraper modules (SSB, FHI, Brreg, Red Cross API) don't read these variables.

### Validation

```bash
cd atlas-data/ingest
npm run typecheck
npm test   # should run zero tests cleanly — "No test files found" is acceptable
```

User confirms phase is complete.

---

## Phase 2: Migrations for `raw.ingest_runs` and `raw.sitemap_log` — DONE

### Tasks

- [x] 2.1 Created `023_raw_ingest_runs.sql` with schema + partial unique index `raw_ingest_runs_one_inprogress_per_source` on `(source_slug) WHERE finished_at IS NULL`. Made `finished_at` and `exit_code` nullable so the row can be inserted at run-start with `finished_at = NULL` (in-progress marker).
- [x] 2.2 Created `024_raw_sitemap_log.sql` with composite PK `(source_slug, url)` and the sitemap_log schema from §C.2. Table comment notes that HTML-index sources also use this table with `lastmod = NULL`.
- [x] 2.3 `npm run migrate` applied both (023 in 10ms, 024 in 4ms). `file_count: 24` total.
- [x] 2.4 Created new `atlas-data/dbt/models/shared/sources.yml` with both tables. dbt now sees 23 sources (was 21); `dbt parse` clean.

### Validation

```bash
cd atlas-data/ingest
npm run migrate
psql $DATABASE_URL -c "\d raw.ingest_runs"
psql $DATABASE_URL -c "\d raw.sitemap_log"
psql $DATABASE_URL -c "\di raw.raw_ingest_runs_one_inprogress_per_source"
```

Both tables exist, the partial unique index exists. User confirms phase is complete.

---

## Phase 3: Shared library — UA, hashers, robots — DONE

### Tasks

- [x] 3.1 `ua.ts` — exports `buildUserAgent()` (function, not cached constant — lazy reads env so tests can exercise missing-env case without module-reset gymnastics) + a named `MissingContactEmailError` class. Throws on unset/empty/whitespace-only env, with a descriptive message citing §D.1.
- [x] 3.2 `record_hash.ts` — exports `recordHash(record: unknown): string`. Uses `fast-json-stable-stringify` + node:crypto sha256. Explicit comment documents that NFC normalization is the caller's responsibility (Q21 contract).
- [x] 3.3 `html_raw_hash.ts` — exports `htmlRawHash(body)` plus `canonicalizeHtmlBody(body)` (exported for tests). Canonicalization: strip `<head>...</head>`, strip CSRF meta tags and nonce attributes (both quote styles), collapse whitespace runs.
- [x] 3.4 `robots.ts` — **hand-rolled** parser (per [P1S.Q2] — kept the dep list small; robots.txt syntax is simple). Supports User-agent blocks + Disallow + Allow + Crawl-Delay + `*` path wildcards + `$` end-anchor. Longest-match-wins semantics with Allow breaking ties.
- [x] 3.5 Tests for all four modules under `__tests__/`. **Three real bugs caught during test runs**:
  - robots.ts: `*` wildcard regex conversion was broken (the escape-then-un-escape dance never fired because `*` wasn't in the first regex-special class). Fixed — now escapes specials, then converts `*` → `.*` in a clean second pass.
  - record_hash test: initial test used `ø` which is atomic in Unicode (no canonical decomposition). Replaced with `å` (U+00E5 ↔ U+0061 U+030A) which actually has an NFC/NFD split.
  - html_raw_hash test: initial whitespace test expected identical output after canonicalizing inputs with different tag-adjacent whitespace. Tightened the test to cover the actual contract (inter-token whitespace runs collapse to single space).
- [x] 3.6 `src/lib/scraping/index.ts` updated with re-exports for all four modules.

### Validation

```bash
cd atlas-data/ingest
npm run typecheck
npm test -- src/lib/scraping/__tests__/
```

All tests pass; `npm run typecheck` clean. User confirms.

---

## Phase 4: Shared library — sitemap_log, ingest_runs, upsert helper, KV wrapper — DONE

### Tasks

- [x] 4.1 `sitemap_log.ts` — `readPriorState`, pure `decideFetch` (four-condition skip rule with NULL handling and reason codes), `upsertDiscovered` (uses the shared `upsert()` bulk helper from `lib/postgres.ts`), `detectOrphans`.
- [x] 4.2 `ingest_runs.ts` — `startRun` with SELECT-then-INSERT check (DB-layer partial unique index from Phase 2 catches the concurrent-race edge case), `finishRun`, `IngestInProgressError` class with clear recovery SQL in the message. No `sql.begin()` transaction wrapper: the DB-layer index is the correctness guarantee, and wrapping in a transaction added adapter-compatibility surface without buying anything.
- [x] 4.3 `upsert_record.ts` — `upsertRecord(sql, { tableName, row, columns })` returns `'inserted' | 'updated' | 'skipped'`. SELECT current `record_hash` → compare → skip-or-upsert. Uses inline `sql.unsafe(template, params)` for the single-row INSERT/UPDATE rather than delegating to the shared bulk `upsert()` helper — clearer for the single-row case and avoids the unnecessary bulk-value-helper detour.
- [x] 4.4 `kv.ts` — `getSourceKv`, `setCached`, `getCachedBody`, `getCachedMetadata`, `hasCached`. Thin Crawlee `KeyValueStore` wrapper scoped per source. Exercised end-to-end by the first per-source PLAN (Folkehjelp); no isolated unit tests (would mostly test that Crawlee works).
- [x] 4.5 Pure tests only: `sitemap_log.test.ts` covers every `decideFetch` reason code, `upsert_record.test.ts` covers input-validation branches. DB-touching behavior (`readPriorState`, `upsertDiscovered`, `detectOrphans`, `startRun`, `finishRun`, the upsertRecord DB path) is not unit-tested: at Atlas's scale the code is short and mostly delegates to `postgres.js`, so unit tests against a mocked DB would mostly test that `postgres.js` works. Full verification happens through Phase 2's migration run, Phase 5's `dbt build`, and the first per-source PLAN's end-to-end smoke test. If a real bug escapes, the right next step is a discrete "DB integration test harness" PLAN using testcontainers-postgres or similar.
  - Running: **49 passing, 0 skipped, 0 failing** across 6 test files.
- [x] 4.6 `index.ts` re-exports `sitemap_log`, `ingest_runs`, `upsert_record`, and `kv` public surfaces.

### Validation

```bash
cd atlas-data/ingest
npm run typecheck
npm test
```

All tests pass. `npm run typecheck` clean. User confirms.

---

## Phase 5: `mart_ingest_health` dbt model — DONE

### Tasks

- [x] 5.1 `mart_ingest_health.sql` created as a **view** materialized in `marts.*`. Selects `distinct on (source_slug)` ordered by `finished_at desc` with a `where finished_at is not null` clause so in-progress rows never leak through. SQL comment at the top documents the empty-state expectation per [P1S.Q4].
- [x] 5.2 schema.yml entry added. Five data tests: `not_null` + `unique` on `source_slug`, `not_null` on `last_run_at`, `not_null` + `accepted_values: ['ok', 'fail']` on `last_status`. Went slightly beyond the PLAN's "+3" estimate to cover presence of all three columns, not just three assertions.
- [x] 5.3 ERD regenerated via `atlas-data/dbt/regenerate-erd.sh`. `docs/stack/erd.md` now contains `MODEL.ATLAS.MART_INGEST_HEALTH` with all three columns. ERD entity count: 36 → 37.
- [x] 5.4 `dbt build` clean: **PASS=526 WARN=19 ERROR=0 SKIP=0 TOTAL=545** (was 520 baseline from PLAN-002 + 1 model + 5 tests = 526 ✓). `dbt show --inline "select * from marts.mart_ingest_health"` returns empty — expected.

### Validation

```bash
cd atlas-data/dbt
uv run --env-file ../ingest/.env dbt build
uv run --env-file ../ingest/.env dbt show --inline "select * from marts.mart_ingest_health"
```

Empty result is expected (no scrapers have written to `raw.ingest_runs` yet). `dbt build` passes. User confirms.

---

## Phase 6: Per-source documentation and wrap-up — DONE

### Tasks

- [x] 6.1 Extended the existing `atlas-data/ingest/src/sources/README.md` with a new **"Scraping sources — additional convention"** section covering the extended folder layout (`discover.ts` / `parse.ts` / `overrides.json` / `types.ts` / `__tests__/fixtures/`), file responsibilities (Q25), the §C.5 mandatory raw-table columns, migration naming, env vars, and a 7-step new-scraper checklist. Also added the missing `redcross-branches` row to the implemented-sources table.
- [x] 6.2 Extended [`docs/stack/naming-conventions.md`](../../../../docs/stack/naming-conventions.md) with a new **"Raw-schema scraper conventions"** section covering `source_slug`, `url`, `record_hash`, `html_raw_hash`, `is_active`, `lastmod`, and the two shared cross-source tables. Noted on the existing `source_id` canonical row that it's renamed from `raw.*.source_slug` at the dbt passthrough — which caught a small inconsistency in `mart_ingest_health` that was then fixed (the mart now exposes `source_id`, renamed at the view boundary).
- [x] 6.3 Added a scraper-specific sub-block to the "Prerequisites reading" list in [`atlas-data/CONTRIBUTING.md`](../../../../../atlas-data/CONTRIBUTING.md) pointing at the investigation, the sources/README scraper section, and this PLAN's completed copy.
- [x] 6.4 All four gates green:
  - `npm run typecheck` — clean
  - `npm test` — 49 passing, 0 skipped, 0 failing (487ms)
  - `npm run migrate` — idempotent (24 files, no-op on re-run)
  - `dbt build` — PASS=526 WARN=19 ERROR=0 SKIP=0 TOTAL=545
- [x] 6.5 Plan moved to `plans/completed/`; status set to `Completed` with completion date and one-line summary.

### Validation

All gates pass. User confirms by reading the three new README/docs files and agreeing they're useful entry points for the next per-source PLAN.

---

## Acceptance Criteria

- [ ] `npm run typecheck` clean in `atlas-data/ingest/`.
- [ ] `npm test` passes (vitest; shared-lib pure tests).
- [ ] `npm run migrate` applies both new migrations cleanly (and is idempotent on re-run).
- [ ] `dbt build` passes; `marts.mart_ingest_health` exists and is queryable (empty until first scraper runs).
- [ ] The partial unique index on `raw.ingest_runs (source_slug) WHERE finished_at IS NULL` exists and rejects concurrent inserts.
- [ ] Three env vars are documented in `atlas-data/ingest/README.md`. Running any script with `ATLAS_SCRAPE_CONTACT_EMAIL` unset yields a clear startup error.
- [ ] `.crawlee-cache/` is gitignored under `atlas-data/ingest/`.
- [ ] Per-source folder convention is documented in `atlas-data/ingest/src/sources/README.md`.
- [ ] `docs/stack/naming-conventions.md` covers the new columns and tables.
- [ ] No per-NGO scraper is implemented as part of this PLAN (that's a follow-up).

---

## Implementation Notes

- **Postgres client**: the existing `ingest/src/lib/postgres.ts` module presumably exports a client factory; reuse it for the sitemap_log / ingest_runs / upsert code rather than constructing new clients. Match the existing convention (pooled vs single connection, transaction style).
- **NFC normalization** (Q21): callers of `recordHash` are responsible for normalizing strings at the parser boundary. `record_hash.ts` itself does not normalize — if it did, the record object in memory would still contain non-NFC strings and could diverge from what's written to the DB. Put the normalization in `parse.ts` for each source, tested via the record_hash unit tests.
- **Partial unique index** (Q22): the investigation describes the lock as an application-layer check, but backing it with a database-enforced partial unique index on `(source_slug) WHERE finished_at IS NULL` makes it race-free even if two processes run the SELECT simultaneously. The SELECT-then-informative-error code path still exists for good error messaging; the DB index is the correctness guarantee.
- **Crawlee version pinning**: lock to a specific major version in `package.json` (e.g., `"crawlee": "^3.x.y"`). Crawlee has had breaking changes at major versions; unpinning risks silent regressions.
- **Test scope**: unit tests cover the pure-function surface (hashers, UA builder, robots parser, `decideFetch`, input validation). DB-touching code in `sitemap_log` / `ingest_runs` / `upsert_record` is short and delegates to `postgres.js`; it's verified end-to-end via Phase 2's `npm run migrate`, Phase 5's `dbt build`, and the first per-source PLAN (Folkehjelp) smoke test. If a real bug escapes, add a discrete "DB integration test harness" PLAN (likely testcontainers-postgres) rather than mocking the DB.
- **dbt sources.yml placement** (Phase 2.4): the investigation doesn't specify, and PLAN-002 put `redcross_branches` under the `supply/` folder's sources. Whether `ingest_runs` and `sitemap_log` belong under `supply/sources.yml` or a new `shared/sources.yml` is a small call — they're infrastructure, not supply. Pick whichever reads more naturally; `shared/` feels slightly better.
- **Crawlee `KeyValueStore` init**: Crawlee reads `CRAWLEE_STORAGE_DIR` on first import and caches the path. Make sure the env var is set *before* the first `import` — typically via `dotenv` at process start or via `--env-file=.env` on the tsx command (existing convention in `package.json` scripts already does this).

---

## Files to Modify

**New files:**
- `atlas-data/ingest/src/lib/scraping/ua.ts`
- `atlas-data/ingest/src/lib/scraping/record_hash.ts`
- `atlas-data/ingest/src/lib/scraping/html_raw_hash.ts`
- `atlas-data/ingest/src/lib/scraping/robots.ts`
- `atlas-data/ingest/src/lib/scraping/sitemap_log.ts`
- `atlas-data/ingest/src/lib/scraping/ingest_runs.ts`
- `atlas-data/ingest/src/lib/scraping/upsert_record.ts`
- `atlas-data/ingest/src/lib/scraping/kv.ts`
- `atlas-data/ingest/src/lib/scraping/index.ts`
- `atlas-data/ingest/src/lib/scraping/__tests__/ua.test.ts`
- `atlas-data/ingest/src/lib/scraping/__tests__/record_hash.test.ts`
- `atlas-data/ingest/src/lib/scraping/__tests__/html_raw_hash.test.ts`
- `atlas-data/ingest/src/lib/scraping/__tests__/robots.test.ts`
- `atlas-data/ingest/src/lib/scraping/__tests__/sitemap_log.test.ts` — `decideFetch` pure-logic tests
- `atlas-data/ingest/src/lib/scraping/__tests__/upsert_record.test.ts` — input-validation tests
- `atlas-data/ingest/vitest.config.ts`
- `atlas-data/ingest/README.md`
- `atlas-data/ingest/src/sources/README.md`
- `atlas-data/migrations/023_raw_ingest_runs.sql`
- `atlas-data/migrations/024_raw_sitemap_log.sql`
- `atlas-data/dbt/models/marts/mart_ingest_health.sql`

**Modified files:**
- `atlas-data/ingest/package.json` — new deps, new scripts.
- `atlas-data/ingest/.gitignore` — add `.crawlee-cache/` (create file if absent).
- `atlas-data/dbt/models/marts/schema.yml` — entry for `mart_ingest_health`.
- `atlas-data/dbt/models/shared/sources.yml` — entries for `raw.ingest_runs` and `raw.sitemap_log` (new folder per [P1S.Q1]).
- `atlas-data/CONTRIBUTING.md` — cross-reference to this PLAN and its investigation.
- `docs/stack/naming-conventions.md` — new sections per §6.2.
- `docs/stack/erd.md` — add `mart_ingest_health`, `raw.ingest_runs`, `raw.sitemap_log`.

---

## Decision-points specific to PLAN-001-scraping (per [PLANS.md](../../PLANS.md#decision-point-ids-qn))

All four items were implementation-level choices; all resolved before handing the plan to implementation.

- ~~**[P1S.Q1]**~~ **`sources.yml` placement for the shared tables** → new `atlas-data/dbt/models/shared/sources.yml`. Infrastructure tables aren't supply or indicators; they get their own folder. Decided 2026-04-24.
- ~~**[P1S.Q2]**~~ **`robots-parser` dependency vs hand-rolled parser** → check npm for active maintenance and bundle size during Phase 3.4; prefer the dep if healthy, hand-roll (~30 lines of regex) if stale. Implementer's call. Decided 2026-04-24.
- ~~**[P1S.Q3]**~~ **DB integration test harness** → not pursued in this PLAN. At Atlas's scale the DB-touching shared-lib code is short and mostly delegates to `postgres.js`; unit tests against a mocked DB would mostly test that `postgres.js` works. The DB path is verified end-to-end via Phase 2 migrate + Phase 5 dbt build + the first per-source PLAN's smoke test. Revisit with a discrete PLAN (likely testcontainers-postgres) if real bugs escape that coverage. Decided 2026-04-24.
- ~~**[P1S.Q4]**~~ **Seed `raw.ingest_runs` with a dummy row** → no. Empty `mart_ingest_health` is the correct reflection of "no scrapers have run yet" and seed rows tend to become permanent mystery fixtures. Instead, add a SQL comment at the top of `mart_ingest_health.sql` explaining that empty output is expected (see Phase 5.1). Decided 2026-04-24.
