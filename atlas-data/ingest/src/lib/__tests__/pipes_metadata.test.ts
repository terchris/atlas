import { describe, expect, it } from "vitest";

import { buildMaterializationMetadata } from "../pipes_metadata.js";

describe("buildMaterializationMetadata", () => {
  // The regression this exists for: the JS Pipes SDK's normalizeMetadata does
  // `'type' in value`, which throws on null. One null value costs the entire
  // materialisation payload, and recordIngestRun swallows the throw by design,
  // so the only symptom is a materialisation with no metadata.
  it("omits absent values instead of nulling them", () => {
    const m = buildMaterializationMetadata(
      "ssb-08764",
      { rowsParsed: 1327, rowsScraped: null, rowsSkipped: undefined },
      42,
    );
    expect(m).toEqual({
      source_id: "ssb-08764",
      ingest_run_id: 42,
      rows_parsed: 1327,
    });
    expect(Object.values(m).every((v) => v !== null && v !== undefined)).toBe(true);
  });

  it("never emits a null value even when every field is absent", () => {
    const m = buildMaterializationMetadata("frr", {}, null);
    expect(m).toEqual({ source_id: "frr" });
    expect(Object.values(m)).not.toContain(null);
  });

  it("keeps zero, which is a real row count and must not be dropped", () => {
    const m = buildMaterializationMetadata("frr", { rowsParsed: 0 }, 7);
    expect(m["rows_parsed"]).toBe(0);
  });

  it("serialises upstreamUpdatedAt as an ISO string", () => {
    const m = buildMaterializationMetadata(
      "fhi-mobbing",
      { upstreamUpdatedAt: new Date("2026-01-22T10:00:00.000Z") },
      1,
    );
    expect(m["upstream_updated_at"]).toBe("2026-01-22T10:00:00.000Z");
  });

  it("includes every populated field", () => {
    const m = buildMaterializationMetadata(
      "redcross-branches",
      {
        rowsScraped: 10,
        rowsParsed: 9,
        rowsSkipped: 1,
        warningsCount: 2,
        errorsCount: 0,
      },
      3,
    );
    expect(m).toEqual({
      source_id: "redcross-branches",
      ingest_run_id: 3,
      rows_scraped: 10,
      rows_parsed: 9,
      rows_skipped: 1,
      warnings_count: 2,
      errors_count: 0,
    });
  });
});
