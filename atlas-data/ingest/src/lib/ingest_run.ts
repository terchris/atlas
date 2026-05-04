/**
 * Shared ingest-run lifecycle wrapper for SSB / FHI / KLASS / Red Cross sources.
 *
 * Each source's `run()` wraps its work in `recordIngestRun()`, which:
 *   - opens a Postgres connection
 *   - inserts a raw.ingest_runs row (start)
 *   - executes the source's work
 *   - updates the row with rows_*, upstream_updated_at, exit_code (finish)
 *   - closes the Postgres connection
 *
 * If `DATABASE_URL` is not set, the work runs untracked (no run row written) —
 * lets contributors do quick local NDJSON-only sanity checks without standing
 * up Postgres. This mirrors the existing `if (process.env["DATABASE_URL"])`
 * pattern each source already uses for its own writes.
 *
 * Source modules should NOT call `closeSql()` themselves any more — the
 * wrapper owns the lifecycle. They MAY call `getSql()` to reuse the same
 * singleton connection for their own writes; the wrapper closes it once at
 * the end.
 *
 * See PLAN-007 phase 2.8.
 */

import { startRun, finishRun, type FinishRunArgs } from "./scraping/index.js";
import { closeSql, getSql } from "./postgres.js";
import { logger } from "./logger.js";

/**
 * What a source's work function returns. The `output` is the per-source
 * Summary type (preserved verbatim through the wrapper); the `record` carries
 * the ingest-run-record fields the wrapper passes to finishRun.
 */
export type IngestRunResult<T> = {
  output: T;
  record: Omit<FinishRunArgs, "exitCode">;
};

/**
 * Run a source's work inside a tracked ingest run. Returns whatever the
 * work's `output` was, so the surrounding `run()` keeps its existing
 * return-type contract.
 */
export async function recordIngestRun<T>(
  sourceId: string,
  work: () => Promise<IngestRunResult<T>>,
): Promise<T> {
  if (!process.env["DATABASE_URL"]) {
    logger.info("ingest_run.untracked", {
      source_id: sourceId,
      reason: "DATABASE_URL not set — running without raw.ingest_runs tracking",
    });
    const { output } = await work();
    return output;
  }

  const sql = getSql();
  const handle = await startRun(sql, sourceId);
  logger.info("ingest_run.started", {
    source_id: sourceId,
    run_id: handle.runId,
    started_at: handle.startedAt.toISOString(),
  });

  try {
    const { output, record } = await work();
    await finishRun(sql, handle.runId, { ...record, exitCode: 0 });
    logger.info("ingest_run.finished", {
      source_id: sourceId,
      run_id: handle.runId,
      rows_parsed: record.rowsParsed ?? null,
      upstream_updated_at: record.upstreamUpdatedAt?.toISOString() ?? null,
    });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await finishRun(sql, handle.runId, {
        exitCode: 1,
        notes: message.slice(0, 500),
      });
    } catch (finishErr) {
      // The original error is what callers care about — log the secondary
      // failure but don't suppress the primary throw.
      logger.error("ingest_run.finish_after_error_failed", {
        source_id: sourceId,
        run_id: handle.runId,
        error: finishErr instanceof Error ? finishErr.message : String(finishErr),
      });
    }
    throw err;
  } finally {
    await closeSql();
  }
}
