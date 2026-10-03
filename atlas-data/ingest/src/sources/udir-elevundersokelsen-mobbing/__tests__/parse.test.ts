import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAvailableYears,
  parseCell,
  parseMobbingData,
  parseRapportside,
  parseRegionNodes,
} from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, "fixtures", name), "utf-8"));
}

// ─────────────────────────────────────────────────────────────────────────────
// parseRapportside
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRapportside — real GSK_EUG_mobbing fixture", () => {
  it("resolves the live EUG basePath and default year, not the retired ElevundersoekelsenG one", () => {
    const { basePath, defaultYearCode } = parseRapportside(loadFixture("rapportside.json"));
    expect(basePath).toBe("rest/v1/Statistikk/GSK/EUG/5/5");
    expect(defaultYearCode).toBeGreaterThanOrEqual(202512);
  });

  it("throws when rapportElementer is missing", () => {
    expect(() => parseRapportside({ rappside: {} })).toThrow(/rapportElementer/);
  });

  it("throws when dataEndepunkt doesn't end in /data", () => {
    expect(() =>
      parseRapportside({
        rappside: { rapportElementer: [{ dataEndepunkt: "rest/v1/Statistikk/GSK/EUG/5/5/filterVerdier" }] },
      }),
    ).toThrow(/did not end in/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAvailableYears
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAvailableYears — real filterVerdier fixture", () => {
  const years = parseAvailableYears(loadFixture("filterVerdier.json"));

  it("discovers all 5 live school years, sorted ascending", () => {
    expect(years).toEqual([202112, 202212, 202312, 202412, 202512]);
  });

  it("the latest year is 2025-26 (202512)", () => {
    expect(years[years.length - 1]).toBe(202512);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRegionNodes
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRegionNodes — real filterVerdier fixture", () => {
  const nodes = parseRegionNodes(loadFixture("filterVerdier.json"));

  it("finds exactly 351 nivaa-3 (kommune-equivalent) nodes — fewer than other kommune-grain sources", () => {
    expect(nodes.length).toBe(351);
  });

  it("includes Arendal with its real internal EnhetID", () => {
    const arendal = nodes.find((n) => n.kode === "4203");
    expect(arendal).toBeDefined();
    expect(arendal?.id).toBe(-720);
    expect(arendal?.navn).toBe("Arendal");
  });

  it("includes the Svalbard pseudo-kommune (2100), same tree depth as udir-gsi's own finding", () => {
    const svalbard = nodes.find((n) => n.kode === "2100");
    expect(svalbard).toBeDefined();
    expect(svalbard?.navn).toBe("Svalbard");
  });

  it("includes the Utlandet, uspesifisert sentinel (2599) — a new finding, not present in udir-gsi", () => {
    const utlandet = nodes.find((n) => n.kode === "2599");
    expect(utlandet).toBeDefined();
    expect(utlandet?.navn).toBe("Utlandet, uspesifisert");
  });

  it("does not include fylke-level (nivaa 2) or school-level (nivaa 4) nodes", () => {
    expect(nodes.some((n) => n.navn === "Agder")).toBe(false);
    expect(nodes.some((n) => n.kode === "990334021")).toBe(false); // a real school org number
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

  it("parses a plain percentage with a Norwegian decimal comma", () => {
    expect(parseCell("12,2")).toBeCloseTo(12.2);
    expect(parseCell("0,0")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseMobbingData — real per-region fixtures
// ─────────────────────────────────────────────────────────────────────────────

describe("parseMobbingData — Arendal, 10th grade, real fixture", () => {
  const rows = parseMobbingData(loadFixture("data.arendal.10.json"), "4203", 10, 202512);

  it("produces exactly 4 rows: the composite indicator + 3 questions", () => {
    expect(rows).toHaveLength(4);
  });

  it("matches the real indicator value exactly", () => {
    const indicator = rows.find((r) => r.measure === "EUIndeks_1398");
    expect(indicator?.measure_label).toBe("Mobbing på skolen");
    expect(indicator?.value).toBeCloseTo(12.2);
  });

  it("carries the stable question codes, not just free text", () => {
    expect(rows.map((r) => r.measure).sort()).toEqual(
      ["EUIndeks_1398", "EUSpoersmaal_Q11811", "EUSpoersmaal_Q11816", "EUSpoersmaal_Q11824"].sort(),
    );
  });

  it("every row carries the requested region/grade/year", () => {
    for (const r of rows) {
      expect(r.region_code).toBe("4203");
      expect(r.grade).toBe(10);
      expect(r.year).toBe(202512);
    }
  });
});

describe("parseMobbingData — Arendal, 7th grade, real fixture", () => {
  const rows = parseMobbingData(loadFixture("data.arendal.7.json"), "4203", 7, 202512);

  it("matches the real 7th-grade indicator value, distinct from 10th grade's", () => {
    const indicator = rows.find((r) => r.measure === "EUIndeks_1398");
    expect(indicator?.value).toBeCloseTo(15.8);
  });
});

describe("parseMobbingData — Bykle (Norway's smallest kommune), real suppressed fixture", () => {
  const rows = parseMobbingData(loadFixture("data.bykle.10.json"), "4222", 10, 202512);

  it("represents suppression as null on some rows while others report real zero values", () => {
    expect(rows).toHaveLength(4);
    const indicator = rows.find((r) => r.measure === "EUIndeks_1398");
    expect(indicator?.value).toBeNull();
    const digital = rows.find((r) => r.measure === "EUSpoersmaal_Q11816");
    expect(digital?.value).toBe(0);
  });
});

describe("parseMobbingData — Utlandet, uspesifisert (2599), a new sentinel not in udir-gsi", () => {
  const rows = parseMobbingData(loadFixture("data.utlandet.10.json"), "2599", 10, 202512);

  it("is a real, data-bearing region, not empty", () => {
    expect(rows).toHaveLength(4);
    const indicator = rows.find((r) => r.measure === "EUIndeks_1398");
    expect(indicator?.value).toBeCloseTo(12.8);
  });
});

describe("parseMobbingData — Svalbard (2100), fully suppressed in this fixture", () => {
  const rows = parseMobbingData(loadFixture("data.svalbard.10.json"), "2100", 10, 202512);

  it("represents every measure as suppressed, not dropped", () => {
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.value === null)).toBe(true);
  });
});

describe("parseMobbingData — Hægebostad (4226), a kommune with no 10th-grade cohort at all", () => {
  it("returns zero rows, not an error, for a genuinely empty response (distinct from suppression)", () => {
    const rows = parseMobbingData(loadFixture("data.hagebostad.10.json"), "4226", 10, 202512);
    expect(rows).toEqual([]);
  });
});

describe("parseMobbingData — error handling", () => {
  it("throws when the grade column is missing (TrinnID silently resolved wrong)", () => {
    const arendal10 = loadFixture("data.arendal.10.json");
    expect(() => parseMobbingData(arendal10, "4203", 7, 202512)).toThrow(/does not carry the expected/);
  });

  it("throws for an unknown grade", () => {
    expect(() => parseMobbingData(loadFixture("data.arendal.10.json"), "4203", 8, 202512)).toThrow(
      /unknown grade/,
    );
  });
});
