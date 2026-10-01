import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverYearPages, parseCell, parseKommuneTables } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(resolve(here, "fixtures", name), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverYearPages — real hub page fixture
// ─────────────────────────────────────────────────────────────────────────────

describe("discoverYearPages — real hub.html fixture", () => {
  const years = discoverYearPages(loadFixture("hub.html"));

  it("finds every year currently linked, sorted ascending", () => {
    expect(years.map((y) => y.year)).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it("builds the canonical path for each year", () => {
    const y2022 = years.find((y) => y.year === 2022);
    expect(y2022?.path).toBe("/bosetting/bosettingstall/nokkeltall-bosetting-2022/");
  });

  it("throws a clear error when no year links are present", () => {
    expect(() => discoverYearPages("<html><body>nothing here</body></html>")).toThrow(
      /Could not find any/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("treats IMDi's own suppression marker (:) as null", () => {
    expect(parseCell(":")).toBeNull();
    expect(parseCell("")).toBeNull();
    expect(parseCell("   ")).toBeNull();
  });

  it("parses a plain integer string", () => {
    expect(parseCell("2000")).toBe(2000);
  });

  it("strips embedded whitespace (thousands grouping) before parsing", () => {
    expect(parseCell("1 924")).toBe(1924);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseKommuneTables — real fixture, 2022 (pre-2024 fylke-reform era)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseKommuneTables — real fixture, 2022", () => {
  const rows = parseKommuneTables(loadFixture("nokkeltall-bosetting-2022.html"), 2022);

  it("produces 4 metric rows per kommune row across every fylke table", () => {
    // 11 fylke tables, 356 total <tbody> rows confirmed live on this fixture.
    expect(rows.length).toBe(356 * 4);
  });

  it("every row carries year 2022 and one of the four known metrics", () => {
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([2022]));
    expect(new Set(rows.map((r) => r.metric))).toEqual(
      new Set(["anmodet", "vedtatt", "bosatte", "bosatte_kollektiv_beskyttelse"]),
    );
  });

  it("matches Oslo's real, unsuppressed 2022 figures exactly", () => {
    const oslo = rows.filter((r) => r.kommune_name === "Oslo");
    expect(oslo).toHaveLength(4);
    const byMetric = Object.fromEntries(oslo.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      anmodet: 2000,
      vedtatt: 2000,
      bosatte: 1924,
      bosatte_kollektiv_beskyttelse: 1616,
    });
  });

  it("represents IMDi's own suppression as a null value, not a dropped row (Farsund 2022)", () => {
    const farsund = rows.filter((r) => r.kommune_name === "Farsund");
    expect(farsund).toHaveLength(4);
    const byMetric = Object.fromEntries(farsund.map((r) => [r.metric, r.value]));
    expect(byMetric.bosatte_kollektiv_beskyttelse).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseKommuneTables — real fixture, 2025 (post-2024 fylke-reform era, has suppression)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseKommuneTables — real fixture, 2025", () => {
  const rows = parseKommuneTables(loadFixture("nokkeltall-bosetting-2025.html"), 2025);

  it("produces 4 metric rows per kommune row across every fylke table", () => {
    // 15 fylke tables, 357 total <tbody> rows confirmed live on this fixture —
    // the post-reform page splits fylker differently from 2022, which is exactly
    // why fylke itself is never captured as a column (see parse.ts header comment).
    expect(rows.length).toBe(357 * 4);
  });

  it("matches Oslo's real, unsuppressed 2025 figures exactly", () => {
    const oslo = rows.filter((r) => r.kommune_name === "Oslo");
    expect(oslo).toHaveLength(4);
    const byMetric = Object.fromEntries(oslo.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      anmodet: 640,
      vedtatt: 850,
      bosatte: 665,
      bosatte_kollektiv_beskyttelse: 506,
    });
  });

  it("represents IMDi's own suppression as a null value, not a dropped row (Alvdal 2025)", () => {
    const alvdal = rows.filter((r) => r.kommune_name === "Alvdal");
    expect(alvdal).toHaveLength(4);
    const byMetric = Object.fromEntries(alvdal.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      anmodet: 15,
      vedtatt: 20,
      bosatte: 15,
      bosatte_kollektiv_beskyttelse: null,
    });
  });

  it("some rows are suppressed in 2025, confirming the ':' marker is exercised by this fixture", () => {
    expect(rows.some((r) => r.value === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseKommuneTables — real fixture, 2024 (Oslo-only pilot of 2 extra "avtalt" columns)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseKommuneTables — real fixture, 2024 (header-driven column count)", () => {
  const rows = parseKommuneTables(loadFixture("nokkeltall-bosetting-2024.html"), 2024);

  it("produces 1430 rows total — every fylke emits 4 metrics per kommune except Oslo's lone row, which emits 6", () => {
    // Confirmed live 2026-10-01: Oslo's is the only 2024 fylke table with the
    // 2 extra "avtalt" columns — see parse.ts's HEADER_TO_METRIC comment.
    expect(rows.length).toBe(1430);
  });

  it("emits Oslo's 2 extra 'avtalt' metrics on top of the standard 4, matching its real figures exactly", () => {
    const oslo = rows.filter((r) => r.kommune_name === "Oslo");
    expect(oslo).toHaveLength(6);
    const byMetric = Object.fromEntries(oslo.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      anmodet: 1650,
      vedtatt: 1648,
      bosatte: 1539,
      bosatte_kollektiv_beskyttelse: 1203,
      avtalt: 105,
      avtalt_kollektiv_beskyttelse: 67,
    });
  });

  it("every other kommune still emits exactly the standard 4 metrics, none of the 'avtalt' pair", () => {
    const eigersund = rows.filter((r) => r.kommune_name === "Eigersund");
    expect(eigersund).toHaveLength(4);
    expect(new Set(eigersund.map((r) => r.metric))).toEqual(
      new Set(["anmodet", "vedtatt", "bosatte", "bosatte_kollektiv_beskyttelse"]),
    );
  });

  it("parses a free-text non-numeric cell ('avventer vedtak', not the ':' marker) as null (Moskenes 2024)", () => {
    const moskenes = rows.filter((r) => r.kommune_name === "Moskenes");
    expect(moskenes).toHaveLength(4);
    const byMetric = Object.fromEntries(moskenes.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({ anmodet: 0, vedtatt: null, bosatte: 0, bosatte_kollektiv_beskyttelse: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseKommuneTables — real fixture, 2026 (current year — every table has all 6 metrics)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseKommuneTables — real fixture, 2026 (the 'avtalt' pair rolled out everywhere)", () => {
  const rows = parseKommuneTables(loadFixture("nokkeltall-bosetting-2026.html"), 2026);

  it("every kommune row emits all 6 metrics, confirming the rollout is complete, not Oslo-only like 2024", () => {
    expect(new Set(rows.map((r) => r.metric))).toEqual(
      new Set([
        "anmodet",
        "vedtatt",
        "bosatte",
        "bosatte_kollektiv_beskyttelse",
        "avtalt",
        "avtalt_kollektiv_beskyttelse",
      ]),
    );
  });

  it("matches Arendal's real 2026 figures exactly, including a suppressed 'avtalt_kollektiv_beskyttelse' cell", () => {
    const arendal = rows.filter((r) => r.kommune_name === "Arendal");
    expect(arendal).toHaveLength(6);
    const byMetric = Object.fromEntries(arendal.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      anmodet: 105,
      vedtatt: 85,
      bosatte: 67,
      bosatte_kollektiv_beskyttelse: 57,
      avtalt: 11,
      avtalt_kollektiv_beskyttelse: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseKommuneTables — error handling
// ─────────────────────────────────────────────────────────────────────────────

describe("parseKommuneTables — error handling", () => {
  it("throws a clear error when the year heading is not found", () => {
    expect(() => parseKommuneTables("<html><body>nothing here</body></html>", 2022)).toThrow(
      /No "Oversikt over bosettingen i kommunene i 2022" heading found/,
    );
  });

  it("throws when the heading exists but a year that was never on the page is requested", () => {
    expect(() => parseKommuneTables(loadFixture("nokkeltall-bosetting-2022.html"), 1999)).toThrow(
      /No "Oversikt over bosettingen i kommunene i 1999" heading found/,
    );
  });

  it("throws on an unrecognized header rather than silently dropping or misaligning a column", () => {
    const html = `
      <h2>Oversikt over bosettingen i kommunene i 2030</h2>
      <h3>Oslo</h3>
      <table>
        <thead><tr><th>Kommune</th><th>Some new metric IMDi added:</th></tr></thead>
        <tbody><tr><td>Oslo</td><td>5</td></tr></tbody>
      </table>
    `;
    expect(() => parseKommuneTables(html, 2030)).toThrow(/unrecognized header/);
  });

  it("throws when a table's first header is not 'Kommune'", () => {
    const html = `
      <h2>Oversikt over bosettingen i kommunene i 2030</h2>
      <table>
        <thead><tr><th>Fylke</th><th>Antall bosatte personer:</th></tr></thead>
        <tbody><tr><td>Oslo</td><td>5</td></tr></tbody>
      </table>
    `;
    expect(() => parseKommuneTables(html, 2030)).toThrow(/expected "Kommune"/);
  });
});
