/**
 * SSB crime bundle — PxWeb tables 08484, 08487, 09405, 09406 (reported and
 * investigated offences). Single ingest writes four raw.ssb_* tables.
 * See ./README.md.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableData, parseJsonStat2 } from "../../lib/pxweb.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import type { PxRow } from "../../lib/types.js";

export const SOURCE_ID = "ssb-crime-tables";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_08484 = resolve(ROOT, "../../../output/ssb-08484.ndjson");
const OUTPUT_08487 = resolve(ROOT, "../../../output/ssb-08487.ndjson");
const OUTPUT_09405 = resolve(ROOT, "../../../output/ssb-09405.ndjson");
const OUTPUT_09406 = resolve(ROOT, "../../../output/ssb-09406.ndjson");

type Row08484 = {
  lovbrudd_krim_code: string;
  lovbrudd_krim_label: string;
  contents_code: string;
  contents_label: string;
  year: number;
  value: number | null;
  status: string | null;
};

type Row08487 = {
  region_code: string;
  region_label: string;
  lovbrudd_krim_code: string;
  lovbrudd_krim_label: string;
  contents_code: string;
  contents_label: string;
  period_interval_code: string;
  period_interval_label: string;
  value: number | null;
  status: string | null;
};

type Row09405 = {
  lovbrudd_krim_code: string;
  lovbrudd_krim_label: string;
  politi_avgjorelse_code: string;
  politi_avgjorelse_label: string;
  contents_code: string;
  contents_label: string;
  year: number;
  value: number | null;
  status: string | null;
};

type Row09406 = {
  lovbrudd_krim_code: string;
  lovbrudd_krim_label: string;
  contents_code: string;
  contents_label: string;
  year: number;
  value: number | null;
  status: string | null;
};

const COLS_08484 = [
  "lovbrudd_krim_code",
  "lovbrudd_krim_label",
  "contents_code",
  "contents_label",
  "year",
  "value",
  "status",
  "loaded_at",
] as const;

const KEYS_08484 = ["lovbrudd_krim_code", "contents_code", "year"] as const;

const COLS_08487 = [
  "region_code",
  "region_label",
  "lovbrudd_krim_code",
  "lovbrudd_krim_label",
  "contents_code",
  "contents_label",
  "period_interval_code",
  "period_interval_label",
  "value",
  "status",
  "loaded_at",
] as const;

const KEYS_08487 = [
  "region_code",
  "lovbrudd_krim_code",
  "contents_code",
  "period_interval_code",
] as const;

const COLS_09405 = [
  "lovbrudd_krim_code",
  "lovbrudd_krim_label",
  "politi_avgjorelse_code",
  "politi_avgjorelse_label",
  "contents_code",
  "contents_label",
  "year",
  "value",
  "status",
  "loaded_at",
] as const;

const KEYS_09405 = [
  "lovbrudd_krim_code",
  "politi_avgjorelse_code",
  "contents_code",
  "year",
] as const;

const COLS_09406 = [
  "lovbrudd_krim_code",
  "lovbrudd_krim_label",
  "contents_code",
  "contents_label",
  "year",
  "value",
  "status",
  "loaded_at",
] as const;

const KEYS_09406 = ["lovbrudd_krim_code", "contents_code", "year"] as const;

export type SsbCrimeTablesSummary = {
  row08484: number;
  row08487: number;
  row09405: number;
  row09406: number;
  wroteToPostgres: boolean;
  rowsWritten: number;
};

export async function run(): Promise<SsbCrimeTablesSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    let rowsWritten = 0;

    const resp08484 = await fetchPxTableData({
      tableId: "08484",
      lang: "no",
      filters: {
        LovbruddKrim: "*",
        ContentsCode: "*",
        Tid: "*",
      },
    });
    const rows08484 = parseJsonStat2(resp08484).map(to08484);
    await writeNdjson(OUTPUT_08484, rows08484);

    const resp08487 = await fetchPxTableData({
      tableId: "08487",
      lang: "no",
      filters: {
        Gjerningssted: "*",
        LovbruddKrim: "*",
        ContentsCode: "*",
        Tid: "*",
      },
    });
    const rows08487 = parseJsonStat2(resp08487).map(to08487);
    await writeNdjson(OUTPUT_08487, rows08487);

    const resp09405 = await fetchPxTableData({
      tableId: "09405",
      lang: "no",
      filters: {
        LovbruddKrim: "*",
        PolitiAvgjorelse: "*",
        ContentsCode: "*",
        Tid: "*",
      },
    });
    const rows09405 = parseJsonStat2(resp09405).map(to09405);
    await writeNdjson(OUTPUT_09405, rows09405);

    const resp09406 = await fetchPxTableData({
      tableId: "09406",
      lang: "no",
      filters: {
        LovbruddKrim: "*",
        ContentsCode: "*",
        Tid: "*",
      },
    });
    const rows09406 = parseJsonStat2(resp09406).map(to09406);
    await writeNdjson(OUTPUT_09406, rows09406);

    const timestamps = [
      resp08484.updated,
      resp08487.updated,
      resp09405.updated,
      resp09406.updated,
    ];
    const upstreamUpdatedAt = new Date(
      Math.max(...timestamps.map((t) => Date.parse(t))),
    );

    const totalRows =
      rows08484.length +
      rows08487.length +
      rows09405.length +
      rows09406.length;

    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten += await upsert(sql, {
        table: "raw.ssb_08484",
        rows: rows08484.map((r) => ({ ...r, loaded_at: now })),
        columns: COLS_08484,
        conflictKeys: KEYS_08484,
      });
      rowsWritten += await upsert(sql, {
        table: "raw.ssb_08487",
        rows: rows08487.map((r) => ({ ...r, loaded_at: now })),
        columns: COLS_08487,
        conflictKeys: KEYS_08487,
      });
      rowsWritten += await upsert(sql, {
        table: "raw.ssb_09405",
        rows: rows09405.map((r) => ({ ...r, loaded_at: now })),
        columns: COLS_09405,
        conflictKeys: KEYS_09405,
      });
      rowsWritten += await upsert(sql, {
        table: "raw.ssb_09406",
        rows: rows09406.map((r) => ({ ...r, loaded_at: now })),
        columns: COLS_09406,
        conflictKeys: KEYS_09406,
      });
    } else {
      logger.info("postgres.upsert.skipped", {
        reason: "DATABASE_URL not set — NDJSON outputs only",
      });
    }

    logger.info("source.done", {
      source_id: SOURCE_ID,
      row_08484: rows08484.length,
      row_08487: rows08487.length,
      row_09405: rows09405.length,
      row_09406: rows09406.length,
      total_rows: totalRows,
      duration_ms: Date.now() - started,
      wrote_to_postgres: wroteToPostgres,
      rows_written: rowsWritten,
    });

    return {
      output: {
        row08484: rows08484.length,
        row08487: rows08487.length,
        row09405: rows09405.length,
        row09406: rows09406.length,
        wroteToPostgres,
        rowsWritten,
      },
      record: {
        rowsScraped: totalRows,
        rowsParsed: totalRows,
        upstreamUpdatedAt,
      },
    };
  });
}

function to08484(px: PxRow): Row08484 {
  const lb = px.dimensions["LovbruddKrim"];
  const cc = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!lb || !cc || !tid) {
    throw new Error(
      `08484: expected LovbruddKrim, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`08484: Tid not integer year: ${tid.code}`);
  }
  return {
    lovbrudd_krim_code: lb.code,
    lovbrudd_krim_label: lb.label,
    contents_code: cc.code,
    contents_label: cc.label,
    year,
    value: px.value,
    status: px.status ?? null,
  };
}

function to08487(px: PxRow): Row08487 {
  const geo = px.dimensions["Gjerningssted"];
  const lb = px.dimensions["LovbruddKrim"];
  const cc = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!geo || !lb || !cc || !tid) {
    throw new Error(
      `08487: expected Gjerningssted, LovbruddKrim, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  return {
    region_code: geo.code,
    region_label: geo.label,
    lovbrudd_krim_code: lb.code,
    lovbrudd_krim_label: lb.label,
    contents_code: cc.code,
    contents_label: cc.label,
    period_interval_code: tid.code,
    period_interval_label: tid.label,
    value: px.value,
    status: px.status ?? null,
  };
}

function to09405(px: PxRow): Row09405 {
  const lb = px.dimensions["LovbruddKrim"];
  const pol = px.dimensions["PolitiAvgjorelse"];
  const cc = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!lb || !pol || !cc || !tid) {
    throw new Error(
      `09405: expected LovbruddKrim, PolitiAvgjorelse, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`09405: Tid not integer year: ${tid.code}`);
  }
  return {
    lovbrudd_krim_code: lb.code,
    lovbrudd_krim_label: lb.label,
    politi_avgjorelse_code: pol.code,
    politi_avgjorelse_label: pol.label,
    contents_code: cc.code,
    contents_label: cc.label,
    year,
    value: px.value,
    status: px.status ?? null,
  };
}

function to09406(px: PxRow): Row09406 {
  const lb = px.dimensions["LovbruddKrim"];
  const cc = px.dimensions["ContentsCode"];
  const tid = px.dimensions["Tid"];
  if (!lb || !cc || !tid) {
    throw new Error(
      `09406: expected LovbruddKrim, ContentsCode, Tid; got ${Object.keys(px.dimensions).join(", ")}`,
    );
  }
  const year = Number(tid.code);
  if (!Number.isInteger(year)) {
    throw new Error(`09406: Tid not integer year: ${tid.code}`);
  }
  return {
    lovbrudd_krim_code: lb.code,
    lovbrudd_krim_label: lb.label,
    contents_code: cc.code,
    contents_label: cc.label,
    year,
    value: px.value,
    status: px.status ?? null,
  };
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
