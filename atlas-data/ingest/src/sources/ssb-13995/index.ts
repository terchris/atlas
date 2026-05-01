/**
 * SSB table 13995 — Sosialhjelpstilfeller, utbetalt beløp og stønadstid.
 * See ./README.md.
 *
 * Three elimination=false dimensions — explicit filters required.
 * Region dimension is named `KOKkommuneregion0000` (KOSTRA-specific) rather
 * than `Region`; we map it to region_code at the ingest boundary.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

type Ssb13995Row = {
  region_code: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-13995";
const TABLE_ID = "13995";
const TARGET_TABLE = "raw.ssb_13995";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-13995.ndjson",
);

const WRITE_COLUMNS = [
  "region_code",
  "year",
  "contents_code",
  "contents_label",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["region_code", "year", "contents_code"] as const;

export type Ssb13995Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  regionCount: number;
  contentsCodeCount: number;
};

export async function run(): Promise<Ssb13995Summary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
    const started = Date.now();

    const resp = await fetchPxTableData({
      tableId: TABLE_ID,
      lang: "no",
      filters: {
        Tid: "TOP(1)",
        ContentsCode: "*",
        KOKkommuneregion0000: "*",
      },
    });

    const pxRows = parseJsonStat2(resp);
    const rows = pxRows.map(toRow);

    const regions = new Set<string>();
    const contents = new Set<string>();
    const years = new Set<number>();
    for (const r of rows) {
      regions.add(r.region_code);
      contents.add(r.contents_code);
      years.add(r.year);
    }
    const latestYear = Math.max(...years);

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
      latest_year: latestYear,
      region_count: regions.size,
      contents_code_count: contents.size,
    };
    logger.info("source.done", summary);

    return {
      output: {
        rowCount: rows.length,
        outputPath: OUTPUT_PATH,
        wroteToPostgres,
        rowsWritten,
        latestYear,
        regionCount: regions.size,
        contentsCodeCount: contents.size,
      },
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: new Date(resp.updated),
      },
    };
  });
}

function toRow(px: PxRow): Ssb13995Row {
  const region = px.dimensions["KOKkommuneregion0000"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !contents || !tid) {
    throw new Error(
      `Expected KOKkommuneregion0000, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`Unexpected non-integer year code: ${tid.code}`);
  }
  return {
    region_code: region.code,
    year,
    contents_code: contents.code,
    contents_label: contents.label,
    value: px.value,
    status: px.status ?? null,
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
