/**
 * SSB table 12891 — Etternavn brukt av 200 personer eller flere (surnames
 * used by 200+ persons, per year). See ./README.md for full source notes,
 * including the 200-persons-or-more coverage caveat.
 *
 * Dagster Pipes wiring is centralised in lib/ingest_run.ts — this module
 * stays Dagster-unaware. Runs identically inside and outside Dagster.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

/** Row shape for raw.ssb_12891. Etternavn × ContentsCode × Tid cell. */
type Ssb12891Row = {
  name_code: string;
  name_label: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-12891";
const TABLE_ID = "12891";
const TARGET_TABLE = "raw.ssb_12891";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-12891.ndjson",
);

/**
 * The column order used when writing to raw.ssb_12891. Kept close to the
 * target table schema; `loaded_at` is added at the point of write.
 */
const WRITE_COLUMNS = [
  "name_code",
  "name_label",
  "year",
  "contents_code",
  "contents_label",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["name_code", "year", "contents_code"] as const;

export type Ssb12891Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  earliestYear: number;
  nameCount: number;
};

export async function run(): Promise<Ssb12891Summary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
    const started = Date.now();

    // ⚠️ EXPLICIT "*" FILTERS ARE NOT OPTIONAL HERE — same trap as
    // ssb-10501, independently confirmed for this table: a no-filter call
    // silently returns only 911 of 3706 Etternavn codes. See that source's
    // comment for the full reasoning.
    const resp = await fetchPxTableData({
      tableId: TABLE_ID,
      lang: "no",
      filters: { Etternavn: "*", ContentsCode: "*", Tid: "*" },
    });
    const pxRows = parseJsonStat2(resp);
    const rows = pxRows.map(toRow);

    const years = new Set<number>();
    const names = new Set<string>();
    for (const r of rows) {
      years.add(r.year);
      names.add(r.name_code);
    }
    const sortedYears = [...years].sort((a, b) => a - b);

    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      const pgRows = rows.map((r) => ({
        name_code: r.name_code,
        name_label: r.name_label,
        year: r.year,
        contents_code: r.contents_code,
        contents_label: r.contents_label,
        value: r.value,
        status: r.status,
        loaded_at: now,
      }));
      logger.info("postgres.upsert.start", {
        table: TARGET_TABLE,
        row_count: pgRows.length,
      });
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
      upstream_updated: resp.updated,
      earliest_year: sortedYears[0] ?? 0,
      latest_year: sortedYears[sortedYears.length - 1] ?? 0,
      name_count: names.size,
    };
    logger.info("source.done", summary);

    return {
      output: {
        rowCount: rows.length,
        outputPath: OUTPUT_PATH,
        wroteToPostgres,
        rowsWritten,
        earliestYear: summary.earliest_year,
        latestYear: summary.latest_year,
        nameCount: names.size,
      },
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: new Date(resp.updated),
      },
    };
  });
}

function toRow(px: PxRow): Ssb12891Row {
  const etternavn = px.dimensions["Etternavn"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!etternavn || !contents || !tid) {
    throw new Error(
      `Expected Etternavn, ContentsCode, Tid dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`Unexpected non-integer year code: ${tid.code}`);
  }
  return {
    name_code: etternavn.code,
    name_label: etternavn.label,
    year,
    contents_code: contents.code,
    contents_label: contents.label,
    value: px.value,
    status: px.status ?? null,
  };
}

// Invoked directly via `npm run ingest:ssb-12891`.
run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
