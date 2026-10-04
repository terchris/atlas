/**
 * SSB table 10501 — Personer, etter jente- eller guttenavn (persons by first
 * name, per year). See ./README.md for full source notes, including the
 * 200-persons-or-more coverage caveat.
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

/** Row shape for raw.ssb_10501. Fornavn × ContentsCode × Tid cell. */
type Ssb10501Row = {
  name_code: string;
  name_label: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-10501";
const TABLE_ID = "10501";
const TARGET_TABLE = "raw.ssb_10501";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-10501.ndjson",
);

/**
 * The column order used when writing to raw.ssb_10501. Kept close to the
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

export type Ssb10501Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  earliestYear: number;
  nameCount: number;
};

export async function run(): Promise<Ssb10501Summary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
    const started = Date.now();

    // ⚠️ EXPLICIT "*" FILTERS ARE NOT OPTIONAL HERE. Measured directly: a
    // no-filter call (what ssb-08764's template does) silently returns only
    // 1134 of 2152 Fornavn codes — SSB's PxWebAPI v2 default selection for
    // this table happens to be girl names only, not "every code". The
    // request succeeds and returns a plausible-looking dataset either way,
    // which is exactly the shape of defect a row-count check after the fact
    // would catch but a human reading the ingest code would not — so every
    // dimension is selected explicitly rather than relying on the default.
    const resp = await fetchPxTableData({
      tableId: TABLE_ID,
      lang: "no",
      filters: { Fornavn: "*", ContentsCode: "*", Tid: "*" },
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

function toRow(px: PxRow): Ssb10501Row {
  const fornavn = px.dimensions["Fornavn"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!fornavn || !contents || !tid) {
    throw new Error(
      `Expected Fornavn, ContentsCode, Tid dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`Unexpected non-integer year code: ${tid.code}`);
  }
  return {
    name_code: fornavn.code,
    name_label: fornavn.label,
    year,
    contents_code: contents.code,
    contents_label: contents.label,
    value: px.value,
    status: px.status ?? null,
  };
}

// Invoked directly via `npm run ingest:ssb-10501`.
run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
