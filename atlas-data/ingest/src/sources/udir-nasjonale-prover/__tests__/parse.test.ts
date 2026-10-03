import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAvailableYears,
  parseCell,
  parseNasjonaleProeverData,
  parseProevetypeOptions,
  parseRapportside,
  parseTrinnOptions,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, "fixtures", name), "utf-8"));
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRapportside
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRapportside — real fixtures for both report versions", () => {
  it("resolves the ungdomstrinn report's own basePath and year", () => {
    const { basePath, defaultYearCode } = parseRapportside(loadFixture("rapportside.ungdomstrinn.json"));
    expect(basePath).toBe("rest/v1/Statistikk/GSK/NasjonaleProever/1/1");
    expect(defaultYearCode).toBeGreaterThanOrEqual(20252026);
  });

  it("resolves the 5th-grade report's own, genuinely different basePath", () => {
    const { basePath } = parseRapportside(loadFixture("rapportside.trinn5.json"));
    expect(basePath).toBe("rest/v1/Statistikk/GSK/NasjonaleProever/4/1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAvailableYears
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAvailableYears — real filterVerdier fixtures", () => {
  it("discovers all 4 live school years for the ungdomstrinn report", () => {
    const years = parseAvailableYears(loadFixture("filterVerdier.ungdomstrinn.json"));
    expect(years).toEqual([20222023, 20232024, 20242025, 20252026]);
  });

  it("discovers the same 4 years for the 5th-grade report", () => {
    const years = parseAvailableYears(loadFixture("filterVerdier.trinn5.json"));
    expect(years).toEqual([20222023, 20232024, 20242025, 20252026]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTrinnOptions / parseProevetypeOptions
// ─────────────────────────────────────────────────────────────────────────────

describe("parseTrinnOptions", () => {
  it("discovers grades 8 and 9 for the ungdomstrinn report", () => {
    const options = parseTrinnOptions(loadFixture("filterVerdier.ungdomstrinn.json"));
    expect(options.map((o) => o.grade).sort()).toEqual([8, 9]);
  });

  it("discovers exactly one grade (5) for the 5th-grade report — filterVerdier carries it even though Rapportside.gyldigeFiltre omits TrinnID for this report", () => {
    const options = parseTrinnOptions(loadFixture("filterVerdier.trinn5.json"));
    expect(options).toEqual([{ id: 4, grade: 5 }]);
  });
});

describe("parseProevetypeOptions", () => {
  it("discovers all three subjects with their real stable codes", () => {
    const options = parseProevetypeOptions(loadFixture("filterVerdier.ungdomstrinn.json"));
    expect(options.map((o) => o.subject).sort()).toEqual(["NPENG", "NPLES", "NPREG"]);
  });

  it("throws if ProevetypeID is missing", () => {
    expect(() => parseProevetypeOptions({})).toThrow(/ProevetypeID/);
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

  it("parses a plain integer scale score", () => {
    expect(parseCell("48")).toBe(48);
  });

  it("parses a Norwegian-decimal-comma uncertainty figure", () => {
    expect(parseCell("0,8")).toBeCloseTo(0.8);
  });

  it("parses a space-thousands-separated participant count", () => {
    expect(parseCell("6 640")).toBe(6640);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseNasjonaleProeverData — real fixtures
// ─────────────────────────────────────────────────────────────────────────────

describe("parseNasjonaleProeverData — ungdomstrinn, 8th grade, reading (NPLES), real fixture", () => {
  const rows = parseNasjonaleProeverData(
    loadFixture("data.ungdomstrinn.grade8.NPLES.anchor12.json"),
    8,
    "NPLES",
    20252026,
  );

  it("produces exactly 3 measure rows per kommune (depth-3 rows only, fylke excluded)", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    expect(arendal).toHaveLength(3);
  });

  it("matches Arendal's real scale score, uncertainty, and participant count exactly", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    const byMeasure = Object.fromEntries(arendal.map((r) => [r.measure, r.value]));
    expect(byMeasure["Skalapoeng"]).toBe(48);
    expect(byMeasure["Usikkerhet"]).toBeCloseTo(0.8);
    expect(byMeasure["Antall elever deltatt"]).toBe(538);
  });

  it("represents a fully suppressed kommune as null values, not a dropped row (Bygland/Bykle)", () => {
    for (const kode of ["4220", "4222"]) {
      const rows_ = rows.filter((r) => r.region_code === kode);
      expect(rows_).toHaveLength(3);
      expect(rows_.every((r) => r.value === null)).toBe(true);
    }
  });

  it("represents the Svalbard pseudo-kommune (2100) with real data, reachable via the domestic anchor", () => {
    const svalbard = rows.filter((r) => r.region_code === "2100");
    expect(svalbard).toHaveLength(3);
    const byMeasure = Object.fromEntries(svalbard.map((r) => [r.measure, r.value]));
    expect(byMeasure["Skalapoeng"]).toBe(52);
  });

  it("every row carries the passed-in grade, subject, and year — not parsed from the response", () => {
    for (const r of rows) {
      expect(r.grade).toBe(8);
      expect(r.subject).toBe("NPLES");
      expect(r.year).toBe(20252026);
    }
  });

  it("excludes fylke-level rows (2-segment id) entirely", () => {
    expect(rows.some((r) => r.region_code === "42")).toBe(false); // Agder, a fylke code
  });
});

describe("parseNasjonaleProeverData — Utlandet anchor (-13.*.*), a finding neither sibling Udir source needed", () => {
  const rows = parseNasjonaleProeverData(
    loadFixture("data.ungdomstrinn.grade8.NPLES.anchor13.json"),
    8,
    "NPLES",
    20252026,
  );

  it("represents Utlandet, uspesifisert (2599) with real, non-suppressed data", () => {
    const utlandet = rows.filter((r) => r.region_code === "2599");
    expect(utlandet).toHaveLength(3);
    const byMeasure = Object.fromEntries(utlandet.map((r) => [r.measure, r.value]));
    expect(byMeasure["Skalapoeng"]).toBe(47);
    expect(byMeasure["Antall elever deltatt"]).toBe(73);
  });

  it("excludes the Utlandet fylke-equivalent rollup row (2-segment id, kode 25)", () => {
    expect(rows.some((r) => r.region_code === "25")).toBe(false);
  });
});

describe("parseNasjonaleProeverData — 9th grade English, a combination that genuinely does not exist", () => {
  it("returns zero rows, not an error, for a genuinely empty response", () => {
    const rows = parseNasjonaleProeverData(
      loadFixture("data.ungdomstrinn.grade9.NPENG.anchor12.json"),
      9,
      "NPENG",
      20252026,
    );
    expect(rows).toEqual([]);
  });
});

describe("parseNasjonaleProeverData — 5th grade (implicit, no TrinnID filter), real fixture", () => {
  const rows = parseNasjonaleProeverData(loadFixture("data.trinn5.NPLES.anchor12.json"), 5, "NPLES", 20252026);

  it("matches Arendal's real 5th-grade figures, distinct from 8th grade's", () => {
    const arendal = rows.filter((r) => r.region_code === "4203");
    const byMeasure = Object.fromEntries(arendal.map((r) => [r.measure, r.value]));
    expect(byMeasure["Antall elever deltatt"]).toBe(465); // 8th grade's own fixture had 538
  });

  it("every row carries grade 5, supplied by the caller since this report has no TrinnID filter", () => {
    expect(new Set(rows.map((r) => r.grade))).toEqual(new Set([5]));
  });
});
