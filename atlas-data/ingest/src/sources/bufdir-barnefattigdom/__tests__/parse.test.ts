import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  basenameOnly,
  discoverZipUrl,
  parseCell,
  parseDataSheet,
  slugFromIndicatorName,
  surrogateIndicatorApiId,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_17 =
  "Indikator_17_barn_0-5_i_hush_som_leier_bolig_kun_pers.xlsx";
const FIXTURE_4 =
  "Indikator_4_barn_i_hush_mottat_sosialhjelp_ila_året.xlsx";

function loadFixture(name: string): Buffer {
  return readFileSync(resolve(here, "fixtures", name));
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverZipUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverZipUrl — multi-tier ZIP URL extraction", () => {
  it("matches the canonical Bufdir shape (today's production URL)", () => {
    const html = `<a href="https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/2025_07_31_barnefattigdom_monitor_e7fc16129b.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://ca-statistikk-strapi-prod.whitesea-89be7839.norwayeast.azurecontainerapps.io/uploads/2025_07_31_barnefattigdom_monitor_e7fc16129b.zip",
      matchTier: "canonical",
    });
  });

  it('falls back to "loose-date-format" if the date separator changes (YYYY-MM-DD)', () => {
    const html = `<a href="https://cdn.bufdir.no/uploads/2026-01-15_barnefattigdom_monitor_abc123.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://cdn.bufdir.no/uploads/2026-01-15_barnefattigdom_monitor_abc123.zip",
      matchTier: "loose-date-format",
    });
  });

  it('falls back to "loose-monitor" if the date prefix is dropped entirely', () => {
    const html = `<a href="https://media.bufdir.no/files/barnefattigdom_monitor_v3.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://media.bufdir.no/files/barnefattigdom_monitor_v3.zip",
      matchTier: "loose-monitor",
    });
  });

  it('falls back to "loose-bare" if "_monitor" segment disappears', () => {
    const html = `<a href="https://example.com/data/barnefattigdom_2026.zip">Last ned</a>`;
    expect(discoverZipUrl(html)).toEqual({
      url: "https://example.com/data/barnefattigdom_2026.zip",
      matchTier: "loose-bare",
    });
  });

  it("throws with a diagnostic when no zip URL is found", () => {
    const html = `<html><body>No relevant link here</body></html>`;
    expect(() => discoverZipUrl(html)).toThrow(/Could not find any barnefattigdom .zip URL/);
  });

  it("prefers the canonical tier when both canonical and looser URLs are present", () => {
    const html = `
      <a href="https://example.com/data/barnefattigdom_old.zip">Old</a>
      <a href="https://cdn.example.com/uploads/2025_07_31_barnefattigdom_monitor_abc.zip">New</a>
    `;
    const got = discoverZipUrl(html);
    expect(got.matchTier).toBe("canonical");
    expect(got.url).toContain("monitor_abc.zip");
  });

  it("matches an https URL on a quoted attribute (typical anchor)", () => {
    const html = `<a class="download" href='https://cdn.example/uploads/2025_07_31_barnefattigdom_monitor_z.zip'>Hent ZIP</a>`;
    expect(discoverZipUrl(html).matchTier).toBe("canonical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell — Norwegian decimal + suppression handling
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("returns null for blanks and the SSB suppression markers (.. and .)", () => {
    expect(parseCell("", "antall")).toBeNull();
    expect(parseCell(null, "antall")).toBeNull();
    expect(parseCell(undefined, "antall")).toBeNull();
    expect(parseCell("..", "antall")).toBeNull();
    expect(parseCell(".", "antall")).toBeNull();
    expect(parseCell("..", "prosent")).toBeNull();
  });

  it('parses Norwegian-formatted percent values ("   17,7" → 17.7)', () => {
    expect(parseCell("   17,7", "prosent")).toBe(17.7);
    expect(parseCell("9,2", "prosent")).toBe(9.2);
    expect(parseCell("  100,0", "prosent")).toBe(100);
  });

  it("parses integer counts (antall)", () => {
    expect(parseCell("64465", "antall")).toBe(64465);
    expect(parseCell(" 12 ", "antall")).toBe(12);
    expect(parseCell(64465, "antall")).toBe(64465); // numeric input passthrough
  });

  it("returns the numeric value verbatim when xlsx already typed the cell as a number", () => {
    expect(parseCell(17.7, "prosent")).toBe(17.7);
    expect(parseCell(0, "antall")).toBe(0);
  });

  it("returns null for non-numeric strings (defensive)", () => {
    expect(parseCell("not a number", "antall")).toBeNull();
    expect(parseCell("--", "antall")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// surrogate id + slug + basename helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("surrogateIndicatorApiId", () => {
  it("returns a stable bf_zip_<24 hex chars> id from the workbook stem", () => {
    const id = surrogateIndicatorApiId("Indikator_17_barn_0-5_i_hush_som_leier_bolig_kun_pers");
    expect(id).toMatch(/^bf_zip_[0-9a-f]{24}$/);
  });

  it("is deterministic across calls (same stem → same id)", () => {
    const stem = "Indikator_4_barn_i_hush_mottat_sosialhjelp_ila_året";
    expect(surrogateIndicatorApiId(stem)).toBe(surrogateIndicatorApiId(stem));
  });

  it("changes when the stem changes (warning bell on workbook rename)", () => {
    const a = surrogateIndicatorApiId("Indikator_5_old");
    const b = surrogateIndicatorApiId("Indikator_5b_new");
    expect(a).not.toBe(b);
  });
});

describe("slugFromIndicatorName", () => {
  it("lowercases and replaces whitespace with underscores", () => {
    expect(slugFromIndicatorName("Barn 0-5 i husholdninger")).toBe("barn_0-5_i_husholdninger");
  });

  it("strips punctuation that would break URL slugs", () => {
    expect(slugFromIndicatorName("husholdning, lavinntekt (eu-skala)")).toBe(
      "husholdning_lavinntekt_eu-skala_",
    );
  });
});

describe("basenameOnly", () => {
  it("strips path prefixes from forward-slash entries", () => {
    expect(basenameOnly("uploads/2025/Indikator_4_x.xlsx")).toBe("Indikator_4_x.xlsx");
  });

  it("handles backslash-style paths (defensive — Windows zips)", () => {
    expect(basenameOnly("uploads\\2025\\Indikator_4_x.xlsx")).toBe("Indikator_4_x.xlsx");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseDataSheet — golden-file tests against real Bufdir workbooks
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDataSheet (golden file: Indikator_17 — barn 0-5 leier bolig)", () => {
  const buf = loadFixture(FIXTURE_17);
  const rows = parseDataSheet(buf, FIXTURE_17);

  it("emits the expected indicator metadata on every row", () => {
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0]!;
    expect(first.indicator_api_id).toMatch(/^bf_zip_[0-9a-f]{24}$/);
    expect(first.indicator_group_slug).toBe("barnefattigdom_zip");
    expect(first.indicator_title).toMatch(/^Tab\. 17:.*Barn 0-5 år.*leier bolig/);
    expect(first.indicator_name).toBe(first.indicator_title); // workbook has no separate name row
    expect(first.link_text).toBeNull();
    expect(first.indicator_slug).toMatch(/^barn_0-5/);
  });

  it("emits one row per (region × unit × format × year) tuple", () => {
    // 8 year columns (2017..2024) — verified by inspecting the fixture
    const yearsForOslo = rows.filter(
      (r) =>
        r.region_code === "0301" &&
        r.category_unit === "barn" &&
        r.category_format === "antall",
    );
    expect(yearsForOslo).toHaveLength(8);
    expect(new Set(yearsForOslo.map((r) => r.year))).toEqual(
      new Set([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]),
    );
  });

  it("parses a national antall cell verbatim (Norge 2017 barn antall = 64465)", () => {
    const cell = rows.find(
      (r) =>
        r.region_code === "0" &&
        r.category_unit === "barn" &&
        r.category_format === "antall" &&
        r.year === 2017,
    );
    expect(cell?.value).toBe(64465);
  });

  it('parses a Norwegian-formatted prosent cell (Norge 2017 barn prosent = "17,7" → 17.7)', () => {
    const cell = rows.find(
      (r) =>
        r.region_code === "0" &&
        r.category_unit === "barn" &&
        r.category_format === "prosent" &&
        r.year === 2017,
    );
    expect(cell?.value).toBe(17.7);
  });

  it("emits barn × {antall, prosent} combinations (Indikator_17 is 'Kun personer' — no husholdning rows)", () => {
    const combos = new Set(
      rows.map((r) => `${r.category_unit}|${r.category_format}`),
    );
    expect(combos).toEqual(new Set(["barn|antall", "barn|prosent"]));
  });

  it("populates values_json as the year→value map, identical for every year row of the same (region, unit, format) slice", () => {
    const sliceForOsloBarnAntall = rows.filter(
      (r) =>
        r.region_code === "0301" &&
        r.category_unit === "barn" &&
        r.category_format === "antall",
    );
    // values_json is the same object content for all 8 year rows of this slice
    const yearsInJson = Object.keys(
      sliceForOsloBarnAntall[0]!.values_json as Record<string, unknown>,
    ).sort();
    expect(yearsInJson).toEqual([
      "2017",
      "2018",
      "2019",
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
    ]);
  });
});

describe("parseDataSheet (golden file: Indikator_4 — sosialhjelp; tests suppression)", () => {
  const buf = loadFixture(FIXTURE_4);
  const rows = parseDataSheet(buf, FIXTURE_4);

  it("preserves sub-kommune (bydel/delbydel) region codes verbatim — they appear in the same column as kommune codes", () => {
    // Bispevika is delbydel 03010109 (8 digits)
    const subKommuneRows = rows.filter((r) => r.region_code === "03010109");
    expect(subKommuneRows.length).toBeGreaterThan(0);
  });

  it("maps SSB-style suppression markers (..) to null in both `value` and `values_json`", () => {
    // Fixture year range is 2013..2023; Bispevika barn antall row begins
    // with [.., 12, .., 13, 18, 14, 24, 18, 17, 18, 19] so 2013 and 2015 are
    // suppressed, 2014 and 2016+ are populated.
    const cell2013 = rows.find(
      (r) =>
        r.region_code === "03010109" &&
        r.category_unit === "barn" &&
        r.category_format === "antall" &&
        r.year === 2013,
    );
    expect(cell2013?.value).toBeNull();
    const jsonFor2013 = cell2013?.values_json as Record<string, number | null>;
    expect(jsonFor2013["2013"]).toBeNull();
    expect(jsonFor2013["2015"]).toBeNull();
    // 2014 is populated (= 12) — pinned non-suppressed year:
    expect(jsonFor2013["2014"]).toBe(12);
    expect(jsonFor2013["2023"]).toBe(19);
  });

  it("emits rows at every region level present in the workbook (national, fylke, kommune, bydel, delbydel)", () => {
    const lengths = new Set(rows.map((r) => r.region_code.length));
    // Real fixture has rows at 1 (Norge=0), 2 (fylke=03), 4 (kommune=0301), 6 (bydel=030101), 8 (delbydel=03010109)
    expect(lengths.has(1)).toBe(true);
    expect(lengths.has(2)).toBe(true);
    expect(lengths.has(4)).toBe(true);
    expect(lengths.has(6)).toBe(true);
    expect(lengths.has(8)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseDataSheet — error paths
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDataSheet (error paths)", () => {
  it("throws when the workbook has no Data sheet", () => {
    // Build a synthetic workbook with the wrong sheet name
    // (we use the xlsx lib directly to avoid a separate fixture)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Region"]]);
    XLSX.utils.book_append_sheet(wb, ws, "WrongSheetName");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => parseDataSheet(buf, "Indikator_99_test.xlsx")).toThrow(
      /missing Data sheet/,
    );
  });
});
