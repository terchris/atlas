/**
 * SSB table 06913 — Folkemengde 1. januar og endringer i kalenderåret
 * (folketilvekst, fødsler, dødsfall, inn/utflytting). See ./README.md.
 *
 * Same 3-dimension shape as ssb-08764: Region × ContentsCode × Tid. Differs
 * only in the set of ContentsCodes (8 vs 5) and the table id.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import type { PxRow } from "../../lib/types.js";

/** Row shape for raw.ssb_06913. */
type Ssb06913Row = {
  region_code: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-06913";
const TABLE_ID = "06913";
const TARGET_TABLE = "raw.ssb_06913";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-06913.ndjson",
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

export type Ssb06913Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  earliestYear: number;
  contentsCodes: string[];
  regionCount: number;
};

export async function run(): Promise<Ssb06913Summary> {
  logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
  const started = Date.now();

  const resp = await fetchPxTableData({ tableId: TABLE_ID, lang: "no" });
  const pxRows = parseJsonStat2(resp);
  const rows = pxRows.map(toRow);

  const years = new Set<number>();
  const regions = new Set<string>();
  const contentsCodes = new Set<string>();
  for (const r of rows) {
    years.add(r.year);
    regions.add(r.region_code);
    contentsCodes.add(r.contents_code);
  }
  const sortedYears = [...years].sort((a, b) => a - b);

  await writeNdjson(OUTPUT_PATH, rows);

  let rowsWritten = 0;
  const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
  if (wroteToPostgres) {
    const sql = getSql();
    const now = new Date();
    const pgRows = rows.map((r) => ({
      region_code: r.region_code,
      year: r.year,
      contents_code: r.contents_code,
      contents_label: r.contents_label,
      value: r.value,
      status: r.status,
      loaded_at: now,
    }));
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
    upstream_updated: resp.updated,
    earliest_year: sortedYears[0] ?? 0,
    latest_year: sortedYears[sortedYears.length - 1] ?? 0,
    region_count: regions.size,
    contents_codes: [...contentsCodes],
  };
  logger.info("source.done", summary);

  return {
    rowCount: rows.length,
    outputPath: OUTPUT_PATH,
    wroteToPostgres,
    rowsWritten,
    earliestYear: summary.earliest_year,
    latestYear: summary.latest_year,
    contentsCodes: [...contentsCodes],
    regionCount: regions.size,
  };
}

function toRow(px: PxRow): Ssb06913Row {
  const region = px.dimensions["Region"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !contents || !tid) {
    throw new Error(
      `Expected Region, ContentsCode, Tid dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
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
