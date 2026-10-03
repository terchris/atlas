/**
 * Retry wrapper for a single fetch — pulled out of index.ts so it is
 * testable without a network, matching the parse.ts / index.ts split this
 * source already uses.
 *
 * Direct copy of `udir-gsi/fetch_retry.ts`, itself a copy of the established
 * pattern (bufdir-barnefattigdom, nav-uforetrygd, imdi-bosetting).
 *
 * ⚠️ RETRIES NETWORK-LEVEL EXCEPTIONS (the `catch` arm — e.g. `TypeError:
 * fetch failed`) AS WELL AS 429/5xx — see `bufdir-barnefattigdom/fetch_retry.ts`'s
 * header comment (urb-agents #1793/#5) for why that distinction mattered in
 * production for this family of sources.
 *
 * This source's real call volume is cheap (~18 data calls for one year — two
 * report versions, each combination's 8-digit radSti bulk-fetches every
 * kommune in one call, same shape as `udir-gsi`'s own convention, NOT
 * `udir-elevundersokelsen-mobbing`'s ~702-call-per-run shape) — 3 attempts,
 * no `Retry-After` handling needed.
 */

export type FetchFn = typeof fetch;

export function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s … with small jitter — same shape as lib/pxweb.ts.
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  opts: { attempts?: number; fetchImpl?: FetchFn; onRetry?: (waitMs: number) => void } = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchImpl(url, init);
      if (res.status === 429 || res.status >= 500) {
        const wait = backoffMs(attempt);
        opts.onRetry?.(wait);
        if (attempt < attempts - 1) await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const wait = backoffMs(attempt);
      opts.onRetry?.(wait);
      if (attempt < attempts - 1) await sleep(wait);
    }
  }
  throw lastErr ?? new Error(`fetchWithRetry gave up after ${attempts} attempts for ${url}: non-2xx on every attempt`);
}
