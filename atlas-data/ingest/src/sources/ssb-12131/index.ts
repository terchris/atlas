/**
 * SSB KOSTRA 12131 — Stønadssatser for sosialhjelp. See ./README.md.
 * Identical shape to ssb-12063 / ssb-12292.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

type Row = {
  region_code: string; year: number;
  contents_code: string; contents_label: string;
  value: number | null; status: string | null;
};

export const SOURCE_ID = "ssb-12131";
const TABLE_ID = "12131";
const TARGET_TABLE = "raw.ssb_12131";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-12131.ndjson",
);
const WRITE_COLUMNS = [
  "region_code", "year", "contents_code", "contents_label",
  "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = ["region_code", "year", "contents_code"] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();
    const resp = await fetchPxTableData({
      tableId: TABLE_ID, lang: "no",
      filters: { Tid: "TOP(1)", ContentsCode: "*", KOKkommuneregion0000: "*" },
    });
    const rows = parseJsonStat2(resp).map(toRow);
    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten = await upsert(sql, {
        table: TARGET_TABLE,
        rows: rows.map((r) => ({ ...r, loaded_at: now })),
        columns: WRITE_COLUMNS, conflictKeys: CONFLICT_KEYS,
      });
    }
    logger.info("source.done", {
      source_id: SOURCE_ID, row_count: rows.length,
      duration_ms: Date.now() - started,
      wrote_to_postgres: wroteToPostgres, rows_written: rowsWritten,
      upstream_updated: resp.updated,
    });
    return {
      output: undefined,
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: new Date(resp.updated),
      },
    };
  });
}

function toRow(px: PxRow): Row {
  const region = px.dimensions["KOKkommuneregion0000"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !contents || !tid) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) throw new Error(`Non-integer year: ${tid.code}`);
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
  });
  process.exit(1);
});
