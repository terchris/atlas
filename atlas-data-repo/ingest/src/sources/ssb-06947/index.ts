/**
 * SSB table 06947 — Personer i husholdninger med lavinntekt (EU- og OECD-skala).
 * Whole-population complement to ssb-08764 (children under 18). Same shape
 * (Region × ContentsCode × Tid; same 5 content codes).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import type { PxRow } from "../../lib/types.js";

type Ssb06947Row = {
  region_code: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-06947";
const TABLE_ID = "06947";
const TARGET_TABLE = "raw.ssb_06947";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-06947.ndjson",
);

const WRITE_COLUMNS = [
  "region_code", "year", "contents_code", "contents_label",
  "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = ["region_code", "year", "contents_code"] as const;

export type Ssb06947Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  regionCount: number;
  contentsCodes: string[];
};

export async function run(): Promise<Ssb06947Summary> {
  logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
  const started = Date.now();

  // ContentsCode and Tid marked elimination=false — explicit filters required.
  const resp = await fetchPxTableData({
    tableId: TABLE_ID,
    lang: "no",
    filters: { Tid: "TOP(1)", ContentsCode: "*", Region: "*" },
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
      table: TARGET_TABLE, rows: pgRows,
      columns: WRITE_COLUMNS, conflictKeys: CONFLICT_KEYS,
    });
    logger.info("postgres.upsert.done", {
      table: TARGET_TABLE, rows_written: rowsWritten,
      duration_ms: Date.now() - upsertStart,
    });
    await closeSql();
  } else {
    logger.info("postgres.upsert.skipped", { reason: "DATABASE_URL not set" });
  }

  logger.info("source.done", {
    source_id: SOURCE_ID, row_count: rows.length,
    duration_ms: Date.now() - started, output_path: OUTPUT_PATH,
    wrote_to_postgres: wroteToPostgres, rows_written: rowsWritten,
    upstream_updated: resp.updated, latest_year: latestYear,
    region_count: regions.size, contents_codes: [...contents],
  });

  return {
    rowCount: rows.length, outputPath: OUTPUT_PATH,
    wroteToPostgres, rowsWritten, latestYear,
    regionCount: regions.size, contentsCodes: [...contents].sort(),
  };
}

function toRow(px: PxRow): Ssb06947Row {
  const region = px.dimensions["Region"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !contents || !tid) {
    throw new Error(
      `Expected Region, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`Unexpected non-integer year code: ${tid.code}`);
  }
  return {
    region_code: region.code, year,
    contents_code: contents.code, contents_label: contents.label,
    value: px.value, status: px.status ?? null,
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
