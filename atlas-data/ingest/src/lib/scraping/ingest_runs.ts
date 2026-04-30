/**
 * raw.ingest_runs writer — run lifecycle + concurrent-run lock.
 *
 * Per INVESTIGATE-ngo-scraping-infrastructure §E.3 + §E.3.1.
 *
 * Lock mechanism (Q22):
 *   - On startRun, insert a row with finished_at = NULL (in-progress marker).
 *   - The DB's partial unique index raw_ingest_runs_one_inprogress_per_source
 *     on (source_slug) WHERE finished_at IS NULL rejects a concurrent insert
 *     at the DB layer. The app-layer SELECT-before-INSERT inside a
 *     transaction gives a clean IngestInProgressError instead of a raw SQL
 *     unique-violation error.
 *   - On finishRun, UPDATE the row with finished_at and the run counters,
 *     releasing the lock.
 *
 * Stale-lock recovery (§E.3.1) is manual:
 *   UPDATE raw.ingest_runs SET finished_at = now(), exit_code = -1,
 *     notes = 'manual recovery: pod killed' WHERE run_id = <id>;
 */

import type postgres from "postgres";

export class IngestInProgressError extends Error {
  constructor(
    public readonly sourceSlug: string,
    public readonly existingRunId: number,
    public readonly existingStartedAt: Date,
  ) {
    super(
      `Source '${sourceSlug}' is already being ingested by run_id=${existingRunId} ` +
        `(started ${existingStartedAt.toISOString()}); aborting. ` +
        `If that run is stale (its pod was killed), recover with: ` +
        `UPDATE raw.ingest_runs SET finished_at = now(), exit_code = -1, ` +
        `notes = 'manual recovery: pod killed' WHERE run_id = ${existingRunId};`,
    );
    this.name = "IngestInProgressError";
  }
}

export type RunHandle = {
  runId: number;
  startedAt: Date;
};

/**
 * Start a new ingest run. Inserts a row with finished_at = NULL. Throws
 * `IngestInProgressError` if another run for the same source_slug is already
 * in progress.
 *
 * Race protection is provided by two layers:
 *   - Application layer: this SELECT-then-INSERT detects the normal
 *     non-racing case and produces an informative error.
 *   - Database layer: the partial unique index
 *     raw_ingest_runs_one_inprogress_per_source catches the edge case where
 *     two processes SELECT at the same instant and both try to INSERT.
 * We do not wrap in `sql.begin()`: the DB-level partial unique index is the
 * real correctness guarantee, so a transaction would add surface without
 * buying anything.
 */
export async function startRun(
  sql: postgres.Sql,
  sourceSlug: string,
): Promise<RunHandle> {
  const inProgress = await sql<
    { run_id: number; started_at: Date }[]
  >`
    select run_id, started_at
    from raw.ingest_runs
    where source_slug = ${sourceSlug}
      and finished_at is null
  `;
  const conflicting = inProgress[0];
  if (conflicting) {
    throw new IngestInProgressError(
      sourceSlug,
      Number(conflicting.run_id),
      conflicting.started_at,
    );
  }
  const inserted = await sql<{ run_id: number; started_at: Date }[]>`
    insert into raw.ingest_runs (source_slug, started_at)
    values (${sourceSlug}, now())
    returning run_id, started_at
  `;
  const row = inserted[0];
  if (!row) {
    throw new Error("ingest_runs.startRun: insert returned no row");
  }
  return { runId: Number(row.run_id), startedAt: row.started_at };
}

export type FinishRunArgs = {
  exitCode: number;
  rowsScraped?: number;
  rowsParsed?: number;
  rowsSkipped?: number;
  warningsCount?: number;
  errorsCount?: number;
  notes?: string | null;
  /**
   * Upstream's own last-modified / "updated" timestamp at the time of this
   * run. NULL for sources whose upstream doesn't expose such a field, or whose
   * ingest module doesn't yet capture it. Surfaced via marts.meta_sources as
   * the "freshness vs upstream" signal — see PLAN-007.
   */
  upstreamUpdatedAt?: Date | null;
};

/**
 * Complete a run. Sets finished_at = now() and the counters. Releases the
 * concurrent-run lock.
 */
export async function finishRun(
  sql: postgres.Sql,
  runId: number,
  args: FinishRunArgs,
): Promise<void> {
  await sql`
    update raw.ingest_runs set
      finished_at         = now(),
      exit_code           = ${args.exitCode},
      rows_scraped        = ${args.rowsScraped ?? null},
      rows_parsed         = ${args.rowsParsed ?? null},
      rows_skipped        = ${args.rowsSkipped ?? null},
      warnings_count      = ${args.warningsCount ?? 0},
      errors_count        = ${args.errorsCount ?? 0},
      notes               = ${args.notes ?? null},
      upstream_updated_at = ${args.upstreamUpdatedAt ?? null}
    where run_id = ${runId}
  `;
}
