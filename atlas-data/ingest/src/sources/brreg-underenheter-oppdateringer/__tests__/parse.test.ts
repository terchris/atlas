import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  classify,
  looksDeleted,
  nextCursor,
  parseFeedPage,
  type FeedChange,
} from "../parse.js";

const change = (id: number, type: string): unknown => ({
  oppdateringsid: id,
  dato: "2026-10-04T02:10:10.649Z",
  organisasjonsnummer: "912345678",
  endringstype: type,
  _links: { underenhet: { href: `https://data.brreg.no/enhetsregisteret/api/underenheter/912345678` } },
});

describe("parseFeedPage", () => {
  it("reads changes and the backlog out of a normal response", () => {
    const page = parseFeedPage({
      _embedded: { oppdaterteUnderenheter: [change(11164093, "Endring"), change(11164094, "Sletting")] },
      page: { size: 2, totalElements: 120, totalPages: 60, number: 0 },
    });
    expect(page.changes).toHaveLength(2);
    expect(page.backlog).toBe(120);
    expect(page.changes[0]).toMatchObject({
      oppdateringsid: 11164093,
      organisasjonsnummer: "912345678",
      endringstype: "Endring",
    });
  });

  it("treats an ABSENT _embedded as caught up, not as a malformed body", () => {
    // Verified live 2026-10-04 at oppdateringsid=900000000: `{_links, page}`
    // with NO `_embedded` key at all, same as the enheter feed.
    const page = parseFeedPage({ _links: {}, page: { size: 100, totalElements: 0, totalPages: 0 } });
    expect(page.changes).toEqual([]);
    expect(page.backlog).toBe(0);
  });

  it("throws on a body that is genuinely wrong, rather than reporting caught up", () => {
    expect(() => parseFeedPage({ _embedded: { oppdaterteUnderenheter: "nope" } })).toThrow(/not an array/);
    expect(() => parseFeedPage(null)).toThrow(/not an object/);
  });

  it("uses oppdaterteUnderenheter, not the enheter feed's oppdaterteEnheter key", () => {
    // 🔴 The one real structural difference between the two feeds. A page
    // shaped like the enheter feed's response must read as empty here, not
    // silently find nothing and look caught up for the wrong reason.
    const page = parseFeedPage({
      _embedded: { oppdaterteEnheter: [change(1, "Ny")] },
      page: { totalElements: 1 },
    });
    expect(page.changes).toEqual([]);
  });

  it("refuses a change without a usable id or organisasjonsnummer", () => {
    expect(() =>
      parseFeedPage({ _embedded: { oppdaterteUnderenheter: [{ organisasjonsnummer: "912345678", endringstype: "Ny" }] } }),
    ).toThrow(/oppdateringsid/);
    expect(() =>
      parseFeedPage({ _embedded: { oppdaterteUnderenheter: [{ oppdateringsid: 1, organisasjonsnummer: "12345", endringstype: "Ny" }] } }),
    ).toThrow(/organisasjonsnummer/);
  });
});

describe("nextCursor", () => {
  it("advances one past the highest id, because the cursor is inclusive", () => {
    const changes = [
      { oppdateringsid: 10, dato: null, organisasjonsnummer: "912345678", endringstype: "Ny", underenhetHref: null },
      { oppdateringsid: 42, dato: null, organisasjonsnummer: "912345678", endringstype: "Ny", underenhetHref: null },
    ] satisfies FeedChange[];
    expect(nextCursor(changes, 1)).toBe(43);
  });

  it("does not go backwards when a batch is empty", () => {
    expect(nextCursor([], 500)).toBe(500);
  });
});

describe("classify", () => {
  it("handles all five values — Ny/Endring/Sletting confirmed live 2026-10-04", () => {
    expect(classify("Ny")).toBe("apply");
    expect(classify("Endring")).toBe("apply");
    expect(classify("Sletting")).toBe("tombstone");
    expect(classify("Fjernet")).toBe("tombstone");
    expect(classify("Ukjent")).toBe("skip_unknown");
  });

  it("never deletes on Ukjent, and never on an unrecognised sixth value", () => {
    for (const t of ["Ukjent", "Omorganisering", "", "sletting", "SLETTING"]) {
      expect(classify(t), `classify(${JSON.stringify(t)})`).toBe("skip_unknown");
    }
  });

  it("is case-sensitive on purpose", () => {
    expect(classify("sletting")).toBe("skip_unknown");
  });
});

describe("looksDeleted", () => {
  it("detects the deletion stub that still returns HTTP 200", () => {
    // Confirmed live 2026-10-04 on organisasjonsnummer 920045154: HTTP 200,
    // respons_klasse "SlettetUnderEnhet", slettedato set.
    expect(looksDeleted({ organisasjonsnummer: "920045154", navn: "X", slettedato: "2021-06-02" })).toBe(true);
    expect(looksDeleted({ organisasjonsnummer: "938461023", navn: "X", slettedato: null })).toBe(false);
    expect(looksDeleted({ organisasjonsnummer: "938461023", navn: "X" })).toBe(false);
    expect(looksDeleted(null)).toBe(false);
  });
});

describe("the poller never walks the feed by page", () => {
  // Same absence-guard as the enheter feed's test — see that file for why an
  // ordinary test cannot cover this.
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("builds no URL containing a page parameter", () => {
    expect(code.match(/[?&]page=/g) ?? []).toEqual([]);
  });

  it("never follows _links.next", () => {
    expect(code.match(/_links[\s\S]{0,20}\bnext\b/g) ?? []).toEqual([]);
    expect(code.match(/\bnext\s*[:.]/g) ?? []).toEqual([]);
  });

  it("does not reuse the shared client's page-incrementing paginate()", () => {
    expect(code).not.toContain("paginate");
  });

  it("does not write to the bootstrap's snapshot table", () => {
    expect(code).not.toContain("brreg_underenheter_snapshot");
  });
});
