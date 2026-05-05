/**
 * Bufdir Barnefattigdom kommunemonitor — kommune-level child poverty indicators.
 *
 * Fetches the monitor landing page once to resolve the canonical **bulk ZIP** URL,
 * downloads that ZIP (~22 `Indikator_*.xlsx` workbooks), parses sheet `Data`,
 * and upserts into `raw.bufdir_barnefattigdom` (replacing rows from prior runs).
 *
 * Pure parsing (URL discovery, XLSX → row stream, surrogate key derivation)
 * lives in `./parse.ts`; this file owns HTTP + ZIP + Postgres + lifecycle.
 *
 * Stable `indicator_api_id` values are surrogate keys (`bf_zip_` + filename hash),
 * because the XLSX export does not carry Strapi's legacy hex ids.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import {
  basenameOnly,
  discoverZipUrl,
  parseDataSheet,
  type BufdirBarnefattigdomRow,
} from "./parse.js";

export const SOURCE_ID = "bufdir-barnefattigdom";

const MONITOR_PAGE =
  "https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/";

const TARGET_TABLE = "raw.bufdir_barnefattigdom";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/bufdir-barnefattigdom.ndjson",
);

const WRITE_COLUMNS = [
  "indicator_api_id",
  "indicator_slug",
  "indicator_group_slug",
  "indicator_name",
  "indicator_title",
  "link_text",
  "region_code",
  "category_unit",
  "category_format",
  "year",
  "value",
  "values_json",
  "loaded_at",
] as const;

const CONFLICT_KEYS = [
  "indicator_api_id",
  "region_code",
  "category_unit",
  "category_format",
  "year",
] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/bufdir-barnefattigdom",
} as const;

async function fetchText(url: string, label: string): Promise<string> {
  const started = Date.now();
  const res = await fetch(url, { headers: UA_HEADERS });
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

async function fetchZip(
  url: string,
  label: string,
): Promise<{ buffer: Buffer; lastModified: Date | null }> {
  const started = Date.now();
  const res = await fetch(url, { headers: UA_HEADERS });
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
  return {
    buffer,
    lastModified: lm ? new Date(lm) : null,
  };
}

export type BufdirBarnefattigdomSummary = {
  workbooks: number;
  regionCodes: number;
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  zipUrl: string;
};

export async function run(): Promise<BufdirBarnefattigdomSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const monitorHtml = await fetchText(MONITOR_PAGE, "monitor.html");
    const { url: zipUrl, matchTier } = discoverZipUrl(monitorHtml);
    logger.info("zip.discovered", { zip_url: zipUrl, match_tier: matchTier });
    if (matchTier !== "canonical") {
      logger.warn("zip.discovery.fallback_tier", {
        match_tier: matchTier,
        message:
          "Bufdir's URL pattern has drifted away from the canonical shape; the looser matcher still found a ZIP, but revisit discoverZipUrl in parse.ts before the next drift.",
      });
    }

    const { buffer: zipBuffer, lastModified } = await fetchZip(
      zipUrl,
      "monitor.zip",
    );

    const zip = new AdmZip(zipBuffer);
    const entries = zip
      .getEntries()
      .filter((e) => {
        if (e.isDirectory) return false;
        const base = basenameOnly(e.entryName);
        if (base.startsWith("._")) return false;
        if (!/^indikator_\d/i.test(base)) return false;
        return base.toLowerCase().endsWith(".xlsx");
      })
      .sort((a, b) => basenameOnly(a.entryName).localeCompare(b.entryName));

    if (entries.length === 0) {
      throw new Error("ZIP contained no Indikator_*.xlsx workbooks");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowTotal = 0;
    let rowsWrittenToPg = 0;
    const pgBuffer: BufdirBarnefattigdomRow[] = [];
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;
    const regionCodes = new Set<string>();

    const UPSERT_BATCH = 500;

    if (sql) {
      await sql`delete from raw.bufdir_barnefattigdom`;
      logger.info("postgres.table_cleared", { table: TARGET_TABLE });
    }

    async function flushPg(forceAll: boolean): Promise<void> {
      if (!sql) return;
      const target = forceAll ? pgBuffer.length : UPSERT_BATCH;
      while (pgBuffer.length >= target || (forceAll && pgBuffer.length > 0)) {
        const take = forceAll ? pgBuffer.length : UPSERT_BATCH;
        const slice = pgBuffer.splice(0, Math.min(take, pgBuffer.length));
        if (slice.length === 0) break;
        const stamp = new Date();
        rowsWrittenToPg += await upsert(sql, {
          table: TARGET_TABLE,
          rows: slice.map((r) => ({ ...r, loaded_at: stamp })),
          columns: WRITE_COLUMNS,
          conflictKeys: CONFLICT_KEYS,
        });
      }
    }

    async function emitRows(rs: BufdirBarnefattigdomRow[]): Promise<void> {
      rowTotal += rs.length;
      for (const r of rs) {
        regionCodes.add(r.region_code);
        await nd.writeRow(r);
      }
      if (wroteToPostgres) {
        pgBuffer.push(...rs);
        await flushPg(false);
      }
    }

    for (const entry of entries) {
      const base = basenameOnly(entry.entryName);
      const bytes = entry.getData();
      const workbookRows = parseDataSheet(Buffer.from(bytes), base);
      if (workbookRows.length === 0) {
        logger.warn("workbook.no_rows", { file: base });
      }
      await emitRows(workbookRows);
      logger.info("workbook.done", {
        file: base,
        rows: workbookRows.length,
      });
    }

    await flushPg(true);
    await nd.close();

    if (wroteToPostgres) {
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
      workbooks: entries.length,
      region_codes: regionCodes.size,
      rows: rowTotal,
      rows_written: rowsWrittenToPg,
    });

    const summary: BufdirBarnefattigdomSummary = {
      workbooks: entries.length,
      regionCodes: regionCodes.size,
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      zipUrl,
    };

    return {
      output: summary,
      record: {
        rowsScraped: 2,
        rowsParsed: rowTotal,
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
