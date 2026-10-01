/**
 * NAV PST302 — uføretrygd (disability benefit) recipients, count and share
 * of population 18-67, per kommune, monthly.
 *
 * Fetches the monitor page once to resolve the live xlsx download path,
 * downloads that one workbook (no ZIP — NAV serves a single xlsx directly),
 * parses the `Kommune-bydel. Antall` and `Kommune-bydel. Andel` sheets, and
 * upserts into `raw.nav_uforetrygd` (replacing rows from prior runs).
 *
 * v1 tracks the live current-year file only — historical backfill (per-year
 * archive files) is explicitly deferred, see PLAN-004-nav-uforetrygd.md
 * Phase 1.5.
 *
 * Pure parsing (discovery, sheet parsing) lives in `./parse.ts`; this file
 * owns HTTP + Postgres + lifecycle.
 */
import XLSX from "xlsx";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { discoverWorkbookPath, parseSheet, type NavUforetrygdRow } from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "nav-uforetrygd";

const ORIGIN = "https://www.nav.no";
const MONITOR_PAGE =
  "https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk";

const TARGET_TABLE = "raw.nav_uforetrygd";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/nav-uforetrygd.ndjson",
);

const WRITE_COLUMNS = [
  "region_code",
  "category_format",
  "year",
  "month",
  "value",
  "values_json",
  "loaded_at",
] as const;

const CONFLICT_KEYS = ["region_code", "category_format", "year", "month"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/nav-uforetrygd",
} as const;

async function fetchText(url: string, label: string): Promise<string> {
  const started = Date.now();
  const res = await fetchWithRetry(url, { headers: UA_HEADERS }, label, {
    onRetry: (wait) => logger.warn("nav.fetch.retry", { label, url, wait_ms: wait }),
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

async function fetchWorkbook(
  url: string,
  label: string,
): Promise<{ buffer: Buffer; lastModified: Date | null }> {
  const started = Date.now();
  const res = await fetchWithRetry(url, { headers: UA_HEADERS }, label, {
    onRetry: (wait) => logger.warn("nav.fetch.retry", { label, url, wait_ms: wait }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${label}: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 400)}`,
    );
  }
  const lm = res.headers.get("last-modified");
  const buffer = Buffer.from(await res.arrayBuffer());
  logger.info("http.buffer.ok", {
    label,
    url,
    bytes: buffer.length,
    duration_ms: Date.now() - started,
  });
  return { buffer, lastModified: lm ? new Date(lm) : null };
}

export type NavUforetrygdSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  workbookUrl: string;
};

export async function run(): Promise<NavUforetrygdSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const monitorHtml = await fetchText(MONITOR_PAGE, "monitor.html");
    const { path: workbookPath, matchTier } = discoverWorkbookPath(monitorHtml);
    const workbookUrl = `${ORIGIN}${workbookPath}`;
    logger.info("workbook.discovered", { workbook_url: workbookUrl, match_tier: matchTier });
    if (matchTier !== "canonical") {
      logger.warn("workbook.discovery.fallback_tier", {
        match_tier: matchTier,
        message:
          "NAV's URL pattern has drifted away from the canonical shape; the looser matcher still found a workbook, but revisit discoverWorkbookPath in parse.ts before the next drift.",
      });
    }

    const { buffer, lastModified } = await fetchWorkbook(workbookUrl, "pst302.xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

    const antallRows = parseSheet(wb, "Kommune-bydel. Antall", "antall");
    const andelRows = parseSheet(wb, "Kommune-bydel. Andel", "andel");
    logger.info("sheets.parsed", {
      antall_rows: antallRows.length,
      andel_rows: andelRows.length,
    });

    const allRows: NavUforetrygdRow[] = [...antallRows, ...andelRows];
    if (allRows.length === 0) {
      throw new Error("Both sheets parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.nav_uforetrygd`;
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

    const summary: NavUforetrygdSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      workbookUrl,
    };

    return {
      output: summary,
      record: {
        rowsScraped: 1,
        rowsParsed: allRows.length,
        upstreamUpdatedAt: lastModified,
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
