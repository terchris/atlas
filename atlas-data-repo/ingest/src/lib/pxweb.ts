import type { JsonStat2Response, PxRow } from "./types.js";
import { logger } from "./logger.js";

/**
 * SSB PxWebAPI v2 client. The v2 API is currently served at `/v2-beta/`
 * (confirmed live 2026-04-21); v1 is deprecated but still available.
 */
const PXWEB_BASE = "https://data.ssb.no/api/pxwebapi/v2-beta";

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
  const codeByPosition: string[][] = id.map((dimName) => {
    const dim = dimension[dimName];
    if (!dim) {
      throw new Error(`Dimension ${dimName} referenced in id but not in dimension map.`);
    }
    const n = size[id.indexOf(dimName)];
    if (n === undefined) {
      throw new Error(`Dimension ${dimName} has no size entry.`);
    }
    const codes: string[] = new Array(n);
    for (const [code, pos] of Object.entries(dim.category.index)) {
      codes[pos] = code;
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
    rows[flat] = {
      dimensions: dims,
      value: value[flat] ?? null,
      ...(status?.[String(flat)] !== undefined
        ? { status: status[String(flat)] }
        : {}),
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
