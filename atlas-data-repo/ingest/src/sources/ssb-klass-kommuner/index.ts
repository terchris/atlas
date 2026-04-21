/**
 * SSB Klass classification 131 — Kommuner (active code list snapshot).
 * See ./README.md for full source notes.
 *
 * Unlike statbank-table sources this produces dimension data, not indicator
 * data. The downstream dbt model is `dim_kommune`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKlassCodesAt } from "../../lib/klass.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";

/** Row shape for raw.ssb_klass_kommuner. */
type SsbKlassKommunerRow = {
  code: string;
  name: string;
  parent_code: string | null;
  level: string | null;
  short_name: string | null;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
};

export const SOURCE_ID = "ssb-klass-kommuner";
const CLASSIFICATION_ID = "131";
const TARGET_TABLE = "raw.ssb_klass_kommuner";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-klass-kommuner.ndjson",
);

const WRITE_COLUMNS = [
  "code",
  "name",
  "parent_code",
  "level",
  "short_name",
  "valid_from",
  "valid_to",
  "notes",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["code"] as const;

export type SsbKlassKommunerSummary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  snapshotDate: string;
};

export async function run(): Promise<SsbKlassKommunerSummary> {
  logger.info("source.start", {
    source_id: SOURCE_ID,
    classification_id: CLASSIFICATION_ID,
  });
  const started = Date.now();

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const resp = await fetchKlassCodesAt({
    classificationId: CLASSIFICATION_ID,
    date: snapshotDate,
    language: "nb",
  });

  const rows: SsbKlassKommunerRow[] = resp.codes.map((c) => ({
    code: c.code,
    name: c.name,
    parent_code: c.parentCode,
    level: c.level,
    short_name: c.shortName || null,
    valid_from: c.validFrom,
    valid_to: c.validTo,
    notes: c.notes,
  }));

  await writeNdjson(OUTPUT_PATH, rows);

  let rowsWritten = 0;
  const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
  if (wroteToPostgres) {
    const sql = getSql();
    const now = new Date();
    const pgRows = rows.map((r) => ({ ...r, loaded_at: now }));
    logger.info("postgres.upsert.start", { table: TARGET_TABLE, row_count: pgRows.length });
    const upsertStart = Date.now();
    rowsWritten = await upsert(sql, {
      table: TARGET_TABLE,
      rows: pgRows,
      columns: WRITE_COLUMNS,
      conflictKeys: CONFLICT_KEYS,
    });
    logger.info("postgres.upsert.done", {
      table: TARGET_TABLE,
      rows_written: rowsWritten,
      duration_ms: Date.now() - upsertStart,
    });
    await closeSql();
  } else {
    logger.info("postgres.upsert.skipped", {
      reason: "DATABASE_URL not set — ran in NDJSON-only mode",
    });
  }

  const summary = {
    source_id: SOURCE_ID,
    row_count: rows.length,
    duration_ms: Date.now() - started,
    output_path: OUTPUT_PATH,
    wrote_to_postgres: wroteToPostgres,
    rows_written: rowsWritten,
    snapshot_date: snapshotDate,
  };
  logger.info("source.done", summary);

  return {
    rowCount: rows.length,
    outputPath: OUTPUT_PATH,
    wroteToPostgres,
    rowsWritten,
    snapshotDate,
  };
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
