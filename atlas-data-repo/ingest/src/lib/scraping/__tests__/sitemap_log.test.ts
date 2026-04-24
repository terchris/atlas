import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readPriorState,
  decideFetch,
  upsertDiscovered,
  detectOrphans,
  type PriorState,
  type DiscoveredUrl,
} from "../sitemap_log.js";
import { createTestDb, type TestDb } from "./_db_setup.js";

const SLUG = "test-source";

describe("decideFetch (pure)", () => {
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

// pg-mem's postgres.js adapter hangs on mixed SELECT+INSERT workloads — the
// first few tests in a file pass, later tests time out at 5s. The test suite
// below is valid and describes expected behavior, but the pg-mem adapter
// cannot execute it reliably. These tests are re-enabled either (a) when
// pg-mem's compatibility improves, or (b) when we point them at a real
// Postgres (e.g. testcontainers, or the project's local dev DB). In the
// meantime the DB-touching code is validated by Phase 6's dbt build gate
// against the migrated real database, and by the first per-source PLAN
// (Folkehjelp) exercising the full flow end-to-end. See PLAN-001 Phase 4
// notes for the deviation log.
describe.skip("sitemap_log DB flow", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it("first-run: readPriorState returns empty map", async () => {
    const prior = await readPriorState(db.sql, SLUG);
    expect(prior.size).toBe(0);
  });

  it("upsertDiscovered inserts new URLs with matching first_seen_at and last_seen_at", async () => {
    const urls: DiscoveredUrl[] = [
      { url: "/a", lastmod: new Date("2026-01-01") },
      { url: "/b", lastmod: null },
    ];
    await upsertDiscovered(db.sql, SLUG, urls);

    const prior = await readPriorState(db.sql, SLUG);
    expect(prior.size).toBe(2);
    expect(prior.get("/a")?.stored_lastmod?.toISOString()).toBe(
      new Date("2026-01-01").toISOString(),
    );
    expect(prior.get("/b")?.stored_lastmod).toBeNull();
  });

  it("upsertDiscovered updates last_seen_at on re-run for existing URLs", async () => {
    const urls: DiscoveredUrl[] = [
      { url: "/a", lastmod: new Date("2026-01-01") },
    ];
    await upsertDiscovered(db.sql, SLUG, urls);
    const first = await readPriorState(db.sql, SLUG);
    const firstSeenAt = first.get("/a")!.last_seen_at;

    // Small wait so last_seen_at advances detectably.
    await new Promise((r) => setTimeout(r, 20));

    await upsertDiscovered(db.sql, SLUG, urls);
    const second = await readPriorState(db.sql, SLUG);
    const secondSeenAt = second.get("/a")!.last_seen_at;

    expect(secondSeenAt.getTime()).toBeGreaterThan(firstSeenAt.getTime());
  });

  it("detectOrphans finds URLs whose last_seen_at is older than run start", async () => {
    // Seed with two URLs, simulate a run that only re-discovers /a.
    await upsertDiscovered(db.sql, SLUG, [
      { url: "/a", lastmod: new Date("2026-01-01") },
      { url: "/b-orphan", lastmod: new Date("2026-01-01") },
    ]);

    await new Promise((r) => setTimeout(r, 20));
    const runStartedAt = new Date();
    await new Promise((r) => setTimeout(r, 20));

    // Re-discover only /a in the second run.
    await upsertDiscovered(db.sql, SLUG, [
      { url: "/a", lastmod: new Date("2026-02-01") },
    ]);

    const orphans = await detectOrphans(db.sql, SLUG, runStartedAt);
    expect(orphans).toEqual(["/b-orphan"]);
  });

  it("isolates by source_slug — orphans for one source don't affect another", async () => {
    await upsertDiscovered(db.sql, "source-a", [
      { url: "/a", lastmod: new Date("2026-01-01") },
    ]);
    await upsertDiscovered(db.sql, "source-b", [
      { url: "/b", lastmod: new Date("2026-01-01") },
    ]);

    await new Promise((r) => setTimeout(r, 20));
    const runStartedAt = new Date();
    await new Promise((r) => setTimeout(r, 20));

    // source-a re-discovers /a; source-b runs no discovery this time.
    await upsertDiscovered(db.sql, "source-a", [
      { url: "/a", lastmod: new Date("2026-02-01") },
    ]);

    // For source-a, there should be no orphans.
    expect(await detectOrphans(db.sql, "source-a", runStartedAt)).toEqual([]);
    // For source-b, /b is now orphan relative to runStartedAt (it wasn't
    // updated in the window after runStartedAt).
    expect(await detectOrphans(db.sql, "source-b", runStartedAt)).toEqual([
      "/b",
    ]);
  });

  it("readPriorState is scoped per source_slug", async () => {
    await upsertDiscovered(db.sql, "source-a", [
      { url: "/x", lastmod: new Date("2026-01-01") },
    ]);
    await upsertDiscovered(db.sql, "source-b", [
      { url: "/y", lastmod: new Date("2026-01-01") },
    ]);
    expect((await readPriorState(db.sql, "source-a")).size).toBe(1);
    expect((await readPriorState(db.sql, "source-b")).size).toBe(1);
    expect((await readPriorState(db.sql, "source-c")).size).toBe(0);
  });
});
