/**
 * pg-mem test harness. Creates an in-memory Postgres instance with the raw.*
 * schema + the tables this PLAN introduces, and returns a postgres.js-
 * compatible tag function.
 *
 * Scope: just enough schema for Phase 4's shared-library tests. Scraper raw
 * tables that follow §C.5 are represented by `raw.test_scraper` — that's the
 * surface `upsertRecord` and orphan-propagation flows need.
 */

import { createRequire } from "node:module";
import { newDb, type IMemoryDb } from "pg-mem";
import type postgres from "postgres";

// pg-mem's createPostgresJsTag uses `require('postgres').default`. postgres.js
// v3's CJS build exports the function directly (no `.default`), so the call
// fails with "pg is not a function". Patch the cached CJS module to have a
// `.default` pointing at itself.
{
  const req = createRequire(import.meta.url);
  const pg = req("postgres");
  if (typeof pg === "function" && !(pg as { default?: unknown }).default) {
    (pg as { default: unknown }).default = pg;
  }
}

export type TestDb = {
  sql: postgres.Sql;
  mem: IMemoryDb;
  /** Closes the postgres.js pool. Call in `afterEach` to avoid socket leaks. */
  close: () => Promise<void>;
};

/**
 * Build a fresh in-memory DB with raw.ingest_runs + raw.sitemap_log +
 * raw.test_scraper. Each call creates an isolated instance ([P1S.Q3] per-test
 * isolation).
 */
export function createTestDb(): TestDb {
  const mem = newDb();

  // now() works out of the box in pg-mem. No further setup needed for that.

  mem.public.none(`CREATE SCHEMA IF NOT EXISTS raw`);

  mem.public.none(`
    CREATE TABLE raw.ingest_runs (
      run_id          SERIAL PRIMARY KEY,
      source_slug     TEXT NOT NULL,
      started_at      TIMESTAMPTZ NOT NULL,
      finished_at     TIMESTAMPTZ,
      exit_code       INT,
      rows_scraped    INT,
      rows_parsed     INT,
      rows_skipped    INT,
      warnings_count  INT NOT NULL DEFAULT 0,
      errors_count    INT NOT NULL DEFAULT 0,
      notes           TEXT
    )
  `);
  // pg-mem does not enforce partial WHERE predicates on unique indexes. The
  // DB-layer race protection described in Q22 is therefore not exercised by
  // these tests; the application-layer FOR UPDATE + pre-INSERT SELECT check
  // covers the non-racing case, which is what we verify here. Full-fidelity
  // testing of the partial index belongs in the Folkehjelp PLAN's smoke test
  // against real Postgres.

  mem.public.none(`
    CREATE TABLE raw.sitemap_log (
      source_slug    TEXT NOT NULL,
      url            TEXT NOT NULL,
      lastmod        TIMESTAMPTZ,
      first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source_slug, url)
    )
  `);

  mem.public.none(`
    CREATE TABLE raw.test_scraper (
      url            TEXT PRIMARY KEY,
      record_hash    TEXT NOT NULL,
      html_raw_hash  TEXT,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      name           TEXT
    )
  `);

  const sql = mem.adapters.createPostgresJsTag() as unknown as postgres.Sql;
  return {
    sql,
    mem,
    close: async () => {
      try {
        await sql.end({ timeout: 1 });
      } catch {
        // pg-mem's adapter may not fully implement `end`; ignore errors.
      }
    },
  };
}
