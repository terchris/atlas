import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

/**
 * Write a list of objects as newline-delimited JSON. Shared across source
 * modules so the local-development output format stays consistent.
 *
 * Streams one line at a time so very large payloads (e.g. bufdir barnefattigdom)
 * do not hit V8 `Invalid string length` from joining multi‑MB chunks.
 */
export async function writeNdjson<T>(path: string, rows: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.setMaxListeners(0);
  try {
    for (const row of rows) {
      const line = JSON.stringify(row) + "\n";
      const ok = stream.write(line);
      if (!ok) await once(stream, "drain");
    }
  } finally {
    stream.end();
  }
  await finished(stream);
}

/** Stream NDJSON incrementally — use for ingests larger than heap-safe arrays. */
export async function ndjsonStreamingWriter(path: string): Promise<{
  writeRow: (row: unknown) => Promise<void>;
  close: () => Promise<void>;
}> {
  await mkdir(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.setMaxListeners(0);

  async function writeRow(row: unknown): Promise<void> {
    const line = JSON.stringify(row) + "\n";
    const ok = stream.write(line);
    if (!ok) await once(stream, "drain");
  }

  return {
    writeRow,
    close: async () => {
      stream.end();
      await finished(stream);
    },
  };
}
