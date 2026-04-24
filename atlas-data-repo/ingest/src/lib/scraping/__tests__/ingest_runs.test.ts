import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  startRun,
  finishRun,
  IngestInProgressError,
} from "../ingest_runs.js";
import { createTestDb, type TestDb } from "./_db_setup.js";

const SLUG = "test-source";

// See sitemap_log.test.ts for the pg-mem incompatibility rationale. These
// tests describe correct ingest_runs lifecycle behavior and the Q22
// concurrent-run lock semantics; they run green once pointed at a real
// Postgres instance.
describe.skip("ingest_runs lifecycle", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it("startRun returns a handle with a non-zero runId", async () => {
    const handle = await startRun(db.sql, SLUG);
    expect(handle.runId).toBeGreaterThan(0);
    expect(handle.startedAt).toBeInstanceOf(Date);
  });

  it("startRun twice for the same source throws IngestInProgressError", async () => {
    const first = await startRun(db.sql, SLUG);
    await expect(startRun(db.sql, SLUG)).rejects.toThrow(
      IngestInProgressError,
    );
    try {
      await startRun(db.sql, SLUG);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IngestInProgressError);
      const err = e as IngestInProgressError;
      expect(err.sourceSlug).toBe(SLUG);
      expect(err.existingRunId).toBe(first.runId);
      expect(err.message).toMatch(new RegExp(`run_id=${first.runId}`));
      expect(err.message).toMatch(/manual recovery/i);
    }
  });

  it("finishRun releases the lock → next startRun succeeds", async () => {
    const first = await startRun(db.sql, SLUG);
    await finishRun(db.sql, first.runId, { exitCode: 0, rowsScraped: 5 });

    const second = await startRun(db.sql, SLUG);
    expect(second.runId).not.toBe(first.runId);
  });

  it("different source_slugs can run concurrently", async () => {
    const a = await startRun(db.sql, "source-a");
    const b = await startRun(db.sql, "source-b");
    expect(a.runId).not.toBe(b.runId);

    await finishRun(db.sql, a.runId, { exitCode: 0 });
    await finishRun(db.sql, b.runId, { exitCode: 0 });
  });

  it("finishRun persists counters and notes", async () => {
    const handle = await startRun(db.sql, SLUG);
    await finishRun(db.sql, handle.runId, {
      exitCode: 0,
      rowsScraped: 121,
      rowsParsed: 121,
      rowsSkipped: 7,
      warningsCount: 2,
      errorsCount: 0,
      notes: "test run complete",
    });

    const rows = await db.sql<
      {
        exit_code: number;
        rows_scraped: number;
        rows_parsed: number;
        rows_skipped: number;
        warnings_count: number;
        errors_count: number;
        notes: string;
        finished_at: Date | null;
      }[]
    >`select exit_code, rows_scraped, rows_parsed, rows_skipped,
             warnings_count, errors_count, notes, finished_at
      from raw.ingest_runs where run_id = ${handle.runId}`;
    const row = rows[0]!;
    expect(row.exit_code).toBe(0);
    expect(row.rows_scraped).toBe(121);
    expect(row.rows_parsed).toBe(121);
    expect(row.rows_skipped).toBe(7);
    expect(row.warnings_count).toBe(2);
    expect(row.errors_count).toBe(0);
    expect(row.notes).toBe("test run complete");
    expect(row.finished_at).not.toBeNull();
  });

  it("finishRun with minimal args defaults counts to 0/NULL", async () => {
    const handle = await startRun(db.sql, SLUG);
    await finishRun(db.sql, handle.runId, { exitCode: 1 });

    const rows = await db.sql<
      {
        exit_code: number;
        warnings_count: number;
        errors_count: number;
        rows_scraped: number | null;
      }[]
    >`select exit_code, warnings_count, errors_count, rows_scraped
      from raw.ingest_runs where run_id = ${handle.runId}`;
    const row = rows[0]!;
    expect(row.exit_code).toBe(1);
    expect(row.warnings_count).toBe(0);
    expect(row.errors_count).toBe(0);
    expect(row.rows_scraped).toBeNull();
  });
});
