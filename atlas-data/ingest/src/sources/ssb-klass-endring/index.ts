/**
 * SSB Klass correspondence/change log, for classifications 131 (Kommuner)
 * and 104 (Fylker). urb-agents #2098/#2099 (R6).
 *
 * Separate from ssb-klass-kommuner/ssb-klass-fylker: those fetch /codes.json
 * (each code's own validity window), this fetches /changes.json (the actual
 * old-code -> new-code transitions). Different question, different endpoint,
 * different raw table — see migration 080's header.
 *
 * "The kind" of change (renamed/renumbered/merged/split/border) is NOT
 * stored here — Klass's changes.json gives no such field. It is derived in
 * dbt from the shape of same-date transitions (models/dimensions/
 * dim_ssb_klass_endring.sql), not computed here, so raw stays verbatim.
 */
import { fetchKlassChanges } from "../../lib/klass.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "ssb-klass-endring";
const TARGET_TABLE = "raw.ssb_klass_endring";
const HISTORY_FROM = "1950-01-01";
const HISTORY_TO = "2100-01-01";
const CLASSIFICATIONS = [
  { id: "131", label: "kommuner" },
  { id: "104", label: "fylker" },
] as const;
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-klass-endring.ndjson",
);

type Row = {
  classification_id: string;
  old_code: string;
  old_name: string;
  old_short_name: string | null;
  new_code: string;
  new_name: string;
  new_short_name: string | null;
  change_occurred: string;
};

const WRITE_COLUMNS = [
  "classification_id",
  "old_code",
  "old_name",
  "old_short_name",
  "new_code",
  "new_name",
  "new_short_name",
  "change_occurred",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["classification_id", "old_code", "new_code", "change_occurred"] as const;

export type SsbKlassEndringSummary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
};

export async function run(): Promise<SsbKlassEndringSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const rows: Row[] = [];
    for (const { id: classificationId } of CLASSIFICATIONS) {
      const resp = await fetchKlassChanges({
        classificationId,
        from: HISTORY_FROM,
        to: HISTORY_TO,
      });
      for (const c of resp.codeChanges) {
        rows.push({
          classification_id: classificationId,
          old_code: c.oldCode,
          old_name: c.oldName,
          old_short_name: c.oldShortName || null,
          new_code: c.newCode,
          new_name: c.newName,
          new_short_name: c.newShortName || null,
          change_occurred: c.changeOccurred,
        });
      }
    }

    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten = await upsert(sql, {
        table: TARGET_TABLE,
        rows: rows.map((r) => ({ ...r, loaded_at: now })),
        columns: WRITE_COLUMNS as unknown as string[],
        conflictKeys: CONFLICT_KEYS,
      });
      logger.info("postgres.upsert.done", { table: TARGET_TABLE, rows_written: rowsWritten });
    } else {
      logger.info("postgres.upsert.skipped", { reason: "DATABASE_URL not set" });
    }

    logger.info("source.done", {
      source_id: SOURCE_ID,
      row_count: rows.length,
      duration_ms: Date.now() - started,
      wrote_to_postgres: wroteToPostgres,
      rows_written: rowsWritten,
    });

    return {
      output: { rowCount: rows.length, outputPath: OUTPUT_PATH, wroteToPostgres, rowsWritten },
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: null,
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: unknown) => {
    logger.error("source.failed", {
      source_id: SOURCE_ID,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
