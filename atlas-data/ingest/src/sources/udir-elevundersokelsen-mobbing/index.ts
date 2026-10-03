/**
 * Udir Elevundersøkelsen — bullying ("mobbing") indicator and its three
 * underlying survey questions, per kommune, per grade (7th and 10th), per
 * school year. Atlas's second Udir source, reusing the same
 * statistikkportalen.udir.no client `udir-gsi` already proved out — but a
 * genuinely different response shape and query pattern (see parse.ts's
 * header comment).
 *
 * v1 scope, resolved in PLAN-015-udir-elevundersokelsen-mobbing.md's [Q1]/
 * [Q2]: one HTTP call per region node per grade (not a bulk wildcard
 * decode — never confirmed correct), latest school year only (not a
 * 5-year backfill — each extra year multiplies the ~702-call cost
 * linearly). Calls are deliberately paced; this API's own Swagger doc says
 * it is "not intended for external use today", and 700+ unpaced requests
 * against that is not how a guest behaves.
 *
 * Pure parsing lives in `./parse.ts`; this file owns HTTP + Postgres +
 * pacing + lifecycle.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry, sleep } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import {
  GRADE_TO_TRINN_ID,
  parseAvailableYears,
  parseMobbingData,
  parseRapportside,
  parseRegionNodes,
  type MobbingRow,
} from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "udir-elevundersokelsen-mobbing";

const API_ROOT = "https://statistikkportalen.udir.no/api/rapportering";
const RAPPORTSIDE_URL = `${API_ROOT}/rest/v1/Rapportside/GSK_EUG_mobbing`;

const TARGET_TABLE = "raw.udir_elevundersokelsen_mobbing";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/udir-elevundersokelsen-mobbing.ndjson",
);

const WRITE_COLUMNS = [
  "region_code",
  "grade",
  "year",
  "measure",
  "measure_label",
  "value",
  "loaded_at",
] as const;
const CONFLICT_KEYS = ["region_code", "grade", "year", "measure"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/udir-elevundersokelsen-mobbing",
  accept: "application/json",
} as const;

/** Pace between data calls — courtesy, not a documented rate limit. See this file's header. */
const CALL_PACING_MS = 75;

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

function filterVerdierUrl(basePath: string, anchorYear: number): string {
  const params = new URLSearchParams({ filter: `TidID(${anchorYear})_EnhetID(*)` });
  return `${API_ROOT}/${basePath}/filterVerdier?${params.toString()}`;
}

function dataUrl(basePath: string, year: number, trinnId: number, enhetId: number): string {
  const filter = `TidID(${year})_TrinnID(${trinnId})_KjoennID(-10)_EierformID(-10)_VisAntallBesvart(0)_EnhetID(${enhetId})`;
  const params = new URLSearchParams({ filter, radSti: "*.*", inkluderKoder: "true" });
  return `${API_ROOT}/${basePath}/data?${params.toString()}`;
}

export type UdirMobbingSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  year: number;
  regionCount: number;
};

export async function run(): Promise<UdirMobbingSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const rapportside = await fetchJson(RAPPORTSIDE_URL, "rapportside.json");
    const { basePath, defaultYearCode } = parseRapportside(rapportside);
    logger.info("report.resolved", { basePath, defaultYearCode });

    const filterVerdier = await fetchJson(
      filterVerdierUrl(basePath, defaultYearCode),
      "filterVerdier.json",
    );
    const years = parseAvailableYears(filterVerdier);
    const year = years[years.length - 1]!; // latest only — see [Q2]
    const regions = parseRegionNodes(filterVerdier);
    logger.info("discovery.done", { year, region_count: regions.length });

    const allRows: MobbingRow[] = [];
    let calls = 0;
    for (const region of regions) {
      for (const grade of Object.keys(GRADE_TO_TRINN_ID).map(Number)) {
        const trinnId = GRADE_TO_TRINN_ID[grade]!;
        const url = dataUrl(basePath, year, trinnId, region.id);
        const data = await fetchJson(url, `data.${region.kode}.${grade}.json`);
        const rows = parseMobbingData(data, region.kode, grade, year);
        allRows.push(...rows);
        calls++;
        if (calls % 50 === 0) {
          logger.info("progress", { calls, of: regions.length * 2, rows: allRows.length });
        }
        await sleep(CALL_PACING_MS);
      }
    }

    if (allRows.length === 0) {
      throw new Error("Every region/grade call parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.udir_elevundersokelsen_mobbing`;
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
      year,
      region_count: regions.length,
      calls,
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: UdirMobbingSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      year,
      regionCount: regions.length,
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
