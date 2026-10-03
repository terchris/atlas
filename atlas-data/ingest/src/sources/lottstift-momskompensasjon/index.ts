/**
 * Lottstift momskompensasjon — annual VAT-compensation allocations to
 * voluntary organisations. Atlas's first Lottstift source.
 *
 * Downloads six static XLSX files directly (one per shipped year,
 * 2019-2024 — see parse.ts for why 2016-2018 are not ingested), parses
 * each year's own column layout into (organisasjonsnummer, year, amount)
 * rows, summing duplicate-recipient rows within a year, and upserts into
 * `raw.lottstift_momskompensasjon`.
 *
 * Geography and ICNPO category are deliberately NOT parsed here — they
 * are resolved downstream by joining the recipient's organisasjonsnummer
 * against the already-shipped `dim_brreg_enhet` at the dbt layer.
 *
 * Pure parsing lives in `./parse.ts`; this file owns HTTP + Postgres +
 * lifecycle.
 */
import XLSX from "xlsx";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { parseYearRows, YEAR_CONFIGS, type MomskompensasjonRow } from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "lottstift-momskompensasjon";

const TARGET_TABLE = "raw.lottstift_momskompensasjon";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/lottstift-momskompensasjon.ndjson",
);

const WRITE_COLUMNS = ["organisasjonsnummer", "year", "amount_nok", "amount_label", "loaded_at"] as const;
const CONFLICT_KEYS = ["organisasjonsnummer", "year"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/lottstift-momskompensasjon",
} as const;

async function fetchWorkbook(url: string, label: string): Promise<Buffer> {
  const started = Date.now();
  const res = await fetchWithRetry(url, { headers: UA_HEADERS }, label, {
    onRetry: (wait) => logger.warn("lottstift.fetch.retry", { label, url, wait_ms: wait }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 400)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  logger.info("http.buffer.ok", { label, url, bytes: buffer.length, duration_ms: Date.now() - started });
  return buffer;
}

export type LottstiftMomskompensasjonSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  years: number[];
};

export async function run(): Promise<LottstiftMomskompensasjonSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const allRows: MomskompensasjonRow[] = [];
    for (const config of YEAR_CONFIGS) {
      const buffer = await fetchWorkbook(config.url, `moms.${config.year}.xlsx`);
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
      const sheet = wb.Sheets[config.sheetName];
      if (!sheet) {
        throw new Error(`${config.year}: missing sheet "${config.sheetName}" — Lottstift likely restructured this year's file; investigate before retrying.`);
      }
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
      const rows = parseYearRows(aoa, config);
      if (rows.length === 0) {
        throw new Error(`${config.year}: parsed to zero rows — investigate before retrying.`);
      }
      allRows.push(...rows);
      logger.info("year.done", { year: config.year, rows: rows.length });
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.lottstift_momskompensasjon`;
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
      logger.info("postgres.upsert.done", { table: TARGET_TABLE, rows_written: rowsWrittenToPg });
    } else {
      logger.info("postgres.upsert.skipped", { reason: "DATABASE_URL not set — NDJSON outputs only" });
    }

    const years = YEAR_CONFIGS.map((c) => c.year);
    logger.info("source.done", {
      source_id: SOURCE_ID,
      duration_ms: Date.now() - started,
      years,
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: LottstiftMomskompensasjonSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      years,
    };

    return {
      output: summary,
      record: {
        rowsScraped: years.length,
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
