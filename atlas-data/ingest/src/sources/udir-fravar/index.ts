/**
 * Udir Fravær i grunnskole — median/average days and hours of documented
 * absence, plus participant count, for 10th-grade pupils only, per
 * kommune, for every available school year.
 *
 * Fetches the Rapportside once to resolve the current report version
 * (never hardcoded — see parse.ts), fetches filterVerdier once to
 * discover every valid school year, then fetches TWO data calls per year
 * (`radSti=-12.*.*` for domestic Norway, `radSti=-13.*.*` for the
 * `Utlandet` anchor — see parse.ts for why both carry real data and
 * neither is skipped) with EierformID/KjoennID pinned to "alle" and both
 * measure-toggle filters on, so each call returns all 5 measure columns
 * in one response.
 *
 * ⚠️ Backfills every discovered year (11, confirmed live), not
 * latest-only — see parse.ts's header comment for the correction made at
 * the start of Phase 2.
 *
 * Pure parsing lives in `./parse.ts`; this file owns HTTP + Postgres +
 * lifecycle.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { parseAvailableYears, parseFravarData, parseRapportside, type FravarRow } from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "udir-fravar";

const API_ROOT = "https://statistikkportalen.udir.no/api/rapportering";
const RAPPORTSIDE_URL = `${API_ROOT}/rest/v1/Rapportside/GSK_fravaer`;

const TARGET_TABLE = "raw.udir_fravar";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/udir-fravar.ndjson",
);

const WRITE_COLUMNS = ["region_code", "year", "measure", "value", "loaded_at"] as const;
const CONFLICT_KEYS = ["region_code", "year", "measure"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/udir-fravar",
  accept: "application/json",
} as const;

const RADSTI_ANCHORS = ["-12", "-13"] as const; // Hele landet, Utlandet — see parse.ts

async function fetchJson(url: string, label: string): Promise<unknown> {
  const started = Date.now();
  const res = await fetchWithRetry(url, { headers: UA_HEADERS }, label, {
    onRetry: (wait) => logger.warn("udir.fetch.retry", { label, url, wait_ms: wait }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 400)}`);
  }
  const json = await res.json();
  logger.info("http.json.ok", { label, url, duration_ms: Date.now() - started });
  return json;
}

function dataUrl(basePath: string, year: number, radstiAnchor: string): string {
  const filter = `TidID(${year})_EierformID(-10)_KjoennID(-10)_VisAntallPersoner(1)_VisMaaltall(1)`;
  const params = new URLSearchParams({
    filter,
    radSti: `${radstiAnchor}.*.*`,
    inkluderKoder: "true",
  });
  return `${API_ROOT}/${basePath}/data?${params.toString()}`;
}

function filterVerdierUrl(basePath: string, anchorYear: number): string {
  const params = new URLSearchParams({ filter: `TidID(${anchorYear})_EnhetID(*)` });
  return `${API_ROOT}/${basePath}/filterVerdier?${params.toString()}`;
}

export type UdirFravarSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  years: number[];
  calls: number;
};

export async function run(): Promise<UdirFravarSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const rapportside = await fetchJson(RAPPORTSIDE_URL, "rapportside.json");
    const { basePath, defaultYearCode } = parseRapportside(rapportside);
    logger.info("report.resolved", { basePath, defaultYearCode });

    const filterVerdier = await fetchJson(
      filterVerdierUrl(basePath, defaultYearCode),
      "filterVerdier.years.json",
    );
    const years = parseAvailableYears(filterVerdier);
    logger.info("years.discovered", { years });

    const allRows: FravarRow[] = [];
    let calls = 0;
    for (const year of years) {
      for (const anchor of RADSTI_ANCHORS) {
        const url = dataUrl(basePath, year, anchor);
        const label = `data.${year}.${anchor}.json`;
        const data = await fetchJson(url, label);
        const rows = parseFravarData(data, year);
        allRows.push(...rows);
        calls++;
        logger.info("year.anchor.done", { year, anchor, rows: rows.length });
      }
    }

    if (allRows.length === 0) {
      throw new Error("Every discovered year/anchor combination parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.udir_fravar`;
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
      years,
      calls,
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: UdirFravarSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      years,
      calls,
    };

    return {
      output: summary,
      record: {
        rowsScraped: calls + 2,
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
