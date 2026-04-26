/**
 * FHI Folkehelsestatistikk table 794 — Trangbodd_UTDANN. Used by Atlas as
 * the public-API substitute for Samfunnspuls's bespoke
 * ssb-spesialbestilt-bosted-husholdning extract.
 *
 * Filter strategy: UTDANN='0' (all education levels) at ingest to stay
 * under FHI's 50k-row cap. Keep every ALDER and every BODD so downstream
 * features can filter to children's age bands + "trangt" for the
 * overcrowded-child headline.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFhiTableData } from "../../lib/fhi.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import { parseJsonStat2 } from "../../lib/pxweb.js";
import type { PxRow } from "../../lib/types.js";

type Row = {
  geo_code: string;
  aar_code: string;
  alder_code: string;
  utdann_code: string;
  bodd_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-trangbodd";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 794;
const TARGET_TABLE = "raw.fhi_trangbodd";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-trangbodd.ndjson",
);

const WRITE_COLUMNS = [
  "geo_code", "aar_code", "alder_code", "utdann_code",
  "bodd_code", "measure_type", "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = ["geo_code", "aar_code", "alder_code", "utdann_code", "bodd_code", "measure_type"] as const;

export async function run() {
  logger.info("source.start", { source_id: SOURCE_ID });
  const started = Date.now();

  // Keep the full UTDANN breakdown (all 5 education levels — the whole
  // point of this table vs bor-alene) plus all BODD + ALDER. Narrow
  // MEASURE_TYPE to RATE to stay under FHI's 50 000-cell cap. Expected:
  //   1 AAR × 9 ALDER × 5 UTDANN × 2 BODD × ~409 GEO × 1 RATE ≈ 37 k cells.
  // SMR / TELLER can be added later with a parallel fetch if needed.
  const resp = await fetchFhiTableData({
    sourceId: FHI_SOURCE_ID,
    tableId: FHI_TABLE_ID,
    request: {
      dimensions: [
        { code: "AAR", filter: "bottom", values: ["1"] },
        { code: "ALDER", filter: "all", values: ["*"] },
        { code: "UTDANN", filter: "all", values: ["*"] },
        { code: "BODD", filter: "all", values: ["*"] },
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
    await closeSql();
  }
  logger.info("source.done", {
    source_id: SOURCE_ID, row_count: rows.length,
    duration_ms: Date.now() - started,
    wrote_to_postgres: wroteToPostgres, rows_written: rowsWritten,
    upstream_updated: resp.updated,
  });
}

function toRow(px: PxRow): Row {
  const geo = px.dimensions["GEO"];
  const aar = px.dimensions["AAR"];
  const alder = px.dimensions["ALDER"];
  const utdann = px.dimensions["UTDANN"];
  const bodd = px.dimensions["BODD"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !alder || !utdann || !bodd || !measure) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    alder_code: alder.code,
    utdann_code: utdann.code,
    bodd_code: bodd.code,
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
