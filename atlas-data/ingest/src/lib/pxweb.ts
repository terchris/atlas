import type { JsonStat2Response, PxRow } from "./types.js";
import { logger } from "./logger.js";

/**
 * SSB PxWebAPI v2 client.
 *
 * Served at `/v2/`. It moved off `/v2-beta/` on 2026-09-06, and the move was
 * not graceful: the beta path now returns **503 for every request**, including
 * `/config`. Measured that morning with a cache-busting key so the reads hit
 * origin rather than SSB's Varnish:
 *
 *     /v2-beta/config                  -> 503      /v2/config                  -> 200
 *     /v2-beta/tables/13995/data       -> 503      /v2/tables/13995/data       -> 200
 *
 * That retirement took all 15 SSB ingest steps down on the weekly tick of
 * 2026-09-06 while all 21 FHI steps in the same run succeeded — which is what
 * identified this file as the only one implicated.
 *
 * ⚠️ The only thing that distinguishes `/v2/` from `/v2-beta/` here is that one
 * answers and one does not. The commit that made this change claimed the beta
 * endpoint had also gone stale — that `06913` and `07459` "now report 2026,
 * newer than the 2025 the beta was serving". **That was false and is
 * withdrawn.** Beta-era rows ingested 2026-08-24 already carried 2026, and row
 * counts are identical before and after the cutover. The "2025" was recycled
 * from a metadata-*label* comparison that had already been retracted four days
 * earlier for exactly the reason it was wrong then: the label lags, the data
 * does not. A retracted claim reappearing in a new context, without its
 * retraction, is its own failure mode — the endpoint returning 503 was always
 * sufficient reason for this change and no story about staleness was needed.
 *
 * ⚠️ This was written down and then came due early. The note in
 * `sources/ssb-08764/README.md` said "re-check annually; move to /v2/ when the
 * beta flag is dropped". The flag was dropped roughly four months into that
 * annual interval. A calendar re-check cannot catch an upstream that moves on
 * its own schedule; the freshness check added on 2026-09-05 is what actually
 * caught it, and it caught it the morning it happened.
 *
 * ⚠️ Do NOT fall back to `/v0/`. It answers, but it is the deprecated legacy
 * API — a different surface, not an older copy of this one.
 */
const PXWEB_BASE = "https://data.ssb.no/api/pxwebapi/v2";

export type PxWebOptions = {
  /** Table id, e.g. "08764". */
  tableId: string;
  /** ISO language code; SSB supports "no" and "en". */
  lang?: "no" | "en";
  /** Optional signal for cancellation. */
  signal?: AbortSignal;
  /**
   * Per-dimension filter selections, serialised as `valuecodes[Dimension]=value`.
   * Required for dimensions flagged `elimination=false` in the table metadata —
   * the server rejects queries that don't explicitly select them.
   *
   * Accepted forms (each value is URL-encoded, keys are not):
   *   "*"        — every code on that dimension
   *   "TOP(N)"   — the latest N codes per SSB's built-in selection
   *   "2024"     — a single literal code
   *   ["a","b"]  — comma-separated codes
   *
   * Example: `{ Tid: "TOP(1)", Alder: "*", Kjonn: "*", Region: "*", ContentsCode: "*" }`
   */
  filters?: Record<string, string | readonly string[]>;
};

/**
 * Fetch a full PxWebAPI v2 table as JSON-stat2. With no filters applied the
 * server returns the complete cartesian product of every dimension value.
 * Table 08764 is ~103 600 cells at the time of writing — well under the
 * 800 000-cell request limit.
 */
export async function fetchPxTableData(
  opts: PxWebOptions,
): Promise<JsonStat2Response> {
  const { tableId, lang = "no", signal, filters } = opts;
  const url = buildDataUrl(tableId, lang, filters);

  logger.info("pxweb.fetch.start", { tableId, url });
  const started = Date.now();

  const res = await fetchWithRetry(url, { signal });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `PxWebAPI returned ${res.status} ${res.statusText} for table ${tableId}: ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as JsonStat2Response;
  logger.info("pxweb.fetch.done", {
    tableId,
    duration_ms: Date.now() - started,
    updated: json.updated,
    cells: json.value.length,
  });
  return json;
}

/**
 * Fetch table metadata. Useful for sensors that want to check the `updated`
 * timestamp before deciding whether to run a full ingest.
 */
export async function fetchPxTableMetadata(
  opts: PxWebOptions,
): Promise<unknown> {
  const { tableId, lang = "no", signal } = opts;
  const url = `${PXWEB_BASE}/tables/${tableId}/metadata?lang=${lang}`;

  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    throw new Error(`PxWebAPI metadata ${res.status} ${res.statusText} for table ${tableId}`);
  }
  return res.json();
}

/**
 * Unflatten a JSON-stat2 response into one row per cell.
 *
 * JSON-stat2 stores values in row-major order over dimensions in `id`.
 * Given `size = [a, b, c]`, the value at (i, j, k) is at index
 * `(i * b * c) + (j * c) + k`.
 */
export function parseJsonStat2(resp: JsonStat2Response): PxRow[] {
  const { id, size, dimension, value, status } = resp;

  if (id.length !== size.length) {
    throw new Error(
      `JSON-stat2 shape mismatch: id has ${id.length} entries, size has ${size.length}.`,
    );
  }

  // For each dimension, build an array mapping position -> code.
  // JSON-stat2 allows `category.index` to be a code→position object (SSB's
  // convention) or a position-ordered array of codes (FHI's convention).
  const codeByPosition: string[][] = id.map((dimName) => {
    const dim = dimension[dimName];
    if (!dim) {
      throw new Error(`Dimension ${dimName} referenced in id but not in dimension map.`);
    }
    const n = size[id.indexOf(dimName)];
    if (n === undefined) {
      throw new Error(`Dimension ${dimName} has no size entry.`);
    }
    const idx = dim.category.index;
    const codes: string[] = new Array(n);
    if (Array.isArray(idx)) {
      // FHI form: index is an array of codes in position order.
      for (let i = 0; i < idx.length; i++) {
        const code = idx[i];
        if (code === undefined) {
          throw new Error(`Dimension ${dimName} array index has undefined at ${i}.`);
        }
        codes[i] = code;
      }
    } else {
      // SSB form: index is a code→position mapping.
      for (const [code, pos] of Object.entries(idx)) {
        codes[pos] = code;
      }
    }
    for (let i = 0; i < n; i++) {
      if (codes[i] === undefined) {
        throw new Error(
          `Dimension ${dimName} is missing code at position ${i}.`,
        );
      }
    }
    return codes;
  });

  // Row-major strides: strides[d] = product of sizes[d+1 .. end]
  const strides: number[] = new Array(size.length);
  strides[size.length - 1] = 1;
  for (let i = size.length - 2; i >= 0; i--) {
    const next = strides[i + 1];
    const sz = size[i + 1];
    if (next === undefined || sz === undefined) {
      throw new Error("Invalid size array while computing strides.");
    }
    strides[i] = next * sz;
  }

  const total = size.reduce((a, b) => a * b, 1);
  if (total !== value.length) {
    throw new Error(
      `JSON-stat2 value length ${value.length} does not match dimension product ${total}.`,
    );
  }

  const rows: PxRow[] = new Array(total);
  for (let flat = 0; flat < total; flat++) {
    const dims: PxRow["dimensions"] = {};
    for (let d = 0; d < id.length; d++) {
      const stride = strides[d];
      const sz = size[d];
      const dimName = id[d];
      if (stride === undefined || sz === undefined || dimName === undefined) {
        throw new Error("Invalid dimension state during unflatten.");
      }
      const posInDim = Math.floor(flat / stride) % sz;
      const code = codeByPosition[d]?.[posInDim];
      if (code === undefined) {
        throw new Error(`Missing code for ${dimName} at position ${posInDim}.`);
      }
      const dim = dimension[dimName];
      const label = dim?.category.label[code] ?? code;
      dims[dimName] = { code, label };
    }
    // JSON-stat2 allows string sparse-markers inline in the value array
    // (FHI's convention for "not available" / suppression). Coerce to
    // (value:null, status:marker) so downstream consumers see a uniform
    // shape regardless of provider.
    const raw = value[flat];
    let numericValue: number | null;
    let rowStatus: string | undefined = status?.[String(flat)];
    if (typeof raw === "string") {
      numericValue = null;
      rowStatus = rowStatus ?? raw;
    } else {
      numericValue = raw ?? null;
    }
    rows[flat] = {
      dimensions: dims,
      value: numericValue,
      ...(rowStatus !== undefined ? { status: rowStatus } : {}),
    };
  }
  return rows;
}

/**
 * Fetch wrapper with exponential-backoff retry on 429 (rate limit) and 5xx.
 * SSB rate limit is 30 req/min/IP (typical) — we respect `Retry-After` when
 * present.
 */
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
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const wait = retryAfter ?? backoffMs(attempt);
        logger.warn("pxweb.fetch.retry", { url, status: res.status, wait_ms: wait, attempt });
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const wait = backoffMs(attempt);
      logger.warn("pxweb.fetch.error", {
        url,
        error: err instanceof Error ? err.message : String(err),
        wait_ms: wait,
        attempt,
      });
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error(`fetchWithRetry gave up after ${attempts} attempts for ${url}`);
}

function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s, 4s … with small jitter
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a PxWebAPI v2 `/data` URL with optional per-dimension filters.
 * Brackets in `valuecodes[Dim]` are URL-encoded (`%5B` / `%5D`) so curl / fetch
 * don't mangle them.
 */
function buildDataUrl(
  tableId: string,
  lang: string,
  filters: Record<string, string | readonly string[]> | undefined,
): string {
  const params: string[] = [
    `lang=${encodeURIComponent(lang)}`,
    `outputFormat=json-stat2`,
  ];
  if (filters) {
    for (const [dim, raw] of Object.entries(filters)) {
      const value = Array.isArray(raw) ? raw.join(",") : (raw as string);
      params.push(
        `valuecodes%5B${encodeURIComponent(dim)}%5D=${encodeURIComponent(value)}`,
      );
    }
  }
  return `${PXWEB_BASE}/tables/${tableId}/data?${params.join("&")}`;
}
