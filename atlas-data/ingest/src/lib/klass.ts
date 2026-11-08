import { logger } from "./logger.js";

/**
 * SSB Klass API client. Klass is SSB's classification registry — the source
 * of truth for kommune codes, fylke codes, NACE, and other canonical code
 * lists. Separate from the PxWebAPI (statbank) client because the response
 * shape and endpoint conventions differ.
 *
 * Docs: https://data.ssb.no/api/klass/v1/
 */
const KLASS_BASE = "https://data.ssb.no/api/klass/v1";

export type KlassCode = {
  code: string;
  parentCode: string | null;
  level: string;
  name: string;
  shortName: string;
  presentationName: string;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
};

export type KlassCodesAtResponse = {
  codes: KlassCode[];
};

export type KlassCodesAtOptions = {
  /** Classification id, e.g. "131" for Kommuner, "104" for Fylker. */
  classificationId: string;
  /** ISO date for which codes should be valid. Defaults to today. */
  date?: string;
  /** Language: "nb" (bokmål), "nn" (nynorsk), "en" (English). Default: "nb". */
  language?: "nb" | "nn" | "en";
  signal?: AbortSignal;
};

/**
 * Fetch the code list of a classification valid at a specific date.
 * Returns every code active at the given date.
 */
export async function fetchKlassCodesAt(
  opts: KlassCodesAtOptions,
): Promise<KlassCodesAtResponse> {
  const {
    classificationId,
    date = new Date().toISOString().slice(0, 10),
    language = "nb",
    signal,
  } = opts;
  const url =
    `${KLASS_BASE}/classifications/${classificationId}/codesAt.json` +
    `?date=${encodeURIComponent(date)}&language=${encodeURIComponent(language)}`;

  logger.info("klass.fetch.start", { classificationId, date, url });
  const started = Date.now();

  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `Klass returned ${res.status} ${res.statusText} for classification ${classificationId}: ${body.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as KlassCodesAtResponse;
  logger.info("klass.fetch.done", {
    classificationId,
    date,
    duration_ms: Date.now() - started,
    code_count: json.codes.length,
  });
  return json;
}

/**
 * Klass code-list response from the `/codes.json` endpoint. Adds two fields
 * on top of the codesAt shape: `validFromInRequestedRange` /
 * `validToInRequestedRange` — the window during which this version of the
 * code was valid within the date range requested. These are the useful
 * temporal fields; `validFrom` / `validTo` come back null on `/codes`.
 */
export type KlassCodeWithHistory = KlassCode & {
  validFromInRequestedRange: string | null;
  validToInRequestedRange: string | null;
};

export type KlassCodesRangeResponse = {
  codes: KlassCodeWithHistory[];
};

export type KlassCodesRangeOptions = {
  classificationId: string;
  /** Start date (ISO). Include codes valid at any point from this date. */
  from: string;
  /** End date (ISO). Defaults to far future to capture projections. */
  to?: string;
  language?: "nb" | "nn" | "en";
  signal?: AbortSignal;
};

/**
 * Fetch the full history of a classification's codes within a date range.
 * A single code may return multiple entries if its name or properties
 * changed during the range (e.g. kommune renames, boundary adjustments).
 */
export async function fetchKlassCodesRange(
  opts: KlassCodesRangeOptions,
): Promise<KlassCodesRangeResponse> {
  const {
    classificationId,
    from,
    to = "2100-01-01",
    language = "nb",
    signal,
  } = opts;
  const url =
    `${KLASS_BASE}/classifications/${classificationId}/codes.json` +
    `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
    `&language=${encodeURIComponent(language)}`;

  logger.info("klass.range.start", { classificationId, from, to, url });
  const started = Date.now();

  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `Klass returned ${res.status} ${res.statusText} for classification ${classificationId}: ${body.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as KlassCodesRangeResponse;
  logger.info("klass.range.done", {
    classificationId,
    from,
    to,
    duration_ms: Date.now() - started,
    code_count: json.codes.length,
  });
  return json;
}

export type KlassVersion = {
  name: string;
  id: number;
  validFrom: string;
  validTo: string | null;
  published: string[];
};

export type KlassClassification = {
  name: string;
  id: number;
  versions: KlassVersion[];
};

/**
 * Fetch a classification's own metadata — currently used for its `versions`
 * array (id, name, validFrom/validTo). There is no version id on a code
 * returned by `/codes.json` or `/codesAt.json` — a code's own validity
 * window has to be matched against this array separately. Confirmed by
 * inspecting the raw response keys directly, 2026-11-08: no field named
 * anything like `versionId` exists on a code.
 */
export async function fetchKlassClassification(
  classificationId: string,
  signal?: AbortSignal,
): Promise<KlassClassification> {
  const url = `${KLASS_BASE}/classifications/${classificationId}.json`;
  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `Klass returned ${res.status} ${res.statusText} for classification ${classificationId} metadata: ${body.slice(0, 500)}`,
    );
  }
  return (await res.json()) as KlassClassification;
}

export type KlassCodeChange = {
  oldCode: string;
  oldName: string;
  oldShortName: string;
  newCode: string;
  newName: string;
  newShortName: string;
  changeOccurred: string;
};

export type KlassChangesResponse = {
  codeChanges: KlassCodeChange[];
};

/**
 * Fetch a classification's correspondence/change log — every old-code ->
 * new-code mapping Klass recorded in the range, with the date it took
 * effect. This is NOT the same thing as `/codes.json`'s history: that gives
 * every code's own validity window, this gives the actual transitions
 * between codes (renames, renumberings, mergers, splits, boundary-only
 * adjustments where the code and name both stay the same).
 */
export async function fetchKlassChanges(opts: {
  classificationId: string;
  from: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<KlassChangesResponse> {
  const { classificationId, from, to = "2100-01-01", signal } = opts;
  const url =
    `${KLASS_BASE}/classifications/${classificationId}/changes.json` +
    `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetchWithRetry(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(
      `Klass returned ${res.status} ${res.statusText} for classification ${classificationId} changes: ${body.slice(0, 500)}`,
    );
  }
  return (await res.json()) as KlassChangesResponse;
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
        const wait = backoffMs(attempt);
        logger.warn("klass.fetch.retry", { url, status: res.status, wait_ms: wait, attempt });
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const wait = backoffMs(attempt);
      logger.warn("klass.fetch.error", {
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
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
