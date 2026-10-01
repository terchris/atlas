/**
 * IMDi bosettingstall — kommune-level refugee resettlement figures: how many
 * people a kommune was asked to resettle, agreed to resettle, actually
 * resettled, and resettled under collective protection, per year.
 *
 * Fetches the hub page once to discover every year currently linked
 * (`discoverYearPages`), fetches each year's page, parses its kommune-level
 * tables (`parseKommuneTables`), and upserts into `raw.imdi_bosetting`
 * (replacing rows from prior runs). Static server-rendered HTML — no ZIP,
 * no xlsx, no JS execution needed.
 *
 * Pure parsing (discovery, table parsing) lives in `./parse.ts`; this file
 * owns HTTP + Postgres + lifecycle.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { discoverYearPages, parseKommuneTables, type ImdiBosettingRow } from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "imdi-bosetting";

const ORIGIN = "https://www.imdi.no";
const HUB_PAGE = "https://www.imdi.no/bosetting/bosettingstall/";

const TARGET_TABLE = "raw.imdi_bosetting";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/imdi-bosetting.ndjson",
);

const WRITE_COLUMNS = ["kommune_name", "year", "metric", "value", "loaded_at"] as const;
const CONFLICT_KEYS = ["kommune_name", "year", "metric"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/imdi-bosetting",
} as const;

async function fetchText(url: string, label: string): Promise<string> {
  const started = Date.now();
  const res = await fetchWithRetry(url, { headers: UA_HEADERS }, label, {
    onRetry: (wait) => logger.warn("imdi.fetch.retry", { label, url, wait_ms: wait }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${label}: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 400)}`,
    );
  }
  const text = await res.text();
  logger.info("http.text.ok", { label, url, duration_ms: Date.now() - started });
  return text;
}

export type ImdiBosettingSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  years: number[];
};

export async function run(): Promise<ImdiBosettingSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const hubHtml = await fetchText(HUB_PAGE, "hub.html");
    const yearPages = discoverYearPages(hubHtml);
    logger.info("years.discovered", { years: yearPages.map((y) => y.year) });

    const allRows: ImdiBosettingRow[] = [];
    for (const { year, path } of yearPages) {
      const url = `${ORIGIN}${path}`;
      const html = await fetchText(url, `year.${year}.html`);
      const rows = parseKommuneTables(html, year);
      if (rows.length === 0) {
        logger.warn("year.no_rows", { year });
      }
      allRows.push(...rows);
      logger.info("year.done", { year, rows: rows.length });
    }

    if (allRows.length === 0) {
      throw new Error("Every discovered year parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.imdi_bosetting`;
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
      years: yearPages.map((y) => y.year),
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: ImdiBosettingSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      years: yearPages.map((y) => y.year),
    };

    return {
      output: summary,
      record: {
        rowsScraped: yearPages.length + 1,
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
