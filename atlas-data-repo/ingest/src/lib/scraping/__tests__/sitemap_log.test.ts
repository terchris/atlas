import { describe, it, expect } from "vitest";
import { decideFetch, type PriorState } from "../sitemap_log.js";

// `decideFetch` is the only function in sitemap_log.ts with non-trivial
// branching; the rest (`readPriorState`, `upsertDiscovered`, `detectOrphans`)
// is thin postgres.js CRUD that only a real Postgres can meaningfully verify.
// That verification happens via Phase 2's `npm run migrate` + Phase 5's `dbt
// build` + the first per-source PLAN (Folkehjelp) end-to-end smoke test.

describe("decideFetch", () => {
  it("first-seen URL → fetch", () => {
    const decisions = decideFetch(
      new Map(),
      [{ url: "/a", lastmod: new Date("2026-01-01") }],
      new Set(),
    );
    expect(decisions[0]?.action).toBe("fetch");
    expect(decisions[0]?.reason).toBe("first-seen");
  });

  it("null current lastmod → fetch", () => {
    const prior: PriorState = new Map([
      [
        "/a",
        { stored_lastmod: new Date("2026-01-01"), last_seen_at: new Date() },
      ],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: null }],
      new Set(["/a"]),
    );
    expect(decisions[0]?.action).toBe("fetch");
    expect(decisions[0]?.reason).toBe("current-lastmod-null");
  });

  it("null stored lastmod → fetch", () => {
    const prior: PriorState = new Map([
      ["/a", { stored_lastmod: null, last_seen_at: new Date() }],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: new Date("2026-01-01") }],
      new Set(["/a"]),
    );
    expect(decisions[0]?.action).toBe("fetch");
    expect(decisions[0]?.reason).toBe("prior-lastmod-null");
  });

  it("no prior raw row → fetch even with matching lastmod", () => {
    const prior: PriorState = new Map([
      [
        "/a",
        { stored_lastmod: new Date("2026-01-01"), last_seen_at: new Date() },
      ],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: new Date("2026-01-01") }],
      new Set(), // no raw row
    );
    expect(decisions[0]?.action).toBe("fetch");
    expect(decisions[0]?.reason).toBe("no-prior-raw-row");
  });

  it("lastmod advanced → fetch", () => {
    const prior: PriorState = new Map([
      [
        "/a",
        { stored_lastmod: new Date("2026-01-01"), last_seen_at: new Date() },
      ],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: new Date("2026-02-01") }],
      new Set(["/a"]),
    );
    expect(decisions[0]?.action).toBe("fetch");
    expect(decisions[0]?.reason).toBe("lastmod-advanced");
  });

  it("unchanged → skip (all four conditions met)", () => {
    const prior: PriorState = new Map([
      [
        "/a",
        { stored_lastmod: new Date("2026-01-01"), last_seen_at: new Date() },
      ],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: new Date("2026-01-01") }],
      new Set(["/a"]),
    );
    expect(decisions[0]?.action).toBe("skip");
    expect(decisions[0]?.reason).toBe("unchanged");
  });

  it("stored older than current → fetch (lastmod-advanced)", () => {
    const prior: PriorState = new Map([
      [
        "/a",
        { stored_lastmod: new Date("2025-12-31"), last_seen_at: new Date() },
      ],
    ]);
    const decisions = decideFetch(
      prior,
      [{ url: "/a", lastmod: new Date("2026-01-01") }],
      new Set(["/a"]),
    );
    expect(decisions[0]?.action).toBe("fetch");
  });
});
