/**
 * FHI Folkehelsestatistikk table 348 — "Ensomhet_Ungdata_KH" (loneliness
 * among 8th-10th graders, Ungdata survey, published per kommune). See
 * ./README.md for full notes.
 *
 * Added for urb-agents #2100/#2101 (T5): atlas-scraper/rcdotno asked Atlas to
 * confirm fhi-bor-alene (a count) and serve loneliness itself, per
 * municipality, clearly named as a rate, IF it exists at that grain.
 * Confirmed it exists per kommune, measured 2026-11-08 — but most cells are
 * suppressed for small sample size: only 100 of 357 kommuner carry a non-null
 * "total" value (96 for the boys/girls breakdowns). This ingests it anyway,
 * suppression and all, same as every other source — Atlas does not decide
 * which cells "count" as available.
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

type FhiEnsomhetRow = {
  geo_code: string;
  aar_code: string;
  kjonn_code: string;
  alder_code: string;
  niva_plaget_code: string;
  soes_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-ensomhet";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 348;
const TARGET_TABLE = "raw.fhi_ensomhet";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-ensomhet.ndjson",
);

const WRITE_COLUMNS = [
  "geo_code",
  "aar_code",
  "kjonn_code",
  "alder_code",
  "niva_plaget_code",
  "soes_code",
  "measure_type",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = [
  "geo_code",
  "aar_code",
  "kjonn_code",
  "alder_code",
  "niva_plaget_code",
  "soes_code",
  "measure_type",
] as const;

export type FhiEnsomhetSummary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestAar: string;
  regionCount: number;
  measureTypes: string[];
};

export async function run(): Promise<FhiEnsomhetSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", {
      source_id: SOURCE_ID,
      fhi_source: FHI_SOURCE_ID,
      fhi_table: FHI_TABLE_ID,
    });
    const started = Date.now();

    // Latest year, every region, every KJONN (total/boys/girls) — ALDER,
    // NIVA_PLAGET and SOES each resolve to a single category at this table's
    // grain (measured 2026-11-08: 8-10.trinn / "ganske eller veldig mye
    // plaget" / samlet), but requested as "all" rather than hardcoded so a
    // future upstream change that adds more categories arrives instead of
    // erroring. MEASURE_TYPE must be requested as a specific item — "all" is
    // rejected by this endpoint — and SMR is the only value this table has
    // (no RATE, no TELLER; confirmed by probing all three and getting
    // "not found for datasetId" on the other two).
    // ~409 GEO x 1 AAR x 3 KJONN x 1 x 1 x 1 x 1 MEASURE_TYPE ~= 1 227 cells.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "GEO", filter: "all", values: ["*"] },
          { code: "KJONN", filter: "all", values: ["*"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "NIVA_PLAGET", filter: "all", values: ["*"] },
          { code: "SOES", filter: "all", values: ["*"] },
          { code: "MEASURE_TYPE", filter: "item", values: ["SMR"] },
        ],
        response: { format: "json-stat2", maxRowCount: 50000 },
      },
    });

    const pxRows = parseJsonStat2(resp);
    const rows = pxRows.map(toRow);

    const regions = new Set<string>();
    const measures = new Set<string>();
    const aars = new Set<string>();
    for (const r of rows) {
      regions.add(r.geo_code);
      measures.add(r.measure_type);
      aars.add(r.aar_code);
    }
    const latestAar = [...aars].sort().at(-1) ?? "";

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
      latest_aar: latestAar,
      region_count: regions.size,
      measure_types: [...measures],
    };
    logger.info("source.done", summary);

    return {
      output: {
        rowCount: rows.length,
        outputPath: OUTPUT_PATH,
        wroteToPostgres,
        rowsWritten,
        latestAar,
        regionCount: regions.size,
        measureTypes: [...measures].sort(),
      },
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: new Date(resp.updated),
      },
    };
  });
}

function toRow(px: PxRow): FhiEnsomhetRow {
  const geo = px.dimensions["GEO"];
  const aar = px.dimensions["AAR"];
  const kjonn = px.dimensions["KJONN"];
  const alder = px.dimensions["ALDER"];
  const nivaPlaget = px.dimensions["NIVA_PLAGET"];
  const soes = px.dimensions["SOES"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !kjonn || !alder || !nivaPlaget || !soes || !measure) {
    throw new Error(
      `Expected GEO, AAR, KJONN, ALDER, NIVA_PLAGET, SOES, MEASURE_TYPE dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    kjonn_code: kjonn.code,
    alder_code: alder.code,
    niva_plaget_code: nivaPlaget.code,
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
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
