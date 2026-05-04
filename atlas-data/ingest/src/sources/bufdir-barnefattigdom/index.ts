/**
 * Bufdir Barnefattigdom kommunemonitor — kommune-level child poverty indicators.
 *
 * Discovers indicators from Strapi (`statistikk.bufdir.no`), fetches time series from
 * Bufdir's Azure APIM monitor API (`indicator-data/detailsmultiple`), and upserts
 * into `raw.bufdir_barnefattigdom`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { fetchKlassCodesAt } from "../../lib/klass.js";

export const SOURCE_ID = "bufdir-barnefattigdom";

const STRAPI_MONITOR_DOCUMENT_ID = "xkqt5cladsk0o0218ikji4ul";
const STRAPI_POPULATE =
  "populate%5BindicatorGroups%5D%5Bpopulate%5D%5Bindicators%5D%5Bpopulate%5D=indicator";

const TARGET_TABLE = "raw.bufdir_barnefattigdom";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/bufdir-barnefattigdom.ndjson",
);

const KOMMUNE_BATCH = 80;
const DETAILS_CHUNK = 8;

/** Category pairs the public UI requests for ChildPoverty monitors (see bufdir.no bundle). */
const CHILD_POVERTY_CATEGORY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["barn", "prosent"],
  ["barn", "antall"],
  ["husholdning", "prosent"],
  ["husholdning", "antall"],
];

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

type StrapiIndicator = {
  id: number;
  linkText?: string | null;
  indicator?: {
    id: number;
    title?: string | null;
    name?: string | null;
    indicatorApiId?: string | null;
  } | null;
};

type StrapiIndicatorGroup = {
  id: number;
  title?: string | null;
  slug?: string | null;
  indicators?: StrapiIndicator[] | null;
};

type StrapiMonitor = {
  documentId: string;
  slug?: string | null;
  title?: string | null;
  monitorType?: string | null;
  monitorApiUrl?: string | null;
  updatedAt?: string | null;
  indicatorGroups?: StrapiIndicatorGroup[] | null;
};

type StrapiMonitorResponse = { data: StrapiMonitor | null };

type DetailsRow = {
  indicatorId: string;
  regionCode: string;
  values: Record<string, number>;
  categories: [string, string];
};

function slugFromIndicatorName(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "_");
  return s.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
}

function buildDetailsQuery(
  indicatorIds: readonly string[],
  regionCodes: readonly string[],
  categories: readonly [string, string],
): string {
  const parts: string[] = [];
  for (const id of indicatorIds) {
    parts.push(`indicatorIds=${encodeURIComponent(id)}`);
  }
  for (const rc of regionCodes) {
    parts.push(`regionCode=${encodeURIComponent(rc)}`);
  }
  parts.push(`categories=${encodeURIComponent(categories[0])}`);
  parts.push(`categories=${encodeURIComponent(categories[1])}`);
  return parts.join("&");
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const started = Date.now();
  const res = await fetch(url, {
    headers: { "user-agent": "AtlasDataIngest/bufdir-barnefattigdom" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as T;
  logger.info("http.json.ok", { label, url, duration_ms: Date.now() - started });
  return json;
}

function collectIndicators(monitor: StrapiMonitor): Array<{
  indicatorApiId: string;
  indicatorSlug: string;
  indicatorName: string;
  indicatorTitle: string;
  linkText: string | null;
  groupSlug: string;
}> {
  const out: Array<{
    indicatorApiId: string;
    indicatorSlug: string;
    indicatorName: string;
    indicatorTitle: string;
    linkText: string | null;
    groupSlug: string;
  }> = [];
  for (const g of monitor.indicatorGroups ?? []) {
    const groupSlug = (g.slug ?? `group-${g.id}`).trim();
    for (const li of g.indicators ?? []) {
      const ind = li.indicator;
      if (!ind) continue;
      const apiId = ind.indicatorApiId?.trim();
      const name = ind.name?.trim();
      if (!apiId || !name) continue;
      out.push({
        indicatorApiId: apiId,
        indicatorSlug: slugFromIndicatorName(name),
        indicatorName: name,
        indicatorTitle: (ind.title ?? name).trim(),
        linkText: li.linkText?.trim() ?? null,
        groupSlug,
      });
    }
  }
  return out;
}

function detailsToRows(
  meta: {
    indicatorSlug: string;
    groupSlug: string;
    indicatorName: string;
    indicatorTitle: string;
    linkText: string | null;
  },
  details: DetailsRow[],
): BufdirBarnefattigdomRow[] {
  const rows: BufdirBarnefattigdomRow[] = [];
  for (const d of details) {
    const years = Object.keys(d.values)
      .map((y) => Number.parseInt(y, 10))
      .filter((n) => Number.isFinite(n));
    for (const year of years) {
      const v = d.values[String(year)];
      const num = typeof v === "number" && Number.isFinite(v) ? v : null;
      rows.push({
        indicator_api_id: d.indicatorId,
        indicator_slug: meta.indicatorSlug,
        indicator_group_slug: meta.groupSlug,
        indicator_name: meta.indicatorName,
        indicator_title: meta.indicatorTitle,
        link_text: meta.linkText,
        region_code: d.regionCode,
        category_unit: d.categories[0],
        category_format: d.categories[1],
        year,
        value: num,
        values_json: d.values,
      });
    }
  }
  return rows;
}

export type BufdirBarnefattigdomSummary = {
  indicators: number;
  regionCodes: number;
  rowsWritten: number;
  outputPath: string;
  wroteToPostgres: boolean;
};

export async function run(): Promise<BufdirBarnefattigdomSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID });
    const started = Date.now();

    const strapiUrl =
      `https://statistikk.bufdir.no/api/monitors/${STRAPI_MONITOR_DOCUMENT_ID}` +
      `?${STRAPI_POPULATE}`;
    const strapi = await fetchJson<StrapiMonitorResponse>(strapiUrl, "strapi.monitor");
    const monitor = strapi.data;
    if (!monitor?.monitorApiUrl) {
      throw new Error("Strapi monitor payload missing monitorApiUrl");
    }
    if (monitor.monitorType !== "ChildPoverty") {
      logger.warn("monitor.unexpected_type", {
        monitorType: monitor.monitorType,
        expected: "ChildPoverty",
      });
    }

    const indicators = collectIndicators(monitor);
    if (indicators.length === 0) {
      throw new Error("No indicators with indicatorApiId found in Strapi response");
    }

    const klass = await fetchKlassCodesAt({
      classificationId: "131",
      date: new Date().toISOString().slice(0, 10),
      language: "nb",
    });
    const kommuneCodes = klass.codes
      .filter((c) => c.level === "1")
      .map((c) => c.code)
      .filter((code) => /^\d{4}$/.test(code));
    if (kommuneCodes.length < 300) {
      throw new Error(`Expected ~350 active kommuner from Klass; got ${kommuneCodes.length}`);
    }

    const apimBase = monitor.monitorApiUrl.replace(/\/$/, "");
    const allRows: BufdirBarnefattigdomRow[] = [];

    for (const ind of indicators) {
      for (const kommBatch of chunk(kommuneCodes, KOMMUNE_BATCH)) {
        const overviewUrl =
          `${apimBase}/indicator-data/overview?` +
          `indicatorIds=${encodeURIComponent(ind.indicatorApiId)}` +
          `&categories=barn&categories=prosent&` +
          kommBatch.map((c) => `regionCode=${encodeURIComponent(c)}`).join("&");
        const overview = await fetchJson<
          Array<{
            indicatorId: string;
            regions?: Record<string, number>;
          }>
        >(overviewUrl, "apim.overview");

        const regionBatch: string[] = [];
        const o0 = overview[0];
        if (o0?.regions) {
          regionBatch.push(...Object.keys(o0.regions));
        }
        if (regionBatch.length === 0) {
          logger.warn("overview.empty_regions", { indicator: ind.indicatorApiId });
          continue;
        }

        for (const cat of CHILD_POVERTY_CATEGORY_PAIRS) {
          for (const rcChunk of chunk(regionBatch, DETAILS_CHUNK)) {
            const q = buildDetailsQuery([ind.indicatorApiId], rcChunk, cat);
            const detailsUrl = `${apimBase}/indicator-data/detailsmultiple?${q}`;
            const details = await fetchJson<DetailsRow[]>(detailsUrl, "apim.detailsmultiple");
            allRows.push(
              ...detailsToRows(
                {
                  indicatorSlug: ind.indicatorSlug,
                  groupSlug: ind.groupSlug,
                  indicatorName: ind.indicatorName,
                  indicatorTitle: ind.indicatorTitle,
                  linkText: ind.linkText,
                },
                details,
              ),
            );
          }
        }
      }
    }

    await writeNdjson(OUTPUT_PATH, allRows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten = await upsert(sql, {
        table: TARGET_TABLE,
        rows: allRows.map((r) => ({ ...r, loaded_at: now })),
        columns: WRITE_COLUMNS,
        conflictKeys: CONFLICT_KEYS,
      });
      logger.info("postgres.upsert.done", { table: TARGET_TABLE, rows_written: rowsWritten });
    } else {
      logger.info("postgres.upsert.skipped", {
        reason: "DATABASE_URL not set — NDJSON outputs only",
      });
    }

    logger.info("source.done", {
      source_id: SOURCE_ID,
      duration_ms: Date.now() - started,
      indicators: indicators.length,
      region_codes: kommuneCodes.length,
      rows: allRows.length,
      rows_written: rowsWritten,
    });

    const upstreamUpdatedAt = monitor.updatedAt ? new Date(monitor.updatedAt) : null;

    const summary: BufdirBarnefattigdomSummary = {
      indicators: indicators.length,
      regionCodes: kommuneCodes.length,
      rowsWritten,
      outputPath: OUTPUT_PATH,
      wroteToPostgres,
    };

    return {
      output: summary,
      record: {
        rowsScraped: indicators.length * kommuneCodes.length * CHILD_POVERTY_CATEGORY_PAIRS.length,
        rowsParsed: allRows.length,
        upstreamUpdatedAt,
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
