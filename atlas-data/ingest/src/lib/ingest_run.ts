/**
 * Shared ingest-run lifecycle wrapper for SSB / FHI / KLASS / Red Cross sources.
 *
 * Each source's `run()` wraps its work in `recordIngestRun()`, which:
 *   - opens a Postgres connection
 *   - inserts a raw.ingest_runs row (start)
 *   - opens a Dagster Pipes context (no-op outside Dagster)
 *   - executes the source's work
 *   - emits an asset-materialisation event to Dagster (no-op outside Dagster)
 *   - updates the row with rows_*, upstream_updated_at, exit_code (finish)
 *   - closes the Pipes context + Postgres connection
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
 * Dagster Pipes integration is centralised here so adding a new source costs
 * no Dagster-aware code in the source itself. The TS source calls
 * `recordIngestRun(...)` as it always has; when Dagster has launched the
 * process, the wrapper streams a materialisation event back to Dagster's
 * event log with rows_parsed / rows_scraped / upstream_updated_at metadata.
 * Outside Dagster (e.g. `npm run ingest:*` locally), Pipes is a no-op.
 *
 * See PLAN-007 phase 2.8 and PLAN-dagster-codelocation-image / its follow-up.
 */

import * as dagsterPipes from "@dagster-io/dagster-pipes";
import { startRun, finishRun, type FinishRunArgs } from "./scraping/index.js";
import { closeSql, getSql } from "./postgres.js";
import { logger } from "./logger.js";
import { buildMaterializationMetadata } from "./pipes_metadata.js";

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
  // Open Pipes regardless of DATABASE_URL — it's a no-op outside Dagster
  // anyway, and we want Pipes context (materialisation + logs) for any
  // Dagster-launched run, including dry-runs without a DB write target.
  const pipes = dagsterPipes.openDagsterPipes();
  try {
    if (!process.env["DATABASE_URL"]) {
      logger.info("ingest_run.untracked", {
        source_id: sourceId,
        reason: "DATABASE_URL not set — running without raw.ingest_runs tracking",
      });
      const { output, record } = await work();
      reportPipesMaterialization(pipes, sourceId, record, null);
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
      reportPipesMaterialization(pipes, sourceId, record, handle.runId);
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
  } finally {
    pipes[Symbol.dispose]?.();
  }
}

/**
 * Emit an asset-materialisation event back to Dagster. No-op when run outside
 * Dagster (the Pipes context is a no-op implementation in that case). The
 * asset key is inferred from the `@asset` in scope on the Dagster side, so we
 * don't pass `assetKey` here — each Python @asset wrapper knows its own key.
 */
function reportPipesMaterialization(
  pipes: ReturnType<typeof dagsterPipes.openDagsterPipes>,
  sourceId: string,
  record: Omit<FinishRunArgs, "exitCode">,
  runId: number | null,
): void {
  try {
    // Null values make the SDK's normalizeMetadata throw and cost the whole
    // payload — see buildMaterializationMetadata.
    pipes.reportAssetMaterialization(
      buildMaterializationMetadata(sourceId, record, runId),
    );
  } catch (err) {
    // Pipes reporting failures must not break the ingest — log and continue.
    logger.warn("dagster_pipes.report_failed", {
      source_id: sourceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
