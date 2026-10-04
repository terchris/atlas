import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { parseUnderenheter, snapshotFileDate, streamArrayElements } from "../parse.js";

/** Feed a string to the scanner in fixed-size pieces, to exercise chunk splits. */
async function* chunked(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("streamArrayElements", () => {
  const doc = `[
    { "organisasjonsnummer": "000000001", "navn": "Alpha", "overordnetEnhet": "900000001" },
    { "organisasjonsnummer": "000000002", "navn": "Beta",
      "beliggenhetsadresse": { "kommune": "OSLO", "adresse": ["Gate 1"] } }
  ]`;

  it("yields one text per top-level element", async () => {
    const els = await collect(streamArrayElements(chunked(doc, 4096)));
    expect(els).toHaveLength(2);
    expect(JSON.parse(els[0]!)).toMatchObject({ navn: "Alpha" });
  });

  it("frames elements identically at every chunk size", async () => {
    const reference = await collect(streamArrayElements(chunked(doc, doc.length)));
    for (const size of [1, 2, 3, 7, 13, 31, 64]) {
      const els = await collect(streamArrayElements(chunked(doc, size)));
      expect(els, `chunk size ${size}`).toEqual(reference);
    }
  });

  it("does not mistake braces and brackets inside strings for structure", async () => {
    const tricky = `[{"navn":"A } ] { [ B","orgnr":"1"},{"navn":"C"}]`;
    const els = await collect(streamArrayElements(chunked(tricky, 3)));
    expect(els).toHaveLength(2);
    expect(JSON.parse(els[0]!).navn).toBe("A } ] { [ B");
  });

  it("throws on a truncated download rather than returning what it got", async () => {
    const truncated = `[{"organisasjonsnummer":"000000001"},{"organisasjo`;
    await expect(collect(streamArrayElements(chunked(truncated, 8)))).rejects.toThrow(
      /truncated/,
    );
  });

  it("throws when the document is not an array", async () => {
    await expect(collect(streamArrayElements(chunked(`{"a":1}`, 8)))).rejects.toThrow(
      /not a JSON array/,
    );
  });
});

describe("no delimiter is introduced anywhere in the path", () => {
  // Same regression guard as brreg-enheter-alle's test — see that file for why.
  const hostile = {
    organisasjonsnummer: "912345678",
    overordnetEnhet: "900000001",
    navn: 'Stiftelsen "Bro" | Hus\nog Hage',
    beliggenhetsadresse: {
      adresse: ["Pipe|gata 3", 'Kvartal "B"', "Linje1\nLinje2"],
      kommune: "BODØ",
    },
  };

  it("survives the stream byte-identical", async () => {
    const file = `[\n  ${JSON.stringify(hostile)},\n  {"organisasjonsnummer":"999999999"}\n]`;
    const records = await collect(parseUnderenheter(streamArrayElements(chunked(file, 5))));

    expect(records).toHaveLength(2);
    const [first] = records;
    expect(first!.organisasjonsnummer).toBe("912345678");
    expect(first!.doc).toEqual(hostile);

    const navn = first!.doc["navn"] as string;
    expect(navn).toContain("|");
    expect(navn).toContain("\n");
    expect(navn).toContain('"');
    expect(navn).toBe(hostile.navn);
  });

  it("survives the serialisation the database write applies", async () => {
    const file = `[${JSON.stringify(hostile)}]`;
    const [record] = await collect(parseUnderenheter(streamArrayElements(chunked(file, 17))));
    expect(JSON.parse(JSON.stringify(record!.doc))).toEqual(hostile);
  });
});

describe("parseUnderenheter", () => {
  it("refuses a record without a nine-digit organisasjonsnummer", async () => {
    const file = `[{"organisasjonsnummer":"12345","navn":"Short"}]`;
    await expect(
      collect(parseUnderenheter(streamArrayElements(chunked(file, 8)))),
    ).rejects.toThrow(/organisasjonsnummer/);
  });

  it("takes the top-level key, not the parent's organisasjonsnummer-shaped overordnetEnhet", async () => {
    // overordnetEnhet is a plain string field here (the parent's orgnr), not a
    // nested object carrying its own organisasjonsnummer key — verified live
    // 2026-10-04 — but the parser must still read the top-level key, not guess.
    const file = `[{"organisasjonsnummer":"111111111","overordnetEnhet":"222222222"}]`;
    const [record] = await collect(parseUnderenheter(streamArrayElements(chunked(file, 9))));
    expect(record!.organisasjonsnummer).toBe("111111111");
    expect(record!.doc["overordnetEnhet"]).toBe("222222222");
  });
});

describe("snapshotFileDate", () => {
  it("reads the date out of the header Brreg actually sends", () => {
    // Verbatim from the underenheter download response, 2026-10-04.
    expect(snapshotFileDate("Sat Oct 03 04:30:43 CEST 2026")).toBe("2026-10-03");
    expect(Number.isNaN(Date.parse("Sat Oct 03 04:30:43 CEST 2026"))).toBe(true);
  });

  it("reads the date out of a well-formed RFC 7231 header too", () => {
    expect(snapshotFileDate("Thu, 11 Sep 2026 03:14:00 GMT")).toBe("2026-09-11");
  });

  it("returns null rather than a wrong date when the header is absent or junk", () => {
    expect(snapshotFileDate(null)).toBeNull();
    expect(snapshotFileDate("not a date")).toBeNull();
  });
});

describe("the load never empties the register", () => {
  // Same source-text absence-guard as brreg-enheter-alle's test — see that
  // file's comment for why this is asserted over the source text rather than
  // left to a unit test that exercises the upsert.
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

  it("issues no DELETE or TRUNCATE anywhere in the module", () => {
    const statements = source.match(/\b(delete\s+from|truncate)\b/gi) ?? [];
    expect(statements).toEqual([]);
  });

  it("upserts on the primary key", () => {
    expect(source).toContain('conflictKeys: ["organisasjonsnummer"]');
  });
});
