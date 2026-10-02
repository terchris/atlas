import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

import { discoverWorkbookPath, extractRegionCode, parseCell, parseSheet } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = "HL060_2026_08.xlsx";

function loadFixtureWorkbook(): XLSX.WorkBook {
  const bytes = readFileSync(resolve(here, "fixtures", FIXTURE));
  return XLSX.read(bytes, { type: "buffer", cellDates: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverWorkbookPath
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverWorkbookPath — relative-link, multi-tier discovery", () => {
  it("matches the canonical shape (today's live link, relative, not absolute)", () => {
    const html = `<a class="aksel-link" href="/_/attachment/download/9d4a48b2-3f8a-4bff-aee6-f18e8ed459e0:a833323681bf8e44c0536c619511f2a93534afe6/202608_HL060%20Helt%20ledige.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("canonical");
    expect(got.path.startsWith("/_/attachment/download/")).toBe(true);
    expect(got.path.endsWith(".xlsx")).toBe(true);
  });

  it("does not match a PDF sibling link (same uuid family, different extension)", () => {
    const html = `<a href="/_/attachment/download/0447b9e2-d8ec-48f0-8304-73e8cd3d1bed:ad487e403f87d945250cd4c6829c9bb0f73e6374/202608_HL060%20Helt%20ledige.pdf">PDF</a>`;
    expect(() => discoverWorkbookPath(html)).toThrow();
  });

  it('falls back to "loose-bare" if the uuid:hash shape changes', () => {
    const html = `<a href="/_/attachment/download/something-else/HL060_report.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("loose-bare");
  });

  it("refuses to guess among multiple unnamed xlsx links", () => {
    const html = `
      <a href="/_/attachment/download/aaa/report_a.xlsx">A</a>
      <a href="/_/attachment/download/bbb/report_b.xlsx">B</a>
    `;
    expect(() => discoverWorkbookPath(html)).toThrow(/none names HL060/);
  });

  it("picks the sole candidate when exactly one xlsx link exists and none names HL060", () => {
    const html = `<a href="/_/attachment/download/aaa/helt_ledige_report.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("sole-upload");
  });

  it("throws when no xlsx link exists at all", () => {
    expect(() => discoverWorkbookPath("<p>nothing here</p>")).toThrow(/Could not find/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractRegionCode
// ─────────────────────────────────────────────────────────────────────────────

describe("extractRegionCode", () => {
  it("extracts a 4-digit kommune code", () => {
    expect(extractRegionCode("1101 Eigersund")).toBe("1101");
  });

  it("extracts the Svalbard pseudo-kommune code", () => {
    expect(extractRegionCode("2100 Svalbard")).toBe("2100");
  });

  it("returns the literal Ukjent label verbatim, not a parsed code", () => {
    expect(extractRegionCode("Ukjent")).toBe("Ukjent");
  });

  it("returns null for a bare fylke header row (no digit, no I alt prefix)", () => {
    expect(extractRegionCode("Oslo - Oslove")).toBeNull();
    expect(extractRegionCode("Rogaland")).toBeNull();
    expect(extractRegionCode("Svalbard og øvrige områder")).toBeNull();
  });

  it("returns null for an I alt rollup row", () => {
    expect(extractRegionCode("I alt Oslo - Oslove")).toBeNull();
    expect(extractRegionCode("I alt Ukjent")).toBeNull();
  });

  it("returns null for a non-region label", () => {
    expect(extractRegionCode("Kilde: NAV")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("treats NAV's own suppression marker (*) as null", () => {
    expect(parseCell("*")).toBeNull();
    expect(parseCell("")).toBeNull();
    expect(parseCell(null)).toBeNull();
  });

  it("parses a plain numeric cell", () => {
    expect(parseCell(197)).toBe(197);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSheet — real fixture, January-August 2026
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSheet — real HL060 fixture, 3. Kommune Antall", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "3. Kommune Antall", "antall");

  it("produces exactly 357 kommuner + Svalbard (2100) + Ukjent = 359 regions, 8 months each", () => {
    const distinctRegions = new Set(rows.map((r) => r.region_code));
    expect(distinctRegions.size).toBe(359);
    expect(rows.length).toBe(359 * 8);
  });

  it("every row carries year 2026 and category_format antall", () => {
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([2026]));
    expect(new Set(rows.map((r) => r.category_format))).toEqual(new Set(["antall"]));
  });

  it("does not leak fylke header or I alt rollup rows into the output", () => {
    expect(rows.some((r) => r.region_code === "Oslo - Oslove")).toBe(false);
    expect(rows.some((r) => r.region_code === "Rogaland")).toBe(false);
  });

  it("matches Eigersund's real January-August figures exactly", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101");
    expect(eigersund).toHaveLength(8);
    const byMonth = Object.fromEntries(eigersund.map((r) => [r.month, r.value]));
    expect(byMonth).toEqual({
      1: 197,
      2: 198,
      3: 256,
      4: 247,
      5: 211,
      6: 166,
      7: 215,
      8: 182,
    });
  });

  it("represents a mixed real/suppressed row faithfully (Utsira, 1151)", () => {
    const utsira = rows.filter((r) => r.region_code === "1151");
    expect(utsira).toHaveLength(8);
    const byMonth = Object.fromEntries(utsira.map((r) => [r.month, r.value]));
    expect(byMonth).toEqual({
      1: null,
      2: null,
      3: null,
      4: null,
      5: 4,
      6: null,
      7: 4,
      8: null,
    });
  });

  it("represents the Svalbard pseudo-kommune (2100) as a real region with real values", () => {
    const svalbard = rows.filter((r) => r.region_code === "2100");
    expect(svalbard).toHaveLength(8);
    const january = svalbard.find((r) => r.month === 1);
    expect(january?.value).toBe(13);
  });

  it("represents the Ukjent bucket verbatim, as a real non-zero count — and drops its own bare fylke-header duplicate", () => {
    const ukjent = rows.filter((r) => r.region_code === "Ukjent");
    expect(ukjent).toHaveLength(8);
    const january = ukjent.find((r) => r.month === 1);
    expect(january?.value).toBe(13);
  });

  it("every row's values_json carries the full 8-month spine for that region", () => {
    const eigersundJan = rows.find((r) => r.region_code === "1101" && r.month === 1);
    expect(eigersundJan?.values_json).toMatchObject({
      "1": 197,
      "8": 182,
    });
  });
});

describe("parseSheet — real HL060 fixture, 4. Kommune Prosent av arbeidsst", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "4. Kommune Prosent av arbeidsst", "prosent");

  it("produces 359 regions too — unlike nav-aap, Ukjent is NOT omitted from the share sheet here", () => {
    const distinctRegions = new Set(rows.map((r) => r.region_code));
    expect(distinctRegions.size).toBe(359);
    expect(distinctRegions.has("Ukjent")).toBe(true);
  });

  it("represents Ukjent's share as fully suppressed (every month null), not a dropped row", () => {
    const ukjent = rows.filter((r) => r.region_code === "Ukjent");
    expect(ukjent).toHaveLength(8);
    expect(ukjent.every((r) => r.value === null)).toBe(true);
  });

  it("matches Eigersund's real share figures exactly", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101");
    const byMonth = Object.fromEntries(eigersund.map((r) => [r.month, r.value]));
    expect(byMonth[1]).toBe(2.5);
  });
});

describe("parseSheet — error handling", () => {
  it("throws when the named sheet doesn't exist", () => {
    const wb = loadFixtureWorkbook();
    expect(() => parseSheet(wb, "Nonexistent Sheet", "antall")).toThrow(/missing sheet/);
  });
});
