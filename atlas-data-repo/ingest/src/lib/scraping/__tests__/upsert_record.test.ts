import { describe, it, expect } from "vitest";
import { upsertRecord } from "../upsert_record.js";

// Pure input-validation tests. The INSERT/UPDATE/SELECT behavior of
// upsertRecord is verified end-to-end by the first per-source PLAN
// (Folkehjelp) against real Postgres; unit tests against a mocked DB would
// mostly test that postgres.js works.
//
// The sql argument below is a stub because every case here must throw before
// any SQL is issued. If it's ever called, the test fails loudly.

const sqlStub = (() => {
  throw new Error("sql should not be called on the validation path");
}) as unknown as import("postgres").Sql;

const TABLE = "raw.test_scraper";

describe("upsertRecord — input validation", () => {
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
