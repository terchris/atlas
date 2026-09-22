/**
 * FHI Folkehelsestatistikk table 175 — Innvandrere og norskfødte med
 * innvandrerforeldre, etter LANDBAK. Population with immigrant background
 * (1st-gen immigrants + Norwegian-born with immigrant parents) by country
 * background, age band, and region.
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
  landbak_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-innvandrere";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 175;
const TARGET_TABLE = "raw.fhi_innvandrere";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-innvandrere.ndjson",
);
const WRITE_COLUMNS = [
  "geo_code", "aar_code", "alder_code", "landbak_code",
  "measure_type", "value", "status", "loaded_at",
] as const;
const CONFLICT_KEYS = [
  "geo_code", "aar_code", "alder_code", "landbak_code", "measure_type",
] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    // 🔴 KJONN IS REQUIRED BY FHI AND PINNED TO THE TOTAL. Without it the
    // request returns HTTP 400 and the whole source stops:
    //
    //     "List of supplied dimensions does not match the required dimensions
    //      for this publication. Required dimensions: GEO,AAR,KJONN,ALDER,LANDBAK"
    //
    // ⚠️ FHI ADDED THAT REQUIREMENT AFTER THIS SOURCE WAS WRITTEN. The last
    // success was 2026-09-14 (32 720 rows); it then failed on 09-20 and 09-22
    // and NOTHING RAISED IT — the ingest run recorded exit=1 and the pipeline
    // stayed green, because a source that fails to refresh still has yesterday's
    // rows. `raw_sources_were_refreshed_recently` is the only check that caught
    // it, 8 days and two silent failures later (urb-agents #1392).
    //
    // 🔵 `KJONN: "0"` IS BOTH SEXES — the total, not a breakthrough of a new
    // dimension. It is pinned deliberately: raw.fhi_innvandrere has no kjonn
    // column and this table has never been published by sex, so the fix
    // restores the previous series rather than widening it. Measured
    // 2026-09-22, GEO=0 / LANDBAK=100 / ALDER=0_120 / TELLER:
    //
    //     2026 -> 1 225 627        (the year the 400 was hiding)
    //     2025 -> 1 195 350        (must equal what raw already holds)
    //
    // ⚠️ Adding KJONN to `values` instead of pinning it would TRIPLE the
    // response and silently change the grain of every downstream row.
    //
    // 🔴 AND THE RESPONSE IS NOW 3.8x BIGGER, WHICH IS NOT THIS FIX'S DOING.
    // FHI has also EXPANDED the GEO dimension. Measured 2026-09-22:
    //
    //     was  409 codes  =  357 kommune + 36 bydel + 15 fylke + 1 nasjon
    //     now 1546 codes  =  the same 409 + 1137 new TEN-DIGIT sub-municipal
    //                        codes (e.g. 3240000005, 3403000001)
    //
    //     409 x 10 ALDER x 8 LANDBAK =  32 720   <- rows written 2026-09-14
    //    1546 x 10 ALDER x 8 LANDBAK = 123 680   <- cells returned today
    //
    // ⚠️ THE OLD "409 GEO ... 32.7k" COMMENT WAS CORRECT WHEN WRITTEN and I
    // very nearly "corrected" it as bad arithmetic. It matches the 32 720 rows
    // that actually landed, exactly. The number did not become wrong; the
    // world under it changed.
    //
    // 🔵 The ten-digit codes are handled and this is checked, not assumed:
    // classify_region_code has no branch for length 10, so they fall to
    // 'unknown', region_code_to_kommune_nr yields NULL, and
    // fact_kommune_indicators drops them on `kommune_nr is not null`. None of
    // them can reach a published kommune figure. 🔵 raw keeps them verbatim,
    // which is the rule — FHI decides its own GEO set and Atlas does not
    // curate it.
    //
    // ⚠️ Expect raw.fhi_innvandrere to go from ~32.7k to ~123.7k rows on the
    // next successful load. That is upstream widening its geography, not a
    // duplication bug.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "KJONN", filter: "item", values: ["0"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "LANDBAK", filter: "all", values: ["*"] },
          { code: "GEO", filter: "all", values: ["*"] },
          { code: "MEASURE_TYPE", filter: "item", values: ["TELLER"] },
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
  const landbak = px.dimensions["LANDBAK"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !alder || !landbak || !measure) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    alder_code: alder.code,
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
