import type { JsonStat2Response } from "./types.js";
import { logger } from "./logger.js";

/**
 * FHI Statistikk Open API client.
 *
 * Folkehelseinstituttet exposes its public-health statistics at
 * https://statistikk-data.fhi.no/api/open/v1/. Unlike SSB's PxWebAPI v2,
 * FHI's data endpoint is POST-only and takes a typed request body with
 * per-dimension filters. The response format is json-stat2 — identical
 * to SSB — so our existing `parseJsonStat2` helper from lib/pxweb.ts
 * works unchanged.
 *
 * Docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
 */
const FHI_BASE = "https://statistikk-data.fhi.no/api/open/v1";

export type FhiFilterKind = "item" | "top" | "bottom" | "all";

export type FhiDimensionFilter = {
  /** Dimension code, e.g. "AAR", "GEO", "ALDER", "MEASURE_TYPE". */
  code: string;
  filter: FhiFilterKind;
  /**
   * For `item`: a list of specific category codes to include.
   * For `top` / `bottom`: a single-element array of the count, as a string.
   *   `top` returns the first N categories (typically earliest for time).
   *   `bottom` returns the last N categories (typically latest for time).
   * For `all`: `["*"]` or an array of glob patterns.
   */
  values: string[];
};

export type FhiDataRequest = {
  dimensions: FhiDimensionFilter[];
  response: {
    format: "json-stat2" | "csv2" | "csv3";
    maxRowCount?: number;
  };
};

export type FhiDataOptions = {
  sourceId: string;
  tableId: number;
  request: FhiDataRequest;
  signal?: AbortSignal;
};

/** Fetch an FHI table's data as json-stat2. Reuses `parseJsonStat2` downstream. */
export async function fetchFhiTableData(
  opts: FhiDataOptions,
): Promise<JsonStat2Response> {
  const { sourceId, tableId, request, signal } = opts;
  const url = `${FHI_BASE}/${sourceId}/table/${tableId}/data`;

  logger.info("fhi.fetch.start", { sourceId, tableId, url });
  const started = Date.now();

  const res = await fetchWithRetry(url, {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `FHI returned ${res.status} ${res.statusText} for ${sourceId}/${tableId}: ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as JsonStat2Response;
  logger.info("fhi.fetch.done", {
    sourceId,
    tableId,
    duration_ms: Date.now() - started,
    cells: json.value?.length ?? 0,
  });
  return json;
}

/** Fetch the default query body for a table — useful for discovery. */
export async function fetchFhiTableQuery(opts: {
  sourceId: string;
  tableId: number;
}): Promise<FhiDataRequest> {
  const url = `${FHI_BASE}/${opts.sourceId}/table/${opts.tableId}/query`;
  const res = await fetchWithRetry(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`FHI query endpoint ${res.status} for ${url}`);
  }
  return (await res.json()) as FhiDataRequest;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 4,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": "atlas-data/0.0 (https://atlas.helpers.no)",
          Accept: "application/json",
          ...init.headers,
        },
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        logger.warn("fhi.fetch.retry", { url, status: res.status, wait_ms: wait });
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const wait = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      logger.warn("fhi.fetch.error", {
        url,
        error: err instanceof Error ? err.message : String(err),
        wait_ms: wait,
      });
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error(`fetchWithRetry gave up after ${attempts} attempts for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
