import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { parseFrivilligPage, primaryIcnpo } from "../parse.js";

const org = (orgnr: string, icnpo?: unknown): unknown => ({
  organisasjonsnummer: orgnr,
  frivilligOrganisasjonsstatus: "frivilligOrganisasjonsstatus.innfoert",
  innfoertDato: "2013-08-24",
  grasrotandel: { deltarI: true, utestengelsesperiode: null },
  ...(icnpo === undefined ? {} : { icnpoKategorier: icnpo }),
});

describe("parseFrivilligPage", () => {
  it("reads records and the next link", () => {
    const page = parseFrivilligPage({
      _embedded: { frivilligeOrganisasjoner: [org("810098252"), org("811555312")] },
      _links: {
        self: { href: "…?size=2" },
        next: { href: "…?searchAfter=811555312&size=2" },
      },
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextHref).toContain("searchAfter=811555312");
  });

  it("ends the walk when there is no next link", () => {
    const page = parseFrivilligPage({
      _embedded: { frivilligeOrganisasjoner: [org("810098252")] },
      _links: { self: { href: "…" } },
    });
    expect(page.nextHref).toBeNull();
  });

  it("treats an absent _embedded as the end, not as a malformed body", () => {
    expect(parseFrivilligPage({ _links: {} })).toEqual({ items: [], nextHref: null });
  });

  it("refuses a record without a valid organisasjonsnummer", () => {
    expect(() =>
      parseFrivilligPage({ _embedded: { frivilligeOrganisasjoner: [{ organisasjonsnummer: "123" }] } }),
    ).toThrow(/organisasjonsnummer/);
  });
});

describe("primaryIcnpo", () => {
  const a = { kategori: "ICNPOKategori.kultur", icnpoNummer: "1100", rekkefoelge: 2 };
  const b = { kategori: "ICNPOKategori.internasjonaleOrganisasjoner", icnpoNummer: "9100", rekkefoelge: 1 };

  it("takes rekkefoelge 1, not array order", () => {
    // The array is not guaranteed sorted, and taking [0] would silently pick a
    // secondary classification as the organisation's primary one.
    expect(primaryIcnpo([a, b])).toEqual({ nummer: "9100", kategori: "ICNPOKategori.internasjonaleOrganisasjoner" });
  });

  it("returns null rather than guessing when there is nothing usable", () => {
    expect(primaryIcnpo(null)).toBeNull();
    expect(primaryIcnpo([])).toBeNull();
    expect(primaryIcnpo([{ rekkefoelge: 1 }])).toBeNull();
    expect(primaryIcnpo("not an array")).toBeNull();
  });

  it("does not mutate the caller's array while sorting", () => {
    const input = [a, b];
    primaryIcnpo(input);
    expect(input[0]).toBe(a);
  });
});

describe("this module pages the way THIS endpoint requires", () => {
  // 🔴 The third absence-guard, and it guards the OPPOSITE property to the second
  // one. Measured 2026-09-12:
  //
  //                     oppdateringer/enheter     frivillige-organisasjoner
  //   page=             works, capped at 20       REJECTED, 400 even at page=0
  //   _links.next       built with page= (trap)   searchAfter= (the only way)
  //   size max          >= 10,000                 100 (101 -> 400)
  //
  // So "never follow next" is right for the feed and wrong here; "always follow
  // next" is the reverse. A single house rule would be wrong for exactly one of
  // them, which is why each module is guarded for its own endpoint's shape.
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("never sends a page parameter — this endpoint rejects it outright", () => {
    expect(code.match(/[?&]page=/g) ?? []).toEqual([]);
  });

  it("does not exceed the size cap of 100", () => {
    const sizes = [...code.matchAll(/[?&]size=(\d+)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeLessThanOrEqual(100);
  });

  it("bounds the walk, so a non-terminating next link cannot loop forever", () => {
    expect(code).toContain("MAX_REQUESTS");
  });
});
