/**
 * SSB table 12944 — Personer i husholdninger med vedvarende lavinntekt
 * (EU-60), 3-årsperiode. See ./README.md for full source notes.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import type { PxRow } from "../../lib/types.js";

/** Row shape for raw.ssb_12944. Region × Alder × ContentsCode × Tid cell. */
type Ssb12944Row = {
  region_code: string;
  age_group: string;
  period: string;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-12944";
const TABLE_ID = "12944";
const TARGET_TABLE = "raw.ssb_12944";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-12944.ndjson",
);

const WRITE_COLUMNS = [
  "region_code",
  "age_group",
  "period",
  "contents_code",
  "contents_label",
  "value",
  "status",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["region_code", "age_group", "period", "contents_code"] as const;

export type Ssb12944Summary = {
  rowCount: number;
  outputPath: string;
  wroteToPostgres: boolean;
  rowsWritten: number;
  periods: string[];
  ageGroups: string[];
  contentsCodes: string[];
  regionCount: number;
};

export async function run(): Promise<Ssb12944Summary> {
  logger.info("source.start", { source_id: SOURCE_ID, table_id: TABLE_ID });
  const started = Date.now();

  const resp = await fetchPxTableData({ tableId: TABLE_ID, lang: "no" });
  const pxRows = parseJsonStat2(resp);
  const rows = pxRows.map(toRow);

  const periods = new Set<string>();
  const ageGroups = new Set<string>();
  const regions = new Set<string>();
  const contentsCodes = new Set<string>();
  for (const r of rows) {
    periods.add(r.period);
    ageGroups.add(r.age_group);
    regions.add(r.region_code);
    contentsCodes.add(r.contents_code);
  }

  await writeNdjson(OUTPUT_PATH, rows);

  let rowsWritten = 0;
  const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
  if (wroteToPostgres) {
    const sql = getSql();
    const now = new Date();
    const pgRows = rows.map((r) => ({
      region_code: r.region_code,
      age_group: r.age_group,
      period: r.period,
      contents_code: r.contents_code,
      contents_label: r.contents_label,
      value: r.value,
      status: r.status,
      loaded_at: now,
    }));
    logger.info("postgres.upsert.start", {
      table: TARGET_TABLE,
      row_count: pgRows.length,
    });
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
    await closeSql();
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
    period_count: periods.size,
    age_group_count: ageGroups.size,
    region_count: regions.size,
    contents_codes: [...contentsCodes],
  };
  logger.info("source.done", summary);

  return {
    rowCount: rows.length,
    outputPath: OUTPUT_PATH,
    wroteToPostgres,
    rowsWritten,
    periods: [...periods].sort(),
    ageGroups: [...ageGroups].sort(),
    contentsCodes: [...contentsCodes],
    regionCount: regions.size,
  };
}

function toRow(px: PxRow): Ssb12944Row {
  const region = px.dimensions["Region"];
  const age = px.dimensions["Alder"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !age || !contents || !tid) {
    throw new Error(
      `Expected Region, Alder, ContentsCode, Tid dimensions; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  return {
    region_code: region.code,
    age_group: age.code,
    period: tid.code,
    contents_code: contents.code,
    contents_label: contents.label,
    value: px.value,
    status: px.status ?? null,
  };
}

// Invoked directly via `npm run ingest:ssb-12944`.
run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
