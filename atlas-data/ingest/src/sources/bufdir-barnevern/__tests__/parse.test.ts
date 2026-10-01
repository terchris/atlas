import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  basenameOnly,
  discoverZipUrl,
  isStandardIndicatorWorkbook,
  parseCell,
  parseWorkbookSheet,
  slugFromIndicatorName,
  surrogateIndicatorApiId,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_1A = "1A_andel_ant_barn_tiltak_ilaaret_ialt_0_17.xlsx";
const FIXTURE_TURNOVER = "Turnover_kommunalt barnevern_2016-2024.xlsx";

function loadFixture(name: string): Buffer {
  return readFileSync(resolve(here, "fixtures", name));
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverZipUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverZipUrl — multi-tier ZIP URL extraction", () => {
  it("matches the canonical Bufdir shape (today's production URL)", () => {
    const html = `<a href="https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/Kommunemonitor_barnevern_2026_09_04_cedc894149.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/Kommunemonitor_barnevern_2026_09_04_cedc894149.zip",
      matchTier: "canonical",
    });
  });

  it('falls back to "loose-date-format" if the date separator changes (YYYY-MM-DD)', () => {
    const html = `<a href="https://cdn.bufdir.no/uploads/kommunemonitor_barnevern-2026-01-15-abc123.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://cdn.bufdir.no/uploads/kommunemonitor_barnevern-2026-01-15-abc123.zip",
      matchTier: "loose-date-format",
    });
  });

  it('falls back to "loose-monitor" if the /uploads/ path segment disappears', () => {
    const html = `<a href="https://media.bufdir.no/files/kommunemonitor_barnevern_v3.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://media.bufdir.no/files/kommunemonitor_barnevern_v3.zip",
      matchTier: "loose-monitor",
    });
  });

  it('falls back to "loose-bare" if the "kommunemonitor_" prefix disappears', () => {
    const html = `<a href="https://example.com/data/barnevern_2026.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://example.com/data/barnevern_2026.zip",
      matchTier: "loose-bare",
    });
  });

  it("throws with a diagnostic when no zip URL is found", () => {
    const html = `<html><body>No relevant link here</body></html>`;
    expect(() => discoverZipUrl(html)).toThrow(/Could not find any barnevern .zip URL/);
  });

  it("prefers the canonical tier when both canonical and looser URLs are present", () => {
    const html = `
      <a href="https://example.com/data/barnevern_old.zip">Old</a>
      <a href="https://cdn.example.com/uploads/Kommunemonitor_barnevern_2026_09_04_abc.zip">New</a>
    `;
    const got = discoverZipUrl(html);
    expect(got.matchTier).toBe("canonical");
    expect(got.url).toContain("2026_09_04_abc.zip");
  });

  it("refuses to guess when multiple unnamed ZIPs are found and none matches", () => {
    const html = `
      <a href="https://cdn.example.com/uploads/a.zip">A</a>
      <a href="https://cdn.example.com/uploads/b.zip">B</a>
    `;
    expect(() => discoverZipUrl(html)).toThrow(/none names barnevern/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isStandardIndicatorWorkbook — the filter that excludes the non-conforming file
// ─────────────────────────────────────────────────────────────────────────────

describe("isStandardIndicatorWorkbook", () => {
  it("accepts alphanumeric-code filenames", () => {
    expect(isStandardIndicatorWorkbook("1A_andel_ant_barn_tiltak_ilaaret_ialt_0_17.xlsx")).toBe(true);
    expect(isStandardIndicatorWorkbook("3M_turnover_saksbehandlere.xlsx")).toBe(true);
    expect(isStandardIndicatorWorkbook("4F_barn_med_bekymringsmelding_ift_barnebefolkningen.xlsx")).toBe(true);
  });

  it("rejects the one non-conforming filename in the live bundle", () => {
    expect(isStandardIndicatorWorkbook("Turnover_kommunalt barnevern_2016-2024.xlsx")).toBe(false);
  });

  it("rejects a bare numeric prefix with no letter suffix", () => {
    expect(isStandardIndicatorWorkbook("12_something.xlsx")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell — Norwegian decimal + suppression handling (identical to sibling)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("returns null for blanks and the SSB suppression markers (.. and .)", () => {
    expect(parseCell("", "antall")).toBeNull();
    expect(parseCell(null, "antall")).toBeNull();
    expect(parseCell("..", "antall")).toBeNull();
    expect(parseCell(".", "andel")).toBeNull();
  });

  it("parses Norwegian-decimal andel cells (Barnevern's own vocabulary, not the sibling's prosent)", () => {
    expect(parseCell("9,2", "andel")).toBeCloseTo(9.2);
    expect(parseCell("  12,5 ", "andel")).toBeCloseTo(12.5);
  });

  it("andel is not limited to 0-100 — e.g. kroner-per-child figures use it too", () => {
    expect(parseCell("17689,64", "andel")).toBeCloseTo(17689.64);
  });

  it("parses antall cells as integers", () => {
    expect(parseCell("42", "antall")).toBe(42);
    expect(parseCell(42, "antall")).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// surrogateIndicatorApiId
// ─────────────────────────────────────────────────────────────────────────────

describe("surrogateIndicatorApiId", () => {
  it("derives a code-prefix id from a standard filename stem", () => {
    expect(surrogateIndicatorApiId("1A_andel_ant_barn_tiltak_ialt_0_17")).toEqual({
      id: "bv_zip_ind_1a",
      tier: "code-prefix",
    });
    expect(surrogateIndicatorApiId("3M_turnover_saksbehandlere")).toEqual({
      id: "bv_zip_ind_3m",
      tier: "code-prefix",
    });
  });

  it("falls back to a hash for a non-conforming stem", () => {
    const got = surrogateIndicatorApiId("Turnover_kommunalt barnevern_2016-2024");
    expect(got.tier).toBe("hash-fallback");
    expect(got.id).toMatch(/^bv_zip_[0-9a-f]{24}$/);
  });

  it("uses a bv_ prefix, distinct from the sibling source's bf_ prefix", () => {
    expect(surrogateIndicatorApiId("1A_x").id.startsWith("bv_")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// slugFromIndicatorName / basenameOnly — generic helpers, same as sibling
// ─────────────────────────────────────────────────────────────────────────────

describe("slugFromIndicatorName", () => {
  it("lowercases, underscores spaces, strips punctuation", () => {
    expect(slugFromIndicatorName("Andel barn i hush, tiltak")).toBe("andel_barn_i_hush_tiltak");
  });
});

describe("basenameOnly", () => {
  it("strips any leading path", () => {
    expect(basenameOnly("some/dir/1A_file.xlsx")).toBe("1A_file.xlsx");
    expect(basenameOnly("1A_file.xlsx")).toBe("1A_file.xlsx");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseWorkbookSheet — end-to-end against real fixture workbooks
// ─────────────────────────────────────────────────────────────────────────────

describe("parseWorkbookSheet — real fixture, standard shape", () => {
  const bytes = loadFixture(FIXTURE_1A);
  const rows = parseWorkbookSheet(bytes, FIXTURE_1A);

  it("produces rows with the bv_zip_ind_1a surrogate id", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.indicator_api_id === "bv_zip_ind_1a")).toBe(true);
  });

  it("has no category_unit field at all (Barnevern has no Enhet column)", () => {
    expect(rows[0]).not.toHaveProperty("category_unit");
  });

  it("only emits antall/andel category_format values", () => {
    const formats = new Set(rows.map((r) => r.category_format));
    for (const f of formats) {
      expect(["antall", "andel"]).toContain(f);
    }
  });

  it("includes andel rows, not just antall — this fixture has both and earlier drafts silently dropped the andel half", () => {
    const formats = new Set(rows.map((r) => r.category_format));
    expect(formats).toContain("andel");
    expect(formats).toContain("antall");
  });

  it("parses plausible years (>= 1990, <= 2100) matching the observed 2015-2025 span", () => {
    const years = new Set(rows.map((r) => r.year));
    for (const y of years) {
      expect(y).toBeGreaterThanOrEqual(2000);
      expect(y).toBeLessThanOrEqual(2030);
    }
  });

  it("every row carries a non-empty region_code", () => {
    expect(rows.every((r) => r.region_code.length > 0)).toBe(true);
  });

  it("values_json carries the full year set for its region/format slice", () => {
    const years = new Set(rows.map((r) => r.year));
    expect(Object.keys(rows[0]!.values_json as object).length).toBe(years.size);
  });
});

describe("parseWorkbookSheet — refuses the non-conforming Turnover workbook", () => {
  it("throws rather than silently parsing the wrong layout (no Sheet1-shaped header)", () => {
    const bytes = loadFixture(FIXTURE_TURNOVER);
    // In production this file is filtered out by isStandardIndicatorWorkbook
    // before parseWorkbookSheet ever sees it (see index.ts). This test proves
    // that invariant isn't silently relying on luck — if someone removed the
    // filter, parsing would fail loudly, not produce quietly-wrong rows.
    expect(() => parseWorkbookSheet(bytes, FIXTURE_TURNOVER)).toThrow();
  });
});
