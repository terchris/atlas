/**
 * SSB Klass classification 104 — Fylker (active code list snapshot).
 * See ./README.md for full source notes. Structurally identical to
 * ssb-klass-kommuner; only the classification id and target table differ.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKlassCodesRange, fetchKlassClassification } from "../../lib/klass.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";

type SsbKlassFylkerRow = {
  code: string;
  name: string;
  parent_code: string | null;
  level: string | null;
  short_name: string | null;
  valid_from: string | null;
  valid_to: string | null;
  valid_from_in_range: string;
  valid_to_in_range: string | null;
  notes: string | null;
};

export const SOURCE_ID = "ssb-klass-fylker";
const CLASSIFICATION_ID = "104";
const TARGET_TABLE = "raw.ssb_klass_fylker";
const HISTORY_FROM = "1960-01-01";
const HISTORY_TO = "2100-01-01";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-klass-fylker.ndjson",
);

const WRITE_COLUMNS = [
  "code",
  "name",
  "parent_code",
  "level",
  "short_name",
  "valid_from",
  "valid_to",
  "valid_from_in_range",
  "valid_to_in_range",
  "notes",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["code", "valid_from_in_range"] as const;

export type SsbKlassFylkerSummary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  snapshotDate: string;
};

export async function run(): Promise<SsbKlassFylkerSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", {
      source_id: SOURCE_ID,
      classification_id: CLASSIFICATION_ID,
    });
    const started = Date.now();

    const snapshotDate = new Date().toISOString().slice(0, 10);
    const resp = await fetchKlassCodesRange({
      classificationId: CLASSIFICATION_ID,
      from: HISTORY_FROM,
      to: HISTORY_TO,
      language: "nb",
    });

    const rows: SsbKlassFylkerRow[] = resp.codes
      .filter((c): c is typeof c & { validFromInRequestedRange: string } =>
        c.validFromInRequestedRange !== null,
      )
      .map((c) => ({
        code: c.code,
        name: c.name,
        parent_code: c.parentCode,
        level: c.level,
        short_name: c.shortName || null,
        valid_from: c.validFrom,
        valid_to: c.validTo,
        valid_from_in_range: c.validFromInRequestedRange,
        valid_to_in_range: c.validToInRequestedRange,
        notes: c.notes || null,
      }));

    await writeNdjson(OUTPUT_PATH, rows);

    // Classification version metadata — see migration 080's header. Same
    // reasoning as ssb-klass-kommuner, now a second real consumer of
    // fetchKlassClassification rather than a one-off.
    const classification = await fetchKlassClassification(CLASSIFICATION_ID);
    const versionRows = classification.versions.map((v) => ({
      classification_id: CLASSIFICATION_ID,
      version_id: String(v.id),
      version_name: v.name,
      valid_from: v.validFrom,
      // See ssb-klass-kommuner's own comment: `validTo` is absent from the
      // JSON entirely for the current version, not present as null.
      valid_to: v.validTo ?? null,
    }));

    let rowsWritten = 0;
    let versionRowsWritten = 0;
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

      versionRowsWritten = await upsert(sql, {
        table: "raw.ssb_klass_versions",
        rows: versionRows.map((r) => ({ ...r, loaded_at: now })),
        columns: ["classification_id", "version_id", "version_name", "valid_from", "valid_to", "loaded_at"],
        conflictKeys: ["classification_id", "version_id"],
      });
      logger.info("postgres.upsert.done", {
        table: "raw.ssb_klass_versions",
        rows_written: versionRowsWritten,
      });
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
      output: {
        rowCount: rows.length,
        outputPath: OUTPUT_PATH,
        wroteToPostgres,
        rowsWritten,
        snapshotDate,
      },
      record: {
        // KLASS classifications are versioned by valid_from / valid_to;
        // there is no single "updated" timestamp per fetch.
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: null,
      },
    };
  });
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
