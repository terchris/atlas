/**
 * SSB table 07459 — Alders- og kjønnsfordeling i kommuner, fylker og hele
 * landets befolkning. See ./README.md for full source notes.
 *
 * Five dimensions: Region × Kjonn × Alder × ContentsCode × Tid. The Alder
 * dimension has 106 single-year codes ("000".."104", plus "105+"), which
 * makes this the largest SSB pull in the Atlas catalogue so far
 * (~210 k cells at the PxWebAPI default of one Tid period).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

/** Row shape for raw.ssb_07459. */
type Ssb07459Row = {
  region_code: string;
  sex: string;
  age: string;
  year: number;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-07459";
const TABLE_ID = "07459";
const TARGET_TABLE = "raw.ssb_07459";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-07459.ndjson",
);

const WRITE_COLUMNS = [
  "region_code",
  "sex",
  "age",
  "year",
  "contents_code",
  "contents_label",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["region_code", "sex", "age", "year", "contents_code"] as const;

export type Ssb07459Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  latestYear: number;
  earliestYear: number;
  regionCount: number;
  sexCount: number;
  ageCount: number;
  contentsCodes: string[];
};

export async function run(): Promise<Ssb07459Summary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
    const started = Date.now();

    // 07459 has ContentsCode and Tid flagged elimination=false in its metadata,
    // so we must explicitly select them. Wildcarding Region/Kjonn/Alder keeps
    // the response at full kommune × sex × age granularity.
    const resp = await fetchPxTableData({
      tableId: TABLE_ID,
      lang: "no",
      filters: {
        Tid: "TOP(1)",
        ContentsCode: "*",
        Region: "*",
        Kjonn: "*",
        Alder: "*",
      },
    });
    const pxRows = parseJsonStat2(resp);
    const rows = pxRows.map(toRow);

    const years = new Set<number>();
    const regions = new Set<string>();
    const sexes = new Set<string>();
    const ages = new Set<string>();
    const contentsCodes = new Set<string>();
    for (const r of rows) {
      years.add(r.year);
      regions.add(r.region_code);
      sexes.add(r.sex);
      ages.add(r.age);
      contentsCodes.add(r.contents_code);
    }
    const sortedYears = [...years].sort((a, b) => a - b);

    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      const pgRows = rows.map((r) => ({
        region_code: r.region_code,
        sex: r.sex,
        age: r.age,
        year: r.year,
        contents_code: r.contents_code,
        contents_label: r.contents_label,
        value: r.value,
        status: r.status,
        loaded_at: now,
      }));
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
      earliest_year: sortedYears[0] ?? 0,
      latest_year: sortedYears[sortedYears.length - 1] ?? 0,
      region_count: regions.size,
      sex_count: sexes.size,
      age_count: ages.size,
      contents_codes: [...contentsCodes],
    };
    logger.info("source.done", summary);

    return {
      output: {
        rowCount: rows.length,
        outputPath: OUTPUT_PATH,
        wroteToPostgres,
        rowsWritten,
        earliestYear: summary.earliest_year,
        latestYear: summary.latest_year,
        regionCount: regions.size,
        sexCount: sexes.size,
        ageCount: ages.size,
        contentsCodes: [...contentsCodes],
      },
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: new Date(resp.updated),
      },
    };
  });
}

function toRow(px: PxRow): Ssb07459Row {
  const region = px.dimensions["Region"];
  const kjonn = px.dimensions["Kjonn"];
  const alder = px.dimensions["Alder"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !kjonn || !alder || !contents || !tid) {
    throw new Error(
      `Expected Region, Kjonn, Alder, ContentsCode, Tid dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`Unexpected non-integer year code: ${tid.code}`);
  }
  return {
    region_code: region.code,
    sex: kjonn.code,
    age: alder.code,
    year,
    contents_code: contents.code,
    contents_label: contents.label,
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
