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
  dato: "2026-09-10T02:10:10.649Z",
  organisasjonsnummer: "912345678",
  endringstype: type,
  _links: { enhet: { href: `https://data.brreg.no/enhetsregisteret/api/enheter/912345678` } },
});

describe("parseFeedPage", () => {
  it("reads changes and the backlog out of a normal response", () => {
    const page = parseFeedPage({
      _embedded: { oppdaterteEnheter: [change(25181710, "Endring"), change(25181711, "Ny")] },
      page: { size: 2, totalElements: 3343, totalPages: 1672, number: 0 },
    });
    expect(page.changes).toHaveLength(2);
    expect(page.backlog).toBe(3343);
    expect(page.changes[0]).toMatchObject({
      oppdateringsid: 25181710,
      organisasjonsnummer: "912345678",
      endringstype: "Endring",
    });
  });

  it("treats an ABSENT _embedded as caught up, not as a malformed body", () => {
    // 🔴 The regression this exists for. Measured 2026-09-12: a cursor past the
    // newest change returns `{_links, page}` with NO `_embedded` key —
    //     GET …?oppdateringsid=99000000 → keys: ['_links','page'], totalElements: 0
    // so `body._embedded.oppdaterteEnheter` throws a TypeError at exactly the
    // moment the poller catches up: on every healthy run once the backlog is
    // cleared, and never in development against a stale watermark.
    const page = parseFeedPage({ _links: {}, page: { size: 100, totalElements: 0, totalPages: 0 } });
    expect(page.changes).toEqual([]);
    expect(page.backlog).toBe(0);
  });

  it("throws on a body that is genuinely wrong, rather than reporting caught up", () => {
    expect(() => parseFeedPage({ _embedded: { oppdaterteEnheter: "nope" } })).toThrow(/not an array/);
    expect(() => parseFeedPage(null)).toThrow(/not an object/);
  });

  it("refuses a change without a usable id or organisasjonsnummer", () => {
    expect(() =>
      parseFeedPage({ _embedded: { oppdaterteEnheter: [{ organisasjonsnummer: "912345678", endringstype: "Ny" }] } }),
    ).toThrow(/oppdateringsid/);
    expect(() =>
      parseFeedPage({ _embedded: { oppdaterteEnheter: [{ oppdateringsid: 1, organisasjonsnummer: "12345", endringstype: "Ny" }] } }),
    ).toThrow(/organisasjonsnummer/);
  });
});

describe("nextCursor", () => {
  it("advances one past the highest id, because the cursor is inclusive", () => {
    // `?oppdateringsid=N` returns id >= N — verified 2026-09-12, asking for
    // 16,000,000 returns a first record of 16,043,822. Without the +1 the poller
    // re-requests its last record forever.
    const changes = [
      { oppdateringsid: 10, dato: null, organisasjonsnummer: "912345678", endringstype: "Ny", enhetHref: null },
      { oppdateringsid: 42, dato: null, organisasjonsnummer: "912345678", endringstype: "Ny", enhetHref: null },
    ] satisfies FeedChange[];
    expect(nextCursor(changes, 1)).toBe(43);
  });

  it("does not go backwards when a batch is empty", () => {
    expect(nextCursor([], 500)).toBe(500);
  });
});

describe("classify", () => {
  it("handles all five values that actually occur", () => {
    // Sampled across the id range on 2026-09-12 — every one of these was seen:
    //   cursor 1          Ukjent 500
    //   cursor 14,000,000 Endring 494, Sletting 6
    //   cursor 16,400,000 Endring 342, Sletting 112, Fjernet 23, Ny 23
    expect(classify("Ny")).toBe("apply");
    expect(classify("Endring")).toBe("apply");
    expect(classify("Sletting")).toBe("tombstone");
    expect(classify("Fjernet")).toBe("tombstone");
    expect(classify("Ukjent")).toBe("skip_unknown");
  });

  it("🔴 never deletes on Ukjent, and never on an unrecognised sixth value", () => {
    // The entire pre-2018-08 history is Ukjent, so a catch-up from an old
    // watermark meets millions of them. Treating an unknown type as a deletion —
    // or as an edit — is how a poller silently corrupts the register.
    for (const t of ["Ukjent", "Omorganisering", "", "sletting", "SLETTING"]) {
      expect(classify(t), `classify(${JSON.stringify(t)})`).toBe("skip_unknown");
    }
  });

  it("is case-sensitive on purpose", () => {
    // Brreg emits `Sletting`. Accepting `sletting` too would mean a typo in a
    // future edit silently keeps working while meaning something else.
    expect(classify("sletting")).toBe("skip_unknown");
  });
});

describe("looksDeleted", () => {
  it("detects the deletion stub that still returns HTTP 200", () => {
    // 🔴 Measured 2026-09-12: fetching a deleted organisation gives 200 with ~6
    // keys and a `slettedato`, not 404 or 410. An implementation that reads the
    // status code sees a healthy record and writes the stub over a full one.
    expect(looksDeleted({ organisasjonsnummer: "929915224", navn: "X", slettedato: "2026-09-10" })).toBe(true);
    expect(looksDeleted({ organisasjonsnummer: "938461023", navn: "X", slettedato: null })).toBe(false);
    expect(looksDeleted({ organisasjonsnummer: "938461023", navn: "X" })).toBe(false);
    expect(looksDeleted(null)).toBe(false);
  });
});

describe("the poller never walks the feed by page", () => {
  // 🔴 An absence-guard, the second in this repo — see project-atlas.md.
  //
  // Brreg caps `page` at 20 and builds its HAL `_links.next` with `page=`, so
  // following the next link walks into HTTP 400 after 20 hops having seen only
  // the oldest 10,000 changes — all `Ukjent`, not one deletion. Every test above
  // still passes for such a poller, because the change types it never receives
  // are handled perfectly.
  //
  // What makes this module correct is that two things are NOT in it, and no
  // ordinary test covers an absence. This fails on the pull request that adds
  // them.
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
    // The feed owns the deltas; the bootstrap owns the 1.17M-row snapshot. A bug
    // here must not be able to damage the expensive table.
    expect(code).not.toContain("brreg_enheter_snapshot");
  });
});
