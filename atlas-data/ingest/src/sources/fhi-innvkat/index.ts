/**
 * FHI Folkehelsestatistikk table 650 — INNVAND_INNVKAT. Population split by
 * immigrant category (1st-gen / 2nd-gen / combined) per region × age band.
 * Complements fhi-innvandrere (table 175) which has country-origin
 * granularity but no INNVKAT split.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFhiTableData } from "../../lib/fhi.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { parseJsonStat2 } from "../../lib/pxweb.js";
import type { PxRow } from "../../lib/types.js";

type Row = {
  geo_code: string;
  aar_code: string;
  alder_code: string;
  innvkat_code: string;
  landbak_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-innvkat";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 650;
const TARGET_TABLE = "raw.fhi_innvkat";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-innvkat.ndjson",
);
const WRITE_COLUMNS = [
  "geo_code", "aar_code", "alder_code", "innvkat_code", "landbak_code",
  "measure_type", "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = [
  "geo_code", "aar_code", "alder_code", "innvkat_code", "landbak_code", "measure_type",
] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    // Cell budget: 409 GEO × 1 AAR × 10 ALDER × 3 INNVKAT × 1 LANDBAK × 3 MEASURE
    // ≈ 36.8k. Fits under FHI's 50k cap with all measures included.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "INNVKAT", filter: "all", values: ["*"] },
          { code: "LANDBAK", filter: "all", values: ["*"] },
          { code: "GEO", filter: "all", values: ["*"] },
          { code: "MEASURE_TYPE", filter: "all", values: ["*"] },
        ],
        response: { format: "json-stat2", maxRowCount: 50000 },
      },
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
  const geo = px.dimensions["GEO"];
  const aar = px.dimensions["AAR"];
  const alder = px.dimensions["ALDER"];
  const innvkat = px.dimensions["INNVKAT"];
  const landbak = px.dimensions["LANDBAK"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !alder || !innvkat || !landbak || !measure) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    alder_code: alder.code,
    innvkat_code: innvkat.code,
    landbak_code: landbak.code,
    measure_type: measure.code,
    value: px.value,
    status: px.status ?? null,
  };
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
