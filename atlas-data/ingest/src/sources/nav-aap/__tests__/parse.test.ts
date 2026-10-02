import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

import { discoverWorkbookPath, extractRegionCode, parseCell, parseSheet } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = "AAP155_2026_08.xlsx";

function loadFixtureWorkbook(): XLSX.WorkBook {
  const bytes = readFileSync(resolve(here, "fixtures", FIXTURE));
  return XLSX.read(bytes, { type: "buffer", cellDates: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverWorkbookPath
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverWorkbookPath — relative-link, multi-tier discovery", () => {
  it("matches the canonical shape (today's live link, relative, not absolute)", () => {
    const html = `<a class="aksel-link" href="/_/attachment/inline/61c2e2a5-7464-428f-b499-e5bd7a1115bd:56d40eb3efb70d24cec9a8d193f149456f42041d/AAP155%20Mottakere.xlsx">K</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("canonical");
    expect(got.path.startsWith("/_/attachment/inline/")).toBe(true);
    expect(got.path.endsWith(".xlsx")).toBe(true);
  });

  it("does not match the PDF sibling link (same uuid family, different extension)", () => {
    const html = `<a href="/_/attachment/inline/0447b9e2-d8ec-48f0-8304-73e8cd3d1bed:ad487e403f87d945250cd4c6829c9bb0f73e6374/AAP155%20Mottakere.pdf">PDF</a>`;
    expect(() => discoverWorkbookPath(html)).toThrow();
  });

  it('falls back to "loose-bare" if the uuid:hash shape changes', () => {
    const html = `<a href="/_/attachment/inline/something-else/AAP155_report.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("loose-bare");
  });

  it("refuses to guess among multiple unnamed xlsx links", () => {
    const html = `
      <a href="/_/attachment/inline/aaa/report_a.xlsx">A</a>
      <a href="/_/attachment/inline/bbb/report_b.xlsx">B</a>
    `;
    expect(() => discoverWorkbookPath(html)).toThrow(/none names AAP155/);
  });

  it("picks the sole candidate when exactly one xlsx link exists and none names AAP155", () => {
    const html = `<a href="/_/attachment/inline/aaa/aap_report.xlsx">Last ned</a>`;
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

  it("returns the literal Ukjent label verbatim, not a parsed code", () => {
    expect(extractRegionCode("Ukjent")).toBe("Ukjent");
  });

  it("returns null for a fylke rollup row (I alt prefix)", () => {
    expect(extractRegionCode("I alt 11 Rogaland")).toBeNull();
  });

  it("returns null for the Ukjent rollup row (I alt Ukjent, not the bare label)", () => {
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
    expect(parseCell(436)).toBe(436);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSheet — real fixture, January-August 2026
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSheet — real AAP155 fixture, 1. Kommune. Antall", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "1. Kommune. Antall", "antall");

  it("produces exactly 357 kommune + 1 Ukjent region, 8 months each", () => {
    const distinctRegions = new Set(rows.map((r) => r.region_code));
    expect(distinctRegions.size).toBe(358);
    expect(rows.length).toBe(358 * 8);
  });

  it("every row carries year 2026 and category_format antall", () => {
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([2026]));
    expect(new Set(rows.map((r) => r.category_format))).toEqual(new Set(["antall"]));
  });

  it("does not leak fylke rollup rows into the output (no row sums Rogaland's kommuner)", () => {
    // "I alt 11 Rogaland" (14140 in January) must not appear as its own
    // region_code — only real kommuner and Ukjent are region rows here.
    expect(rows.some((r) => r.region_code === "11")).toBe(false);
  });

  it("matches Eigersund's real January-August figures exactly", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101");
    expect(eigersund).toHaveLength(8);
    const byMonth = Object.fromEntries(eigersund.map((r) => [r.month, r.value]));
    expect(byMonth).toEqual({
      1: 436,
      2: 438,
      3: 439,
      4: 430,
      5: 431,
      6: 436,
      7: 437,
      8: 437,
    });
  });

  it("represents NAV's own suppression as a null value, not a dropped row (Utsira, 1151)", () => {
    const utsira = rows.filter((r) => r.region_code === "1151");
    expect(utsira).toHaveLength(8);
    expect(utsira.every((r) => r.value === null)).toBe(true);
  });

  it("represents the Ukjent (unknown-region) bucket verbatim, as a real non-zero count", () => {
    const ukjent = rows.filter((r) => r.region_code === "Ukjent");
    expect(ukjent).toHaveLength(8);
    const january = ukjent.find((r) => r.month === 1);
    expect(january?.value).toBe(1528);
  });

  it("every row's values_json carries the full 8-month spine for that region", () => {
    const eigersundJan = rows.find((r) => r.region_code === "1101" && r.month === 1);
    expect(eigersundJan?.values_json).toMatchObject({
      "1": 436,
      "8": 437,
    });
  });
});

describe("parseSheet — real AAP155 fixture, 2. Kommune. Andel", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "2. Kommune. Andel", "andel");

  it("produces 357 kommune regions, tagged andel — NOT 358", () => {
    // Confirmed live 2026-10-02: NAV omits "Ukjent" entirely from the Andel
    // sheet — there is no population denominator to compute a share against
    // for a region that isn't a real geographic area. This is a genuine
    // asymmetry between the two sheets, not a parser bug; see parse.ts.
    expect(new Set(rows.map((r) => r.category_format))).toEqual(new Set(["andel"]));
    const distinctRegions = new Set(rows.map((r) => r.region_code));
    expect(distinctRegions.size).toBe(357);
    expect(distinctRegions.has("Ukjent")).toBe(false);
  });

  it("matches Eigersund's real share figures exactly", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101");
    const byMonth = Object.fromEntries(eigersund.map((r) => [r.month, r.value]));
    expect(byMonth[1]).toBe(4.6);
  });
});

describe("parseSheet — error handling", () => {
  it("throws when the named sheet doesn't exist", () => {
    const wb = loadFixtureWorkbook();
    expect(() => parseSheet(wb, "Nonexistent Sheet", "antall")).toThrow(/missing sheet/);
  });
});
