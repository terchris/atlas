import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ndjsonStreamingWriter, writeNdjson } from "../output.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "atlas-output-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function tmpPath(name: string): string {
  return join(tmpDir, name);
}

describe("writeNdjson", () => {
  it("writes one JSON object per line, terminated by \\n", async () => {
    const path = tmpPath("rows.ndjson");
    await writeNdjson(path, [
      { id: 1, name: "Oslo" },
      { id: 2, name: "Bergen" },
      { id: 3, name: "Trondheim" },
    ]);

    const contents = await readFile(path, "utf8");
    expect(contents).toBe(
      '{"id":1,"name":"Oslo"}\n' +
        '{"id":2,"name":"Bergen"}\n' +
        '{"id":3,"name":"Trondheim"}\n',
    );
  });

  it("produces an empty file for an empty array (no stray newline)", async () => {
    const path = tmpPath("empty.ndjson");
    await writeNdjson(path, []);

    const contents = await readFile(path, "utf8");
    expect(contents).toBe("");
  });

  it("creates parent directories that don't yet exist", async () => {
    const path = tmpPath("nested/deeper/rows.ndjson");
    await writeNdjson(path, [{ a: 1 }]);

    const contents = await readFile(path, "utf8");
    expect(contents).toBe('{"a":1}\n');
  });

  it("preserves non-ASCII content (UTF-8) without escaping", async () => {
    const path = tmpPath("utf8.ndjson");
    await writeNdjson(path, [{ name: "Tromsø" }, { name: "Bærum" }]);

    const contents = await readFile(path, "utf8");
    expect(contents).toBe(
      '{"name":"Tromsø"}\n' + '{"name":"Bærum"}\n',
    );
  });

  it("round-trips: every line parses back to the original object", async () => {
    const path = tmpPath("roundtrip.ndjson");
    const rows = [
      { id: 1, value: null },
      { id: 2, value: 3.14 },
      { id: 3, value: { nested: ["a", "b"] } },
    ];
    await writeNdjson(path, rows);

    const contents = await readFile(path, "utf8");
    const lines = contents.split("\n").filter((line) => line.length > 0);
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed).toEqual(rows);
  });

  it("handles a payload large enough to trigger stream backpressure (10k rows)", async () => {
    const path = tmpPath("large.ndjson");
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      id: i,
      payload: "x".repeat(200),
    }));
    await writeNdjson(path, rows);

    const contents = await readFile(path, "utf8");
    const lines = contents.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(10_000);
    expect(JSON.parse(lines[0]!)).toEqual({ id: 0, payload: "x".repeat(200) });
    expect(JSON.parse(lines[9_999]!)).toEqual({
      id: 9_999,
      payload: "x".repeat(200),
    });
  });
});

describe("ndjsonStreamingWriter", () => {
  it("writes rows one-at-a-time and produces the same shape as writeNdjson", async () => {
    const path = tmpPath("streamed.ndjson");
    const writer = await ndjsonStreamingWriter(path);
    await writer.writeRow({ id: 1 });
    await writer.writeRow({ id: 2 });
    await writer.close();

    const contents = await readFile(path, "utf8");
    expect(contents).toBe('{"id":1}\n{"id":2}\n');
  });

  it("produces an empty file when close() is called with no writes", async () => {
    const path = tmpPath("streamed-empty.ndjson");
    const writer = await ndjsonStreamingWriter(path);
    await writer.close();

    const contents = await readFile(path, "utf8");
    expect(contents).toBe("");
  });

  it("creates parent directories that don't yet exist", async () => {
    const path = tmpPath("streamed/nested/file.ndjson");
    const writer = await ndjsonStreamingWriter(path);
    await writer.writeRow({ ok: true });
    await writer.close();

    const contents = await readFile(path, "utf8");
    expect(contents).toBe('{"ok":true}\n');
  });

  it("handles backpressure across many small writes (10k rows)", async () => {
    const path = tmpPath("streamed-large.ndjson");
    const writer = await ndjsonStreamingWriter(path);
    for (let i = 0; i < 10_000; i++) {
      await writer.writeRow({ i, payload: "y".repeat(200) });
    }
    await writer.close();

    const contents = await readFile(path, "utf8");
    const lines = contents.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(10_000);
  });
});
