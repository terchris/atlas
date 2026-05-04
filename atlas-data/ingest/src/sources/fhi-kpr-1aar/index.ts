/**
 * FHI Folkehelsestatistikk table 370 — KPR_1 (Kommunalt pasient- og
 * brukerregister, 1-year). Primary-care contact rates by ICPC-2 code
 * group, region, age, sex.
 *
 * The KODEGRUPPE dimension carries ICPC-2-style code ranges:
 *   P01_P29 / P70_P99   — chapter P (psychological symptoms / disorders)
 *   K70_K99             — chapter K (cardiovascular)
 *   L01_L29 / L70_L99   — chapter L (musculoskeletal)
 *   "Skader"            — injuries
 * The combined "P01_P29ogP70_P99" codes are FHI's pre-aggregated totals.
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
  kodegruppe_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-kpr-1aar";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 370;
const TARGET_TABLE = "raw.fhi_kpr_1aar";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-kpr-1aar.ndjson",
);
const WRITE_COLUMNS = [
  "geo_code", "aar_code", "kjonn_code", "alder_code",
  "kodegruppe_code", "measure_type", "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = [
  "geo_code", "aar_code", "kjonn_code", "alder_code", "kodegruppe_code", "measure_type",
] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    // Cell budget: full product is 373 GEO × 8 AAR × 3 KJONN × 10 ALDER ×
    // 11 KODEGRUPPE × 4 MEASURE = 3,938,880 — ~80× FHI's 50k cap. Filter:
    // - AAR=bottom(1) latest year
    // - KJONN=0 combined sex
    // - MEASURE_TYPE=RATE (per-1000 contact rate — the headline number)
    // → 1 × 373 × 1 × 10 × 11 × 1 = 41,030 cells.
    // SMR / MEIS / TELLER, sex-stratified, and historical slices can be
    // added as sibling sources; KPR_3 (table 369) carries 3-year averages
    // if smoother trends are needed.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "KJONN", filter: "item", values: ["0"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "KODEGRUPPE", filter: "all", values: ["*"] },
          { code: "GEO", filter: "all", values: ["*"] },
          { code: "MEASURE_TYPE", filter: "item", values: ["RATE"] },
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
  const kodegruppe = px.dimensions["KODEGRUPPE"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !kjonn || !alder || !kodegruppe || !measure) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    kjonn_code: kjonn.code,
    alder_code: alder.code,
    kodegruppe_code: kodegruppe.code,
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
