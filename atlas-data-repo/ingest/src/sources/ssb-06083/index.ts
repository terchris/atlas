/**
 * SSB table 06083 — Familier, etter familietype. See ./README.md.
 * Four dimensions: Region × FamilieType × ContentsCode × Tid.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import type { PxRow } from "../../lib/types.js";

type Ssb06083Row = {
  region_code: string;
  family_type: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-06083";
const TABLE_ID = "06083";
const TARGET_TABLE = "raw.ssb_06083";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-06083.ndjson",
);
const WRITE_COLUMNS = [
  "region_code", "family_type", "year",
  "contents_code", "contents_label", "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = ["region_code", "family_type", "year", "contents_code"] as const;

export async function run() {
  logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
  const started = Date.now();

  const resp = await fetchPxTableData({
    tableId: TABLE_ID,
    lang: "no",
    filters: { Tid: "TOP(1)", ContentsCode: "*", Region: "*", FamilieType: "*" },
  });

  const rows = parseJsonStat2(resp).map(toRow);
  await writeNdjson(OUTPUT_PATH, rows);

  let rowsWritten = 0;
  const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
  if (wroteToPostgres) {
    const sql = getSql();
    const now = new Date();
    const pgRows = rows.map((r) => ({ ...r, loaded_at: now }));
    rowsWritten = await upsert(sql, {
      table: TARGET_TABLE, rows: pgRows,
      columns: WRITE_COLUMNS, conflictKeys: CONFLICT_KEYS,
    });
    await closeSql();
  }

  logger.info("source.done", {
    source_id: SOURCE_ID, row_count: rows.length,
    duration_ms: Date.now() - started,
    wrote_to_postgres: wroteToPostgres, rows_written: rowsWritten,
    upstream_updated: resp.updated,
  });
}

function toRow(px: PxRow): Ssb06083Row {
  const region = px.dimensions["Region"];
  const family = px.dimensions["FamilieType"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !family || !contents || !tid) {
    throw new Error(
      `Expected Region, FamilieType, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) throw new Error(`Non-integer year: ${tid.code}`);
  return {
    region_code: region.code, family_type: family.code, year,
    contents_code: contents.code, contents_label: contents.label,
    value: px.value, status: px.status ?? null,
  };
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
