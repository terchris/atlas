/**
 * FHI Folkehelsestatistikk table 932 — INNVAND_INNVKAT (was 650). Population split by
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
// 🔴 WAS 650. FHI DELETED THAT TABLE — it returns 404 "Table not found",
// the same response as a table id that never existed. Renumbered to 932
// `INNVAND_INNVKAT` (modified 2026-09-18).
//
// ⚠️ THIS IS A REPOINT, NOT A NEW SOURCE, AND HERE IS THE EVIDENCE.
// Measured 2026-09-22 against table 932:
//
//   cardinalities   409 GEO x 10 ALDER x 3 INNVKAT x 1 LANDBAK x 3 MEASURE
//                   = 36 810 — EXACTLY the rows this source wrote on
//                     2026-09-14, reproduced from 932's dimensions alone
//   codes           INNVKAT [23, 2, 3] · LANDBAK [0] · ALDER identical to 175
//   values 2025     INNVKAT 23 -> 1 195 350   "innvandrere og norskfødt med
//                                              innvandrerforeldre"
//                   INNVKAT  2 ->   965 113   innvandrere
//                   INNVKAT  3 ->   230 237   norskfødt med innvandrerforeldre
//                   and 965 113 + 230 237 = 1 195 350 exactly
//
// 🔵 That total is the SAME NUMBER table 175 gives for 2025 at LANDBAK=100 —
// two tables cutting one population, one by country background and one by
// immigrant category. They tie out, which is the strongest cross-check
// available without reading raw.
const FHI_TABLE_ID = 932;
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

    // 🔴 KJONN IS REQUIRED AND PINNED TO THE TOTAL, exactly as in
    // fhi-innvandrere. Table 932 carries KJONN [0,1,2]; omitting it returns
    // HTTP 400 "List of supplied dimensions does not match the required
    // dimensions". Verified: the request shape below WITHOUT this line 400s
    // against 932, and with it returns 200.
    //
    // 🔵 "0" is both sexes. raw.fhi_innvkat has no kjonn column and this
    // series has never been published by sex, so pinning restores the
    // previous grain rather than tripling it.
    //
    // 🔵 Cell budget: 1546 GEO × 1 AAR × 1 KJONN × 10 ALDER × 3 INNVKAT ×
    // 1 LANDBAK × 3 MEASURE = 139 140 cells (measured). ⚠️ GEO has grown from
    // 409 codes to 1546 — the extra 1137 are ten-digit sub-municipal codes,
    // the same upstream widening seen in fhi-innvandrere. Expect
    // raw.fhi_innvkat to go ~36.8k -> ~139.1k rows. classify_region_code has
    // no length-10 branch, so those resolve to 'unknown', kommune_nr is NULL,
    // and fact_kommune_indicators drops them.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "KJONN", filter: "item", values: ["0"] },
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
