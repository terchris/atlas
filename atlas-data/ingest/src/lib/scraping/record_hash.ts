/**
 * Record-level change detection hash.
 *
 * sha256 of the canonical JSON serialization of an extracted record. Used to
 * skip DB upserts when the parsed data hasn't changed, per
 * INVESTIGATE-ngo-scraping-infrastructure §C.3. 64-hex-char output.
 *
 * Canonical JSON via `fast-json-stable-stringify` — sorts object keys, emits
 * no whitespace, stable number/bool/null formatting. Hand-rolling this would
 * be ~15 lines but we'd own the edge cases (nested objects, arrays, mixed
 * types) forever.
 *
 * NOTE: this function does **not** UTF-8 NFC-normalize string values. Callers
 * (per-source `parse.ts`) are responsible for normalizing at the parser
 * boundary so the record object in memory matches what gets written to the
 * DB. See §C.3 / Q21 for the rationale.
 */

import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

export function recordHash(record: unknown): string {
  const json = stringify(record);
  return createHash("sha256").update(json).digest("hex");
}
