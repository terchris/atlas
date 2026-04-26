/**
 * HTML body-level hash — audit-only, not a skip signal.
 *
 * Exists to support template-drift forensics per
 * INVESTIGATE-ngo-scraping-infrastructure §C.3.1: when
 * `html_raw_hash` changes but `record_hash` does not, the template got
 * reshuffled without affecting the extracted fields, which often precedes a
 * selector-breaking change. Logged at INFO, surfaced in `mart_ingest_health`.
 *
 * Canonicalization is deliberately conservative: strip `<head>`, strip nonce
 * and CSRF-token attributes, collapse whitespace runs. Perfect determinism
 * isn't required because this is an audit signal, not a skip signal — the
 * cost of an occasional false-positive is an extra drift-warning log line,
 * not a missed DB write.
 */

import { createHash } from "node:crypto";

export function htmlRawHash(body: string): string {
  return createHash("sha256").update(canonicalizeHtmlBody(body)).digest("hex");
}

/**
 * Internal canonicalizer. Exported for tests.
 */
export function canonicalizeHtmlBody(body: string): string {
  return body
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<meta[^>]*(?:csrf|csrf-token)[^>]*>/gi, "")
    .replace(/\bnonce\s*=\s*"[^"]*"/gi, "")
    .replace(/\bnonce\s*=\s*'[^']*'/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
