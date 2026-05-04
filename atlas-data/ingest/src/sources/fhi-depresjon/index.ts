/**
 * FHI Folkehelsestatistikk table 339 — Depressive symptomer_Ungdata_KH.
 * Share of youth reporting depressive symptoms in the Ungdata survey,
 * by region × sex × socioeconomic status. Pairs with fhi-livskvalitet
 * (table 373) on the same Ungdata cohort base.
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
  kjonn_code: string;
  alder_code: string;
  depresjon_code: string;
  soes_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-depresjon";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 339;
const TARGET_TABLE = "raw.fhi_depresjon";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-depresjon.ndjson",
);
const WRITE_COLUMNS = [
  "geo_code", "aar_code", "kjonn_code", "alder_code",
  "depresjon_code", "soes_code", "measure_type",
  "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = [
  "geo_code", "aar_code", "kjonn_code", "alder_code",
  "depresjon_code", "soes_code", "measure_type",
] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    // Cell budget: full product is 14 AAR × 409 GEO × 3 KJONN × 4 SOES ×
    // 1 ALDER × 1 DEPRESJON × 2 MEASURE = 137,424 — over FHI's 50k cap.
    // Filter AAR=bottom(4) (last 4 years) → 4 × 409 × 3 × 4 × 1 × 1 × 2
    // = 39,264 cells. Keeps both sex and SES breakdowns; older years
    // (2012–2021) can be added as a sibling backfill source if needed.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["4"] },
          { code: "KJONN", filter: "all", values: ["*"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "DEPRESJON", filter: "all", values: ["*"] },
          { code: "SOES", filter: "all", values: ["*"] },
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
  const kjonn = px.dimensions["KJONN"];
  const alder = px.dimensions["ALDER"];
  const depresjon = px.dimensions["DEPRESJON"];
  const soes = px.dimensions["SOES"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !kjonn || !alder || !depresjon || !soes || !measure) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    kjonn_code: kjonn.code,
    alder_code: alder.code,
    depresjon_code: depresjon.code,
    soes_code: soes.code,
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
