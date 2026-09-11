import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { parseEnheter, snapshotFileDate, streamArrayElements } from "../parse.js";

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
    { "organisasjonsnummer": "000000001", "navn": "Alpha" },
    { "organisasjonsnummer": "000000002", "navn": "Beta",
      "forretningsadresse": { "kommune": "OSLO", "adresse": ["Gate 1"] } }
  ]`;

  it("yields one text per top-level element", async () => {
    const els = await collect(streamArrayElements(chunked(doc, 4096)));
    expect(els).toHaveLength(2);
    expect(JSON.parse(els[0]!)).toMatchObject({ navn: "Alpha" });
  });

  it("frames elements identically at every chunk size", async () => {
    // The whole point of the scanner is that a record split across a network
    // chunk boundary is reassembled. Sizes are chosen to land mid-key,
    // mid-string and mid-element.
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
  // 🔴 The regression this exists to prevent. terchris/shadow-brreg piped the
  // JSON through `awk '{gsub(/\|/,"")}1'` before writing pipe-delimited CSV, so
  // every `|` in an organisation's name or address was deleted from the data.
  // Atlas has no delimiter in the path at all, and this test is the assertion
  // that says so.
  const hostile = {
    organisasjonsnummer: "912345678",
    navn: 'Stiftelsen "Bro" | Hus\nog Hage',
    forretningsadresse: {
      adresse: ["Pipe|gata 3", 'Kvartal "B"', "Linje1\nLinje2"],
      kommune: "BODØ",
    },
    beskrivelse: "tab\there, backslash \\ here, emoji 🇳🇴",
  };

  it("survives the stream byte-identical", async () => {
    const file = `[\n  ${JSON.stringify(hostile)},\n  {"organisasjonsnummer":"999999999"}\n]`;
    const records = await collect(parseEnheter(streamArrayElements(chunked(file, 5))));

    expect(records).toHaveLength(2);
    const [first] = records;
    expect(first!.organisasjonsnummer).toBe("912345678");
    expect(first!.doc).toEqual(hostile);

    // Character-level, not just deep-equal: name the exact characters that the
    // reference implementation lost.
    const navn = first!.doc["navn"] as string;
    expect(navn).toContain("|");
    expect(navn).toContain("\n");
    expect(navn).toContain('"');
    expect(navn).toBe(hostile.navn);
  });

  it("survives the serialisation the database write applies", async () => {
    // postgres.js serialises the doc object into the jsonb parameter with
    // JSON.stringify. This asserts that step is lossless too — the write path,
    // not only the read path.
    const file = `[${JSON.stringify(hostile)}]`;
    const [record] = await collect(parseEnheter(streamArrayElements(chunked(file, 17))));
    expect(JSON.parse(JSON.stringify(record!.doc))).toEqual(hostile);
  });
});

describe("parseEnheter", () => {
  it("refuses a record without a nine-digit organisasjonsnummer", async () => {
    const file = `[{"organisasjonsnummer":"12345","navn":"Short"}]`;
    await expect(
      collect(parseEnheter(streamArrayElements(chunked(file, 8)))),
    ).rejects.toThrow(/organisasjonsnummer/);
  });

  it("takes the top-level key when a nested object carries the same name", async () => {
    // Nested `organisasjonsnummer` is real — `overordnetEnhet` carries one — and
    // the top-level value is the primary key.
    const file = `[{"organisasjonsnummer":"111111111","overordnetEnhet":{"organisasjonsnummer":"222222222"}}]`;
    const [record] = await collect(parseEnheter(streamArrayElements(chunked(file, 9))));
    expect(record!.organisasjonsnummer).toBe("111111111");
  });

  it("is unaffected by the word appearing as a VALUE, which is what breaks the grep proxy", async () => {
    // The off-by-one between `grep -c '"organisasjonsnummer"'` (1,173,879) and
    // the real record count (1,173,878) is NOT a duplicated key, which is what
    // this file used to claim. Verified against the bulk file on 2026-09-12
    // after imac's correction on urb-agents #711: the extra hit is the literal
    // in one organisation's free-text `aktivitet` array —
    //
    //   "aktivitet" : [ "…drifte Eggum vannverk med samme", "organisasjonsnummer" ]
    //
    // which means the proxy is not stably wrong by one. It is wrong by however
    // many times the public types that word into a registration form, and it can
    // drift any morning. Parsing is immune; grep is not.
    const file = `[{"organisasjonsnummer":"333333333","aktivitet":["Drift av gatelys. Skal også drifte Eggum vannverk med samme","organisasjonsnummer"]}]`;
    const records = await collect(parseEnheter(streamArrayElements(chunked(file, 11))));
    expect(records).toHaveLength(1);
    expect(records[0]!.organisasjonsnummer).toBe("333333333");
    expect(records[0]!.doc["aktivitet"]).toEqual([
      "Drift av gatelys. Skal også drifte Eggum vannverk med samme",
      "organisasjonsnummer",
    ]);
  });
});

describe("snapshotFileDate", () => {
  it("reads the date out of the header Brreg actually sends", () => {
    // Verbatim from the download response on 2026-09-11. It is Java's
    // Date.toString(), not RFC 7231, and `Date.parse` returns NaN for it — a
    // loader that trusted Date.parse would record null on every run.
    expect(snapshotFileDate("Fri Sep 11 04:27:17 CEST 2026")).toBe("2026-09-11");
    expect(Number.isNaN(Date.parse("Fri Sep 11 04:27:17 CEST 2026"))).toBe(true);
  });

  it("reads the date out of a well-formed RFC 7231 header too", () => {
    expect(snapshotFileDate("Thu, 11 Sep 2026 03:14:00 GMT")).toBe("2026-09-11");
  });

  it("keeps the calendar date as stated rather than shifting it through UTC", () => {
    // 00:30 CEST is 22:30 UTC the previous day. The file's own date is the one
    // worth recording, so no conversion happens.
    expect(snapshotFileDate("Fri Sep 11 00:30:00 CEST 2026")).toBe("2026-09-11");
  });

  it("returns null rather than a wrong date when the header is absent or junk", () => {
    expect(snapshotFileDate(null)).toBeNull();
    expect(snapshotFileDate("not a date")).toBeNull();
    expect(snapshotFileDate("Fri Zzz 11 04:27:17 CEST 2026")).toBeNull();
  });
});

describe("the load never empties the register", () => {
  // PLAN-001 task 2.6. Re-running a bulk load against a populated database is
  // the one genuinely destructive operation in this design, and the thing that
  // makes it safe is the absence of a statement, which no unit test naturally
  // covers. Several other sources in this repo DO delete-then-insert
  // (bufdir-barnefattigdom replaces its whole table each run), so copying a
  // neighbouring module is a live route to introducing it here.
  //
  // Asserting over the source text is crude and deliberate: it fails on the
  // pull request that adds the line, rather than on the cluster that loses
  // 1.17M rows.
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

  it("issues no DELETE or TRUNCATE anywhere in the module", () => {
    const statements = source.match(/\b(delete\s+from|truncate)\b/gi) ?? [];
    expect(statements).toEqual([]);
  });

  it("upserts on the primary key", () => {
    expect(source).toContain('conflictKeys: ["organisasjonsnummer"]');
  });
});
