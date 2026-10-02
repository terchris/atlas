import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAvailableYears,
  parseCell,
  parseGsiData,
  parseRapportside,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, "fixtures", name), "utf8"));
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRapportside — real fixture
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRapportside — real rapportside.json fixture", () => {
  const resolved = parseRapportside(loadFixture("rapportside.json"));

  it("resolves the real current report base path", () => {
    expect(resolved.basePath).toBe("rest/v1/Statistikk/GSK/GSI/1/8");
  });

  it("resolves the real current default year code", () => {
    expect(resolved.defaultYearCode).toBe(202510);
  });

  it("throws when rapportElementer is missing", () => {
    expect(() => parseRapportside({ rappside: {} })).toThrow(/no rapportElementer/);
  });

  it("throws when dataEndepunkt doesn't end in /data", () => {
    expect(() =>
      parseRapportside({
        rappside: {
          rapportElementer: [{ dataEndepunkt: "rest/v1/Statistikk/GSK/GSI/1/8/metadata" }],
          filterDefaultVerdier: { TidID: [202510] },
        },
      }),
    ).toThrow(/did not end in "\/data"/);
  });

  it("throws when filterDefaultVerdier.TidID is missing", () => {
    expect(() =>
      parseRapportside({
        rappside: {
          rapportElementer: [{ dataEndepunkt: "rest/v1/Statistikk/GSK/GSI/1/8/data" }],
          filterDefaultVerdier: {},
        },
      }),
    ).toThrow(/filterDefaultVerdier.TidID/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAvailableYears — real fixture
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAvailableYears — real filterverdier_years.json fixture", () => {
  const years = parseAvailableYears(loadFixture("filterverdier_years.json"));

  it("finds every year currently published, sorted ascending", () => {
    expect(years).toEqual([
      201410, 201510, 201610, 201710, 201810, 201910, 202010, 202110, 202210, 202310, 202410,
      202510,
    ]);
  });

  it("throws when TidID is missing", () => {
    expect(() => parseAvailableYears({})).toThrow(/no TidID list/);
  });

  it("throws when TidID parses to zero numeric codes", () => {
    expect(() => parseAvailableYears({ TidID: [{ id: "not-a-number" }] })).toThrow(
      /zero numeric year codes/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("treats Udir's own suppression marker (*) as null", () => {
    expect(parseCell("*")).toBeNull();
    expect(parseCell("")).toBeNull();
    expect(parseCell("   ")).toBeNull();
  });

  it("parses a plain integer string", () => {
    expect(parseCell("5266")).toBe(5266);
  });

  it("strips embedded whitespace (thousands grouping) before parsing", () => {
    expect(parseCell("38 101")).toBe(38101);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseGsiData — real fixture, 2025-26 (school year code 202510)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseGsiData — real fixture, 202510", () => {
  const data = loadFixture("data_202510.json");
  const rows = parseGsiData(data, 202510);

  it("produces exactly 4 measure rows per depth-3 region (358 of them)", () => {
    // 373 total rows in the raw response = 15 fylke (2-segment id) + 358 at
    // depth 3; fylke rows must be filtered out, not summed into kommune
    // figures. The 358 includes Svalbard (2100) alongside real kommuner —
    // this layer only knows tree depth, not which codes are real kommuner;
    // see the Svalbard test below and classify_region_code in the dbt layer.
    expect(rows.length).toBe(358 * 4);
  });

  it("every row carries year 202510 and one of the four known measures", () => {
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([202510]));
    expect(new Set(rows.map((r) => r.measure))).toEqual(
      new Set([
        "Antall elever",
        "Antall elever med individuelt tilrettelagt opplæring/spesialundervisning",
        "Antall elever med forsterket opplæring i norsk",
        "Antall skoler",
      ]),
    );
  });

  it("matches Arendal's real, unsuppressed figures exactly", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    expect(arendal).toHaveLength(4);
    const byMeasure = Object.fromEntries(arendal.map((r) => [r.measure, r.value]));
    expect(byMeasure).toEqual({
      "Antall elever": 5266,
      "Antall elever med individuelt tilrettelagt opplæring/spesialundervisning": 527,
      "Antall elever med forsterket opplæring i norsk": 176,
      "Antall skoler": 20,
    });
  });

  it("represents Udir's own suppression as a null value, not a dropped row (Træna, 1835)", () => {
    const trana = rows.filter((r) => r.region_code === "1835");
    expect(trana).toHaveLength(4);
    const byMeasure = Object.fromEntries(trana.map((r) => [r.measure, r.value]));
    expect(byMeasure).toEqual({
      "Antall elever": 28,
      "Antall elever med individuelt tilrettelagt opplæring/spesialundervisning": null,
      "Antall elever med forsterket opplæring i norsk": null,
      "Antall skoler": 1,
    });
  });

  it("does not leak fylke-level rows (e.g. Agder, a 2-segment id) into the output", () => {
    // Agder's fylke kode is "42" — confirm no region_code "42" row exists
    // (a real kommune could coincidentally share digits with a fylke code,
    // so this checks structurally via the source row count above, and here
    // spot-checks that the national/fylke codes aren't present as 4-digit-only region_code).
    expect(rows.every((r) => r.region_code.length === 4)).toBe(true);
  });

  it("includes Svalbard (2100) verbatim — it is NOT filtered here, because this layer only knows tree depth, not what counts as a real kommune", () => {
    // classify_region_code (dbt layer) is what recognizes 21xx as Svalbard,
    // not a kommune — parse.ts's job is to represent what Udir published at
    // this hierarchy depth, not to pre-judge which codes are real kommuner.
    const svalbard = rows.filter((r) => r.region_code === "2100");
    expect(svalbard).toHaveLength(4);
    const byMeasure = Object.fromEntries(svalbard.map((r) => [r.measure, r.value]));
    expect(byMeasure["Antall elever"]).toBe(194);
  });
});

describe("parseGsiData — real fixture, 2024-25 (school year code 202410)", () => {
  const data = loadFixture("data_202410.json");
  const rows = parseGsiData(data, 202410);

  it("produces kommune-level rows tagged with the requested year", () => {
    expect(rows.length).toBeGreaterThan(1000);
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([202410]));
  });
});

describe("parseGsiData — error handling", () => {
  it("throws when metadata.columns is missing", () => {
    expect(() => parseGsiData({ rows: [] }, 202510)).toThrow(/no metadata.columns/);
  });

  it("throws when a kommune row's data length doesn't match the measure count", () => {
    const bad = {
      metadata: { columns: [[{ name: "A" }, { name: "B" }]] },
      rows: [{ id: "1.49.1423", kode: "4203", data: ["1"] }],
    };
    expect(() => parseGsiData(bad, 202510)).toThrow(/expected 2 \(one per measure\)/);
  });
});
