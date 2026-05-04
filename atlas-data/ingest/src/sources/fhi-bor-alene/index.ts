/**
 * FHI Folkehelsestatistikk table 187 — "Personer som bor alene" (adults
 * living alone). See ./README.md for full notes.
 *
 * First non-SSB source in Atlas. Proves the framework generalises to
 * another provider with a different API shape (POST body, FHI's dimension
 * codes AAR/ALDER/GEO/MEASURE_TYPE) while still emitting json-stat2 that
 * our existing parser handles.
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

type FhiBorAleneRow = {
  geo_code: string;
  aar_code: string;
  alder_code: string;
  measure_type: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "fhi-bor-alene";
const FHI_SOURCE_ID = "nokkel";
const FHI_TABLE_ID = 187;
const TARGET_TABLE = "raw.fhi_bor_alene";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/fhi-bor-alene.ndjson",
);

const WRITE_COLUMNS = [
  "geo_code",
  "aar_code",
  "alder_code",
  "measure_type",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["geo_code", "aar_code", "alder_code", "measure_type"] as const;

export type FhiBorAleneSummary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestAar: string;
  regionCount: number;
  alderGroups: string[];
  measureTypes: string[];
};

export async function run(): Promise<FhiBorAleneSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", {
      source_id: SOURCE_ID,
      fhi_source: FHI_SOURCE_ID,
      fhi_table: FHI_TABLE_ID,
    });
    const started = Date.now();

    // Pull the latest year, every age group, every region, every measure.
    // Approximate cell count: 1 year × ~10 age bands × ~400 regions × 3
    // measures ≈ 12 000 cells — well under FHI's 50 000-row ceiling.
    const resp = await fetchFhiTableData({
      sourceId: FHI_SOURCE_ID,
      tableId: FHI_TABLE_ID,
      request: {
        dimensions: [
          { code: "AAR", filter: "bottom", values: ["1"] },
          { code: "ALDER", filter: "all", values: ["*"] },
          { code: "GEO", filter: "all", values: ["*"] },
          { code: "MEASURE_TYPE", filter: "all", values: ["*"] },
        ],
        response: { format: "json-stat2", maxRowCount: 50000 },
      },
    });

    const pxRows = parseJsonStat2(resp);
    const rows = pxRows.map(toRow);

    const regions = new Set<string>();
    const alders = new Set<string>();
    const measures = new Set<string>();
    const aars = new Set<string>();
    for (const r of rows) {
      regions.add(r.geo_code);
      alders.add(r.alder_code);
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
      alder_count: alders.size,
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
        alderGroups: [...alders].sort(),
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

function toRow(px: PxRow): FhiBorAleneRow {
  const geo = px.dimensions["GEO"];
  const aar = px.dimensions["AAR"];
  const alder = px.dimensions["ALDER"];
  const measure = px.dimensions["MEASURE_TYPE"];
  if (!geo || !aar || !alder || !measure) {
    throw new Error(
      `Expected GEO, AAR, ALDER, MEASURE_TYPE dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  return {
    geo_code: geo.code,
    aar_code: aar.code,
    alder_code: alder.code,
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
