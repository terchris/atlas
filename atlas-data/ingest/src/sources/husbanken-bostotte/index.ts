/**
 * Husbanken bostøtte — housing allowance applications, decisions, payouts,
 * rejections and the calculated kroner amount, per kommune, per year.
 *
 * Pulled from Husbanken's public "Statistikkbank" Qlik Sense app over the
 * Qlik Engine API (see `qlik_client.ts` for the WebSocket/JSON-RPC
 * mechanics — the first WebSocket-based ingest in this project). One
 * hypercube covers every kommune/year/measure combination; there is no
 * per-year request loop the way `udir-gsi` needed, because Qlik's own
 * pagination (`GetHyperCubeData`) handles the volume instead.
 *
 * Pure parsing lives in `./parse.ts`; this file owns the WebSocket session,
 * Postgres, and lifecycle.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchHypercubeAllRows, openApp, type QlikHypercubeDef } from "./qlik_client.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { parseHypercubeRows, type HusbankenRow } from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "husbanken-bostotte";

const WS_URL = "wss://qlik.husbanken.no/public/app/ee185fe5-e94d-463e-bff8-cd1c5f2f566f";
const APP_ID = "ee185fe5-e94d-463e-bff8-cd1c5f2f566f";

const TARGET_TABLE = "raw.husbanken_bostotte";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/husbanken-bostotte.ndjson",
);

const WRITE_COLUMNS = ["region_code", "year", "measure", "value", "loaded_at"] as const;
const CONFLICT_KEYS = ["region_code", "year", "measure"] as const;

const HYPERCUBE_DEF: QlikHypercubeDef = {
  qDimensions: [{ qDef: { qFieldDefs: ["KommuneNr"] } }, { qDef: { qFieldDefs: ["År"] } }],
  qMeasures: [
    { qDef: { qDef: "Sum(BostøtteSøknadTeller)", qLabel: "soknad" } },
    { qDef: { qDef: "Sum(BostøtteVedtakTeller)", qLabel: "vedtak" } },
    { qDef: { qDef: "Sum(BostøtteUtbetalingTeller)", qLabel: "utbetaling" } },
    { qDef: { qDef: "Sum(BostøtteAvslagTeller)", qLabel: "avslag" } },
    { qDef: { qDef: "Sum([Beregnet bostøtte])", qLabel: "belop" } },
  ],
};

export type HusbankenBostotteSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  measures: string[];
};

export async function run(): Promise<HusbankenBostotteSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const { session, docHandle } = await openApp(WS_URL, APP_ID);
    let allRows: HusbankenRow[];
    let measureNames: string[];
    try {
      const { measureNames: names, dataPages } = await fetchHypercubeAllRows(
        session,
        docHandle,
        HYPERCUBE_DEF,
      );
      if (names.some((n) => !n)) {
        throw new Error("Hypercube qMeasureInfo has an unnamed measure — qLabel may not have applied.");
      }
      measureNames = names;
      allRows = parseHypercubeRows(dataPages, measureNames);
    } finally {
      session.close();
    }

    logger.info("hypercube.fetched", { measures: measureNames, rows: allRows.length });

    if (allRows.length === 0) {
      throw new Error("Hypercube fetch parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.husbanken_bostotte`;
      logger.info("postgres.table_cleared", { table: TARGET_TABLE });
    }

    for (const r of allRows) {
      await nd.writeRow(r);
    }
    await nd.close();

    if (sql) {
      const stamp = new Date();
      const UPSERT_BATCH = 500;
      for (let i = 0; i < allRows.length; i += UPSERT_BATCH) {
        const slice = allRows.slice(i, i + UPSERT_BATCH).map((r) => ({
          ...r,
          loaded_at: stamp,
        }));
        rowsWrittenToPg += await upsert(sql, {
          table: TARGET_TABLE,
          rows: slice,
          columns: WRITE_COLUMNS,
          conflictKeys: CONFLICT_KEYS,
        });
      }
      logger.info("postgres.upsert.done", {
        table: TARGET_TABLE,
        rows_written: rowsWrittenToPg,
      });
    } else {
      logger.info("postgres.upsert.skipped", {
        reason: "DATABASE_URL not set — NDJSON outputs only",
      });
    }

    logger.info("source.done", {
      source_id: SOURCE_ID,
      duration_ms: Date.now() - started,
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: HusbankenBostotteSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      measures: measureNames,
    };

    return {
      output: summary,
      record: {
        rowsScraped: allRows.length,
        rowsParsed: allRows.length,
        upstreamUpdatedAt: null,
      },
    };
  });
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
