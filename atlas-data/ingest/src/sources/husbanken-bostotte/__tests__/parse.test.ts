import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractMeasureNames, parseCell, parseHypercubeRows } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(): {
  qMeasureInfo: { qFallbackTitle: string }[];
  qDataPages: { qMatrix: { qText: string; qNum: number | string }[][] }[];
} {
  const raw = JSON.parse(readFileSync(resolve(here, "fixtures", "hypercube_sample.json"), "utf8"));
  return raw.qLayout.qHyperCube;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractMeasureNames — real fixture
// ─────────────────────────────────────────────────────────────────────────────

describe("extractMeasureNames — real hypercube_sample.json fixture", () => {
  it("reads the clean qLabel names, in order", () => {
    const { qMeasureInfo } = loadFixture();
    expect(extractMeasureNames(qMeasureInfo)).toEqual([
      "soknad",
      "vedtak",
      "utbetaling",
      "avslag",
      "belop",
    ]);
  });

  it("throws when a measure has no fallback title", () => {
    expect(() => extractMeasureNames([{ qFallbackTitle: "soknad" }, { qFallbackTitle: "" }])).toThrow(
      /unnamed measure/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCell", () => {
  it("parses a plain numeric qNum", () => {
    expect(parseCell({ qText: "5043", qNum: 5043 })).toBe(5043);
  });

  it("treats Qlik's own \"NaN\" qNum as null", () => {
    expect(parseCell({ qText: "-", qNum: "NaN" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHypercubeRows — real fixture, 69 raw matrix rows
// ─────────────────────────────────────────────────────────────────────────────

describe("parseHypercubeRows — real hypercube_sample.json fixture", () => {
  const { qMeasureInfo, qDataPages } = loadFixture();
  const measureNames = extractMeasureNames(qMeasureInfo);
  const rows = parseHypercubeRows(qDataPages, measureNames);

  it("drops every null-year (\"-\") bucket row rather than fabricating a year", () => {
    // 69 raw matrix rows contain 5 null-year rows (one each for 0301, 2111,
    // 5043, 4203, 2100); the remaining 64 real-year rows produce 5 measure
    // rows apiece.
    expect(rows.length).toBe(64 * 5);
    expect(rows.every((r) => Number.isInteger(r.year))).toBe(true);
  });

  it("drops a region entirely when its only row is the null-year bucket (2111)", () => {
    expect(rows.filter((r) => r.region_code === "2111")).toHaveLength(0);
  });

  it("matches Arendal's real 2010 figures exactly", () => {
    const arendal2010 = rows.filter((r) => r.region_code === "4203" && r.year === 2010);
    expect(arendal2010).toHaveLength(5);
    const byMeasure = Object.fromEntries(arendal2010.map((r) => [r.measure, r.value]));
    expect(byMeasure).toEqual({
      soknad: 14733,
      vedtak: 13870,
      utbetaling: 12655,
      avslag: 863,
      belop: 77105035,
    });
  });

  it("matches Røyrvik's real 2024 figures exactly (smallest kommune by volume, no suppression)", () => {
    const royrvik2024 = rows.filter((r) => r.region_code === "5043" && r.year === 2024);
    expect(royrvik2024).toHaveLength(5);
    const byMeasure = Object.fromEntries(royrvik2024.map((r) => [r.measure, r.value]));
    expect(byMeasure).toEqual({
      soknad: 129,
      vedtak: 98,
      utbetaling: 94,
      avslag: 31,
      belop: 843925,
    });
  });

  it("includes Svalbard (2100) verbatim, as real zero values — not filtered here", () => {
    // classify_region_code (dbt layer) is what recognizes 21xx as Svalbard,
    // not a kommune — parse.ts's job is to represent what Husbanken
    // published, not to pre-judge which codes are real kommuner.
    const svalbard2020 = rows.filter((r) => r.region_code === "2100" && r.year === 2020);
    expect(svalbard2020).toHaveLength(5);
    expect(svalbard2020.every((r) => r.value === 0)).toBe(true);
  });

  it("every row carries one of the five known measures", () => {
    expect(new Set(rows.map((r) => r.measure))).toEqual(
      new Set(["soknad", "vedtak", "utbetaling", "avslag", "belop"]),
    );
  });
});

describe("parseHypercubeRows — error handling", () => {
  it("throws when a row's measure-cell count doesn't match the measure list", () => {
    const bad = [
      {
        qMatrix: [
          [
            { qText: "0301", qNum: 301 },
            { qText: "2020", qNum: 2020 },
            { qText: "1", qNum: 1 },
          ],
        ],
      },
    ];
    expect(() => parseHypercubeRows(bad, ["soknad", "vedtak"])).toThrow(/expected 2/);
  });
});
