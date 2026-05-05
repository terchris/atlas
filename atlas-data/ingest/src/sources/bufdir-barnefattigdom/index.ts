/**
 * Bufdir Barnefattigdom kommunemonitor — kommune-level child poverty indicators.
 *
 * Fetches the monitor landing page once to resolve the canonical **bulk ZIP** URL,
 * downloads that ZIP (~22 `Indikator_*.xlsx` workbooks), parses sheet `Data`,
 * and upserts into `raw.bufdir_barnefattigdom` (replacing rows from prior runs).
 *
 * Stable `indicator_api_id` values are surrogate keys (`bf_zip_` + filename hash),
 * because the XLSX export does not carry Strapi's legacy hex ids.
 */
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { ndjsonStreamingWriter } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";

export const SOURCE_ID = "bufdir-barnefattigdom";

const MONITOR_PAGE =
  "https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/";

/** Fixed bucket replacing Strapi indicator groups for ZIP-backed rows. */
const INDICATOR_GROUP_SLUG_ZIP = "barnefattigdom_zip";

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

type BufdirBarnefattigdomRow = {
  indicator_api_id: string;
  indicator_slug: string;
  indicator_group_slug: string;
  indicator_name: string;
  indicator_title: string;
  link_text: string | null;
  region_code: string;
  category_unit: string;
  category_format: string;
  year: number;
  value: number | null;
  values_json: unknown;
};

const UA_HEADERS = {
  "user-agent": "AtlasDataIngest/bufdir-barnefattigdom",
} as const;

function slugFromIndicatorName(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "_");
  return s.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
}

function basenameOnly(entryPath: string): string {
  const parts = entryPath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? entryPath;
}

function surrogateIndicatorApiId(workbookStem: string): string {
  const body = createHash("sha256")
    .update(workbookStem, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `bf_zip_${body}`;
}

function parseCell(raw: unknown, tallformat: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number")
    return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === "." || s === "..") return null;
  s = s.replace(/\s/g, "");
  if (tallformat === "prosent") {
    s = s.replace(",", ".");
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function findHeaderRow(aoa: unknown[][]): number {
  for (let i = 0; i < aoa.length; i++) {
    const c0 = aoa[i]?.[0];
    if (typeof c0 === "string" && c0.trim().toLowerCase() === "region") {
      return i;
    }
  }
  throw new Error("No header row starting with Region in Data sheet");
}

function indicatorTitleAboveHeader(hdrIx: number, aoa: unknown[][]): string {
  const parts: string[] = [];
  for (let i = 0; i < hdrIx; i++) {
    const c = aoa[i]?.[0];
    if (typeof c !== "string" || !c.trim()) continue;
    parts.push(
      c
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return parts.join(" — ") || "unnamed indicator";
}

function discoverZipUrl(html: string): string {
  const m = html.match(
    /https:\/\/[^\s"'<>]+\/uploads\/\d{4}_\d{2}_\d{2}_barnefattigdom_monitor_[a-z0-9]+\.zip/i,
  );
  if (!m) {
    throw new Error(
      "Could not find barnefattigdom_monitor YYYY_MM_DD_barnefattigdom_monitor_<hash>.zip URL in monitor page HTML",
    );
  }
  return m[0];
}

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

function parseDataSheet(
  workbookBytes: Buffer,
  fileBase: string,
): BufdirBarnefattigdomRow[] {
  const stem = fileBase.replace(/\.xlsx$/i, "");
  const indicatorApiId = surrogateIndicatorApiId(stem);
  const slugPart = stem.replace(/^Indikator_\d+[a-z]?_/i, "").trim();
  const humanName = (slugPart.replace(/_/g, " ") || stem.replace(/_/g, " ")).trim();
  const indicatorSlug = slugFromIndicatorName(humanName);

  const wb = XLSX.read(workbookBytes, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets["Data"];
  if (!sheet) {
    throw new Error(`${fileBase}: missing Data sheet`);
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const hdrIx = findHeaderRow(aoa);
  const indicatorTitle = indicatorTitleAboveHeader(hdrIx, aoa);
  const indicatorName = indicatorTitle;

  const headerRow = aoa[hdrIx] ?? [];
  const yearCols: { col: number; year: number }[] = [];
  for (let j = 4; j < headerRow.length; j++) {
    const h = headerRow[j];
    const y =
      typeof h === "number" && Number.isFinite(h)
        ? Math.trunc(h)
        : Number.parseInt(String(h ?? ""), 10);
    if (Number.isFinite(y) && y >= 1990 && y <= 2100) {
      yearCols.push({ col: j, year: y });
    }
  }
  if (yearCols.length === 0) {
    throw new Error(`${fileBase}: no year columns after Tallformat`);
  }

  const rows: BufdirBarnefattigdomRow[] = [];
  for (let r = hdrIx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row?.length) continue;
    const regionRaw = row[0];
    if (regionRaw === null || regionRaw === undefined || regionRaw === "")
      continue;
    const region_code = String(regionRaw).trim();
    if (!region_code) continue;

    const unit = String(row[2] ?? "")
      .trim()
      .toLowerCase();
    const fmt = String(row[3] ?? "")
      .trim()
      .toLowerCase();
    if (unit !== "barn" && unit !== "husholdning") continue;
    if (fmt !== "antall" && fmt !== "prosent") continue;

    const valuesJson: Record<string, number | null> = {};
    for (const { col, year } of yearCols) {
      valuesJson[String(year)] = parseCell(row[col], fmt);
    }

    for (const { year } of yearCols) {
      rows.push({
        indicator_api_id: indicatorApiId,
        indicator_slug: indicatorSlug,
        indicator_group_slug: INDICATOR_GROUP_SLUG_ZIP,
        indicator_name: indicatorName,
        indicator_title: indicatorTitle,
        link_text: null,
        region_code,
        category_unit: unit,
        category_format: fmt,
        year,
        value: valuesJson[String(year)] ?? null,
        values_json: valuesJson,
      });
    }
  }
  return rows;
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
    const zipUrl = discoverZipUrl(monitorHtml);
    logger.info("zip.discovered", { zip_url: zipUrl });

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
