/**
 * SSB table 12451 — Bostedskommune- og kjønnsfordelt sykefravær (legemeldt)
 * for lønnstakere. Quarterly, kommune-of-residence sick-leave percentage and
 * lost workdays. See ./README.md.
 *
 * v1 scope (PLAN-013-nav-sykefravaer.md [Q2]/[Q3]): Kjonn=0 (Begge kjønn)
 * only, ContentsCode limited to the two headline measures. The unfiltered
 * cartesian product is 937 × 3 × 9 × 105 = 2,655,315 cells, well over
 * PxWebAPI's 800,000-cell limit (see lib/pxweb.ts's own header) — this
 * scope brings it to 937 × 1 × 2 × 105 = 196,770 cells, comfortably under.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

type Row = {
  region_code: string;
  period: string;
  contents_code: string;
  contents_label: string;
  value: number | null;
  status: string | null;
};

export const SOURCE_ID = "ssb-12451";
const TABLE_ID = "12451";
const TARGET_TABLE = "raw.ssb_12451";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/ssb-12451.ndjson",
);
const WRITE_COLUMNS = [
  "region_code",
  "period",
  "contents_code",
  "contents_label",
  "value",
  "status",
  "loaded_at",
] as const;
const CONFLICT_KEYS = ["region_code", "period", "contents_code"] as const;

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();
    const resp = await fetchPxTableData({
      tableId: TABLE_ID,
      lang: "no",
      filters: {
        Region: "*",
        Kjonn: "0",
        ContentsCode: "Sykefraversprosent,Sykefraversdagsverk",
        Tid: "*",
      },
    });
    const rows = parseJsonStat2(resp).map(toRow);
    if (rows.length === 0) {
      throw new Error("Query parsed to zero rows — investigate before retrying.");
    }
    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten = await upsert(sql, {
        table: TARGET_TABLE,
        rows: rows.map((r) => ({ ...r, loaded_at: now })),
        columns: WRITE_COLUMNS,
        conflictKeys: CONFLICT_KEYS,
      });
    }
    logger.info("source.done", {
      source_id: SOURCE_ID,
      row_count: rows.length,
      duration_ms: Date.now() - started,
      wrote_to_postgres: wroteToPostgres,
      rows_written: rowsWritten,
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
  const region = px.dimensions["Region"];
  const contents = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!region || !contents || !tid) {
    throw new Error(`Unexpected dims: ${Object.keys(px.dimensions).join(", ")}`);
  }
  return {
    region_code: region.code,
    period: tid.code,
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
  });
  process.exit(1);
});
