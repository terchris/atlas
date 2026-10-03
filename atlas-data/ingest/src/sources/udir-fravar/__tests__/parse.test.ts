import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAvailableYears, parseCell, parseFravarData, parseRapportside } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, "fixtures", name), "utf-8"));
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRapportside
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRapportside — real fixture", () => {
  it("resolves the report's own basePath and TidID[0] anchor year", () => {
    const { basePath, defaultYearCode } = parseRapportside(loadFixture("rapportside.json"));
    expect(basePath).toBe("rest/v1/Statistikk/GSK/FravaerG/1/1");
    // ⚠️ This report's own filterDefaultVerdier.TidID is a 3-element trend
    // default ([202306, 202406, 202506]), unlike udir-gsi's single-value
    // TidID — TidID[0] (202306) is only used as filterVerdier's own
    // "obligatorisk" anchor value to discover the FULL year list, never
    // treated as "the current year" by this module.
    expect(defaultYearCode).toBe(202306);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAvailableYears
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAvailableYears — real filterVerdier fixture", () => {
  it("discovers all 11 live school years, ascending", () => {
    const years = parseAvailableYears(loadFixture("filterVerdier.json"));
    expect(years).toEqual([
      201506, 201606, 201706, 201806, 201906, 202006, 202106, 202206, 202306, 202406, 202506,
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("treats Udir's own suppression marker (*) as null", () => {
    expect(parseCell("*")).toBeNull();
    expect(parseCell("")).toBeNull();
  });

  it("parses a Norwegian-decimal-comma figure", () => {
    expect(parseCell("10,0")).toBeCloseTo(10.0);
  });

  it("parses a space-thousands-separated participant count", () => {
    expect(parseCell("4 277")).toBe(4277);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseFravarData — real fixtures
// ─────────────────────────────────────────────────────────────────────────────

describe("parseFravarData — domestic anchor (-12.*.*), real fixture", () => {
  const rows = parseFravarData(loadFixture("data.202506.anchor12.json"), 202506);

  it("produces exactly 5 measure rows per kommune (depth-3 rows only, fylke excluded)", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    expect(arendal).toHaveLength(5);
  });

  it("matches Arendal's real median/average days and hours, and participant count, exactly", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    const byMeasure = Object.fromEntries(arendal.map((r) => [r.measure, r.value]));
    expect(byMeasure["Median dager"]).toBe(10.0);
    expect(byMeasure["Median timer"]).toBe(10.0);
    expect(byMeasure["Snitt dager"]).toBeCloseTo(14.8);
    expect(byMeasure["Snitt timer"]).toBeCloseTo(17.1);
    expect(byMeasure["Antall elever"]).toBe(601);
  });

  it("represents a fully suppressed kommune as null values, not a dropped row (Modalen)", () => {
    const modalen = rows.filter((r) => r.region_code === "4629");
    expect(modalen).toHaveLength(5);
    expect(modalen.every((r) => r.value === null)).toBe(true);
  });

  it("represents the Svalbard pseudo-kommune (2100) with real data, reachable via the domestic anchor", () => {
    const svalbard = rows.filter((r) => r.region_code === "2100");
    expect(svalbard).toHaveLength(5);
    const byMeasure = Object.fromEntries(svalbard.map((r) => [r.measure, r.value]));
    expect(byMeasure["Antall elever"]).toBe(26);
  });

  it("every row carries the passed-in year — not parsed from the response", () => {
    for (const r of rows) {
      expect(r.year).toBe(202506);
    }
  });

  it("excludes fylke-level rows (2-segment id) entirely", () => {
    expect(rows.some((r) => r.region_code === "42")).toBe(false); // Agder, a fylke code
  });

  it("Utsira is entirely absent — a real absence, not a suppressed row", () => {
    expect(rows.some((r) => r.region_code === "1151")).toBe(false);
  });
});

describe("parseFravarData — defensive edge cases, no real fixture triggers these for this source", () => {
  it("returns zero rows, not an error, for a genuinely empty response (defensive — no real combination for this report has been found empty, unlike udir-nasjonale-prover's 9th-grade-English case)", () => {
    const rows = parseFravarData({ metadata: { columns: [] }, rows: [] }, 202506);
    expect(rows).toEqual([]);
  });

  it("throws if metadata.columns is missing entirely", () => {
    expect(() => parseFravarData({ rows: [] }, 202506)).toThrow(/no metadata.columns/);
  });

  it("throws if a row's data array length does not match the measure count", () => {
    const bad = {
      metadata: { columns: [[{ name: "Median dager" }, { name: "Antall elever" }]] },
      rows: [{ id: "1.49.1423", kode: "4203", data: ["10,0"] }],
    };
    expect(() => parseFravarData(bad, 202506)).toThrow(/expected 2 \(one per measure\)/);
  });
});

describe("parseFravarData — Utlandet anchor (-13.*.*), real data, same shape as udir-nasjonale-prover's own finding", () => {
  const rows = parseFravarData(loadFixture("data.202506.anchor13.json"), 202506);

  it("represents Utlandet, uspesifisert (2599) with real, non-suppressed data", () => {
    const utlandet = rows.filter((r) => r.region_code === "2599");
    expect(utlandet).toHaveLength(5);
    const byMeasure = Object.fromEntries(utlandet.map((r) => [r.measure, r.value]));
    expect(byMeasure["Antall elever"]).toBe(65);
  });

  it("excludes the Utlandet fylke-equivalent rollup row (2-segment id, kode 25)", () => {
    expect(rows.some((r) => r.region_code === "25")).toBe(false);
  });
});
