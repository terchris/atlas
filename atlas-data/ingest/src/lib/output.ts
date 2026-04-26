import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Write a list of objects as newline-delimited JSON. Shared across source
 * modules so the local-development output format stays consistent.
 *
 * Chunks the serialisation to avoid building one huge intermediate string for
 * large payloads (we've seen ~100 k rows per ingest).
 */
export async function writeNdjson<T>(path: string, rows: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const CHUNK = 2_000;
  const lines: string[] = [];
  let buffered = 0;
  const chunks: string[] = [];
  for (const row of rows) {
    lines.push(JSON.stringify(row));
    buffered++;
    if (buffered >= CHUNK) {
      chunks.push(lines.join("\n"));
      lines.length = 0;
      buffered = 0;
    }
  }
  if (lines.length) chunks.push(lines.join("\n"));
  await writeFile(path, chunks.join("\n") + "\n", "utf8");
}
