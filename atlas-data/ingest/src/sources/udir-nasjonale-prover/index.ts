/**
 * Udir Nasjonale prøver — national test scale-score results, uncertainty
 * margin, and participant count, per kommune, per grade (5th, 8th, 9th),
 * per subject (engelsk/lesing/regning), for the latest school year.
 * Atlas's third Udir source and its first direct learning-outcome signal.
 *
 * Two separate report versions feed this one source — see parse.ts's
 * header comment for why they are genuinely different endpoints, not the
 * same endpoint with a different filter:
 *   - "ungdomstrinn" (8th/9th grade): Rapportside `GSK_NP_Geografisk`
 *   - "5. trinn" (5th grade): Rapportside `GSK_NP_Geo_Trinn5`
 * Both reports' TrinnID options are discovered uniformly from their own
 * `filterVerdier` response (one entry for the 5th-grade report, two for
 * ungdomstrinn) — see parse.ts for why this report's own `gyldigeFiltre`
 * listing is not a reliable signal for this.
 *
 * For each report, every discovered grade × subject combination is
 * queried at TWO radSti anchors — `-12.*.*` (Hele landet, reaches every
 * domestic kommune including Svalbard in one bulk call, same convention
 * `udir-gsi` already uses) and `-13.*.*` (Utlandet — schools abroad, a
 * sibling of Hele landet, not a descendant, and NOT reachable via the
 * first anchor; see parse.ts for why this one carries real data and is
 * not skipped). ~18 data calls total for one year — cheap, unlike
 * `udir-elevundersokelsen-mobbing`'s ~702.
 *
 * Pure parsing lives in `./parse.ts`; this file owns HTTP + Postgres +
 * lifecycle.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { fetchWithRetry } from "./fetch_retry.js";
import { getSql, upsert } from "../../lib/postgres.js";
import {
  parseAvailableYears,
  parseNasjonaleProeverData,
  parseProevetypeOptions,
  parseRapportside,
  parseTrinnOptions,
  type ProeverRow,
} from "./parse.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "udir-nasjonale-prover";

const API_ROOT = "https://statistikkportalen.udir.no/api/rapportering";
const UNGDOMSTRINN_RAPPORTSIDE_URL = `${API_ROOT}/rest/v1/Rapportside/GSK_NP_Geografisk`;
const TRINN5_RAPPORTSIDE_URL = `${API_ROOT}/rest/v1/Rapportside/GSK_NP_Geo_Trinn5`;

const TARGET_TABLE = "raw.udir_nasjonale_prover";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/udir-nasjonale-prover.ndjson",
);

const WRITE_COLUMNS = ["region_code", "grade", "subject", "year", "measure", "value", "loaded_at"] as const;
const CONFLICT_KEYS = ["region_code", "grade", "subject", "year", "measure"] as const;

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/udir-nasjonale-prover",
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

function filterVerdierUrl(basePath: string, anchorYear: number): string {
  const params = new URLSearchParams({ filter: `SkoleAarID(${anchorYear})_EnhetID(*)` });
  return `${API_ROOT}/${basePath}/filterVerdier?${params.toString()}`;
}

function dataUrl(
  basePath: string,
  year: number,
  trinnId: number,
  proevetypeId: number,
  radstiAnchor: string,
): string {
  const parts = [`SkoleAarID(${year})`, `TrinnID(${trinnId})`];
  parts.push(
    `ProevetypeID(${proevetypeId})`,
    "KjoennID(-10)",
    "EierformID(-10)",
    "VisAntallRaderDeltatt(1)",
    "VisMestringsnivaafordeling(0)",
    "VisDeltakelsestatusfordeling(0)",
    "VisMaaltall(0)",
  );
  const params = new URLSearchParams({
    filter: parts.join("_"),
    radSti: `${radstiAnchor}.*.*`,
    inkluderKoder: "true",
  });
  return `${API_ROOT}/${basePath}/data?${params.toString()}`;
}

type ReportPlan = {
  label: string;
  basePath: string;
  year: number;
  combos: { trinnId: number; grade: number; subjectId: number; subject: string }[];
};

async function planReport(rapportsideUrl: string, label: string): Promise<ReportPlan> {
  const rapportside = await fetchJson(rapportsideUrl, `${label}.rapportside.json`);
  const { basePath, defaultYearCode } = parseRapportside(rapportside);
  logger.info("report.resolved", { label, basePath, defaultYearCode });

  const filterVerdier = await fetchJson(
    filterVerdierUrl(basePath, defaultYearCode),
    `${label}.filterVerdier.json`,
  );
  const years = parseAvailableYears(filterVerdier);
  const year = years[years.length - 1]!; // latest only — see PLAN-016's [Q3]
  const trinnOptions = parseTrinnOptions(filterVerdier);
  const proevetypeOptions = parseProevetypeOptions(filterVerdier);

  const combos: ReportPlan["combos"] = [];
  for (const t of trinnOptions) {
    for (const p of proevetypeOptions) {
      combos.push({ trinnId: t.id, grade: t.grade, subjectId: p.id, subject: p.subject });
    }
  }
  logger.info("report.planned", { label, year, combo_count: combos.length });

  return { label, basePath, year, combos };
}

export type UdirNasjonaleProverSummary = {
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
  calls: number;
};

export async function run(): Promise<UdirNasjonaleProverSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const reports = [
      await planReport(UNGDOMSTRINN_RAPPORTSIDE_URL, "ungdomstrinn"),
      await planReport(TRINN5_RAPPORTSIDE_URL, "trinn5"),
    ];

    const allRows: ProeverRow[] = [];
    let calls = 0;
    for (const report of reports) {
      for (const combo of report.combos) {
        for (const anchor of RADSTI_ANCHORS) {
          const url = dataUrl(report.basePath, report.year, combo.trinnId, combo.subjectId, anchor);
          const label = `${report.label}.grade${combo.grade}.${combo.subject}.${anchor}.json`;
          const data = await fetchJson(url, label);
          const rows = parseNasjonaleProeverData(data, combo.grade, combo.subject, report.year);
          allRows.push(...rows);
          calls++;
        }
      }
    }

    if (allRows.length === 0) {
      throw new Error("Every report/grade/subject/anchor combination parsed to zero rows — investigate before retrying.");
    }

    const nd = await ndjsonStreamingWriter(OUTPUT_PATH);
    let rowsWrittenToPg = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    const sql = wroteToPostgres ? getSql() : null;

    if (sql) {
      await sql`delete from raw.udir_nasjonale_prover`;
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
      calls,
      rows: allRows.length,
      rows_written: rowsWrittenToPg,
    });

    const summary: UdirNasjonaleProverSummary = {
      rowsWritten: rowsWrittenToPg,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
      calls,
    };

    return {
      output: summary,
      record: {
        rowsScraped: calls + 4,
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
