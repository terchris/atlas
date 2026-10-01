/**
 * Retry wrapper for a single fetch — pulled out of index.ts so it is
 * testable without a network, matching the parse.ts / index.ts split this
 * source already uses.
 *
 * Matches the pattern already used in `lib/pxweb.ts`, `lib/klass.ts` and
 * `lib/fhi.ts` — independently duplicated three times, never shared,
 * confirmed 2026-10-01 while fixing exactly the gap this file had and those
 * three did not: NO retry at all.
 *
 * 🔴 WHY THIS EXISTS. urb-agents #1793/#5 (atlas PR #482, #483): a single
 * `TypeError: fetch failed` on the very FIRST network call — the monitor
 * page, before discoverZipUrl ever sees any HTML — failed this source's
 * whole asset, which failed annual_sources_refresh's whole job, masking
 * ~36 other sources that succeeded in the same run. ops-dev reproduced the
 * exact call twice hours later and got 200 both times: the failure was
 * transient (DNS, a dropped TLS handshake, or Bufdir's own server — undici's
 * wrapper does not say which), not a defect in this module's parsing logic.
 * A retry would very likely have made that run succeed outright.
 *
 * ⚠️ RETRIES NETWORK-LEVEL EXCEPTIONS (the `catch` arm — what `fetch failed`
 * actually is) AS WELL AS 429/5xx, unlike a naive wrapper that only retries
 * HTTP error responses and would have done nothing for last night's
 * failure.
 *
 * Bufdir is not rate-sensitive at this volume (2 requests per run: the
 * monitor page, then the ZIP) — 3 attempts, no `Retry-After` handling
 * needed for a server this quiet, unlike the per-minute SSB/pxweb ceiling
 * the other three copies guard against.
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
