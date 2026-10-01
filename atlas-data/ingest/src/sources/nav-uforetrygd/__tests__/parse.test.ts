import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

import {
  discoverWorkbookPath,
  extractRegionCode,
  MONTH_NUMBERS,
  parseCell,
  parseSheet,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = "PST302_2026_08.xlsx";

function loadFixtureWorkbook(): XLSX.WorkBook {
  const bytes = readFileSync(resolve(here, "fixtures", FIXTURE));
  return XLSX.read(bytes, { type: "buffer", cellDates: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverWorkbookPath
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverWorkbookPath — relative-link, multi-tier discovery", () => {
  it("matches the canonical shape (today's live link, relative, not absolute)", () => {
    const html = `<a href="/_/attachment/download/855412db-d0fd-43a0-b95a-6bcc8ebce452:1f8698cabefce49111bb7128294027e0f28eca13/PST302%20Mottakere.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("canonical");
    expect(got.path.startsWith("/_/attachment/download/")).toBe(true);
    expect(got.path.endsWith(".xlsx")).toBe(true);
  });

  it("does not match the PDF sibling link (same uuid family, different extension)", () => {
    const html = `<a href="/_/attachment/download/5bb8e59a-b695-42c1-a2a3-8cc5a1874a48:7c76d8be68c8af77a60bd4a4514b8cc317f96081/PST302%20Mottakere.pdf">PDF</a>`;
    expect(() => discoverWorkbookPath(html)).toThrow();
  });

  it('falls back to "loose-bare" if the uuid:hash shape changes', () => {
    const html = `<a href="/_/attachment/download/something-else/PST302_report.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("loose-bare");
  });

  it("refuses to guess among multiple unnamed xlsx links", () => {
    const html = `
      <a href="/_/attachment/download/aaa/report_a.xlsx">A</a>
      <a href="/_/attachment/download/bbb/report_b.xlsx">B</a>
    `;
    expect(() => discoverWorkbookPath(html)).toThrow(/none names PST302/);
  });

  it("picks the sole candidate when exactly one xlsx link exists and none names PST302", () => {
    const html = `<a href="/_/attachment/download/aaa/uforetrygd_report.xlsx">Last ned</a>`;
    const got = discoverWorkbookPath(html);
    expect(got.matchTier).toBe("sole-upload");
  });

  it("throws with a diagnostic when nothing is found", () => {
    const html = `<html><body>No relevant link here</body></html>`;
    expect(() => discoverWorkbookPath(html)).toThrow(/Could not find/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractRegionCode
// ─────────────────────────────────────────────────────────────────────────────

describe("extractRegionCode", () => {
  it("accepts 2-digit (fylke), 4-digit (kommune) and 6-digit (bydel) codes", () => {
    expect(extractRegionCode("03 Oslo - Oslove i alt  ")).toBe("03");
    expect(extractRegionCode("1101 Eigersund")).toBe("1101");
    expect(extractRegionCode("030101 Gamle Oslo")).toBe("030101");
  });

  it("extracts the same code regardless of an 'i alt' suffix", () => {
    expect(extractRegionCode("1103 Stavanger i alt  ")).toBe("1103");
    expect(extractRegionCode("0301 Oslo - Oslove")).toBe("0301");
  });

  it("rejects a non-2/4/6-digit leading run", () => {
    expect(extractRegionCode("123 Not a real code")).toBeNull();
    expect(extractRegionCode("12345 Also not real")).toBeNull();
  });

  it("returns null for a label with no leading digits at all", () => {
    expect(extractRegionCode("Januar")).toBeNull();
    expect(extractRegionCode("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("treats NAV's own suppression marker (*) as null", () => {
    expect(parseCell("*")).toBeNull();
    expect(parseCell(null)).toBeNull();
    expect(parseCell("")).toBeNull();
  });

  it("passes native numeric cells through directly", () => {
    expect(parseCell(32071)).toBe(32071);
    expect(parseCell(6.306333321699)).toBeCloseTo(6.306333321699);
  });

  it("defensively handles a Norwegian-decimal-comma string, even though none is observed live", () => {
    expect(parseCell("6,3")).toBeCloseTo(6.3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTH_NUMBERS
// ─────────────────────────────────────────────────────────────────────────────

describe("MONTH_NUMBERS", () => {
  it("covers all 12 Norwegian month names", () => {
    expect(Object.keys(MONTH_NUMBERS)).toHaveLength(12);
    expect(MONTH_NUMBERS["Januar"]).toBe(1);
    expect(MONTH_NUMBERS["Desember"]).toBe(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSheet — end to end against the real fixture workbook
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSheet — real fixture, Kommune-bydel. Antall", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "Kommune-bydel. Antall", "antall");

  it("produces a plausible number of rows (kommuner + bydeler + fylke totals, x months)", () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it("every row is tagged category_format antall and a plausible year", () => {
    expect(rows.every((r) => r.category_format === "antall")).toBe(true);
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([2026]));
  });

  it("includes the Oslo fylke total (2-digit code) with real, unsuppressed values", () => {
    const osloFylke = rows.filter((r) => r.region_code === "03");
    expect(osloFylke.length).toBeGreaterThan(0);
    expect(osloFylke.some((r) => r.value !== null && r.value > 1000)).toBe(true);
  });

  it("includes an ordinary kommune row (Eigersund, 4-digit, no bydel split)", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101");
    expect(eigersund.length).toBeGreaterThan(0);
    expect(eigersund.some((r) => r.value !== null)).toBe(true);
  });

  it("includes Oslo's bydel rows (6-digit, Oslo-shaped block: rollup AFTER children, no 'i alt')", () => {
    const gamleOslo = rows.filter((r) => r.region_code === "030101");
    expect(gamleOslo.length).toBeGreaterThan(0);
  });

  it("includes Stavanger's bydel rows (6-digit, Stavanger-shaped block: rollup BEFORE children, 'i alt')", () => {
    const hundvag = rows.filter((r) => r.region_code === "110301");
    expect(hundvag.length).toBeGreaterThan(0);
  });

  it("includes the all-suppressed Oslo kommune rollup (0301) with every value null", () => {
    const osloKommune = rows.filter((r) => r.region_code === "0301");
    expect(osloKommune.length).toBeGreaterThan(0);
    expect(osloKommune.every((r) => r.value === null)).toBe(true);
    // values_json itself still has month keys, just all-null — represent, don't drop.
    expect(Object.keys(osloKommune[0]!.values_json as object).length).toBeGreaterThan(0);
  });

  it("does not emit a row for a fylke section-header with no data (e.g. a bare 'Rogaland' label alone)", () => {
    // Every emitted row must have come from a row with at least one data cell;
    // this is an indirect check that header-only rows didn't leak through as
    // all-null rows under a plausible-looking 2-digit code for a kind of
    // region that never appears as a floating header-only duplicate.
    const byRegion = new Map<string, number>();
    for (const r of rows) byRegion.set(r.region_code, (byRegion.get(r.region_code) ?? 0) + 1);
    // Fylke totals appear once per month, not duplicated by a phantom header row.
    const months = new Set(rows.map((r) => r.month)).size;
    expect(byRegion.get("11")).toBe(months);
  });
});

describe("parseSheet — real fixture, Kommune-bydel. Andel", () => {
  const wb = loadFixtureWorkbook();
  const rows = parseSheet(wb, "Kommune-bydel. Andel", "andel");

  it("every row is tagged category_format andel", () => {
    expect(rows.length).toBeGreaterThan(1000);
    expect(rows.every((r) => r.category_format === "andel")).toBe(true);
  });

  it("values are plausible percentages for an ordinary kommune (not all null, not integers only)", () => {
    const eigersund = rows.filter((r) => r.region_code === "1101" && r.value !== null);
    expect(eigersund.length).toBeGreaterThan(0);
    expect(eigersund.every((r) => r.value! > 0 && r.value! < 100)).toBe(true);
  });
});

describe("parseSheet — error handling", () => {
  it("throws a clear error for a sheet name that doesn't exist", () => {
    const wb = loadFixtureWorkbook();
    expect(() => parseSheet(wb, "Does Not Exist", "antall")).toThrow(/missing sheet/);
  });
});
