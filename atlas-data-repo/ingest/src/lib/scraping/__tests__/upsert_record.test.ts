import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { upsertRecord } from "../upsert_record.js";
import { createTestDb, type TestDb } from "./_db_setup.js";

const TABLE = "raw.test_scraper";
const COLS = [
  "url",
  "record_hash",
  "html_raw_hash",
  "is_active",
  "loaded_at",
  "name",
] as const;

// See sitemap_log.test.ts for the pg-mem incompatibility rationale. The
// validation-only tests (missing url / missing record_hash) below don't need
// the DB — they run in the separate describe block at the bottom of this
// file, which is NOT skipped.
describe.skip("upsertRecord — DB flow", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it("inserts a new row (first time a URL is seen)", async () => {
    const result = await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/oslo",
        record_hash: "a".repeat(64),
        html_raw_hash: "b".repeat(64),
        is_active: true,
        loaded_at: new Date(),
        name: "Oslo",
      },
      columns: COLS,
    });
    expect(result).toBe("inserted");

    const rows = await db.sql<
      { url: string; name: string; is_active: boolean }[]
    >`select url, name, is_active from raw.test_scraper`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("/oslo");
    expect(rows[0]?.name).toBe("Oslo");
    expect(rows[0]?.is_active).toBe(true);
  });

  it("skipped when the record_hash matches stored", async () => {
    const now = new Date();
    const hash = "c".repeat(64);
    await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/bergen",
        record_hash: hash,
        html_raw_hash: null,
        is_active: true,
        loaded_at: now,
        name: "Bergen",
      },
      columns: COLS,
    });

    // Same record_hash → skip.
    const result = await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/bergen",
        record_hash: hash,
        html_raw_hash: null,
        is_active: true,
        loaded_at: new Date(),
        name: "DIFFERENT NAME", // should not be written
      },
      columns: COLS,
    });
    expect(result).toBe("skipped");

    const rows = await db.sql<
      { name: string }[]
    >`select name from raw.test_scraper where url = '/bergen'`;
    expect(rows[0]?.name).toBe("Bergen"); // original preserved
  });

  it("updated when the record_hash differs from stored", async () => {
    await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/trondheim",
        record_hash: "d".repeat(64),
        html_raw_hash: null,
        is_active: true,
        loaded_at: new Date(),
        name: "Trondheim",
      },
      columns: COLS,
    });
    const result = await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/trondheim",
        record_hash: "e".repeat(64), // different hash → must update
        html_raw_hash: null,
        is_active: true,
        loaded_at: new Date(),
        name: "Trondheim v2",
      },
      columns: COLS,
    });
    expect(result).toBe("updated");

    const rows = await db.sql<
      { name: string; record_hash: string }[]
    >`select name, record_hash from raw.test_scraper where url = '/trondheim'`;
    expect(rows[0]?.name).toBe("Trondheim v2");
    expect(rows[0]?.record_hash).toBe("e".repeat(64));
  });

  it("passes is_active=false through on upsert (orphan-propagation path)", async () => {
    // First insert as active.
    await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/stavanger",
        record_hash: "f".repeat(64),
        html_raw_hash: null,
        is_active: true,
        loaded_at: new Date(),
        name: "Stavanger",
      },
      columns: COLS,
    });
    // Mark inactive. The caller (orphan-propagation code in index.ts) must
    // use a DIFFERENT record_hash for the skip logic to fire the update path.
    const result = await upsertRecord(db.sql, {
      tableName: TABLE,
      row: {
        url: "/stavanger",
        record_hash: "g".repeat(64),
        html_raw_hash: null,
        is_active: false,
        loaded_at: new Date(),
        name: "Stavanger",
      },
      columns: COLS,
    });
    expect(result).toBe("updated");

    const rows = await db.sql<
      { is_active: boolean }[]
    >`select is_active from raw.test_scraper where url = '/stavanger'`;
    expect(rows[0]?.is_active).toBe(false);
  });

});

// Input-validation tests: these run without a DB because the errors are
// raised before any SQL is issued. A throwaway `sql` stub is enough.
describe("upsertRecord — input validation", () => {
  // The sql stub should never be called on the error path; cast as the Sql
  // type to satisfy the signature.
  const sqlStub = (() => {
    throw new Error("sql should not be called on the validation path");
  }) as unknown as import("postgres").Sql;

  it("throws when row.url is missing", async () => {
    await expect(
      upsertRecord(sqlStub, {
        tableName: TABLE,
        row: {
          record_hash: "x".repeat(64),
          is_active: true,
          loaded_at: new Date(),
          name: "X",
        },
        columns: ["record_hash", "is_active", "loaded_at", "name"] as const,
      }),
    ).rejects.toThrow(/row\.url/);
  });

  it("throws when row.record_hash is missing", async () => {
    await expect(
      upsertRecord(sqlStub, {
        tableName: TABLE,
        row: {
          url: "/x",
          is_active: true,
          loaded_at: new Date(),
          name: "X",
        },
        columns: ["url", "is_active", "loaded_at", "name"] as const,
      }),
    ).rejects.toThrow(/record_hash/);
  });

  it("throws when columns doesn't include 'record_hash'", async () => {
    await expect(
      upsertRecord(sqlStub, {
        tableName: TABLE,
        row: { url: "/x", record_hash: "z".repeat(64), name: "X" },
        columns: ["url", "name"] as const,
      }),
    ).rejects.toThrow(/columns must include/);
  });
});
