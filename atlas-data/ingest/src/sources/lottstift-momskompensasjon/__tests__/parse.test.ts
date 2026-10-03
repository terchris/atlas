import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

import { parseOrgnrCell, parseYearRows, YEAR_CONFIGS, type YearConfig } from "../parse.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixtureAoa(filename: string, config: YearConfig): unknown[][] {
  const buf = readFileSync(resolve(here, "fixtures", filename));
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[config.sheetName];
  if (!sheet) throw new Error(`fixture ${filename} missing sheet ${config.sheetName}`);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
}

function configFor(year: number): YearConfig {
  const c = YEAR_CONFIGS.find((c) => c.year === year);
  if (!c) throw new Error(`no YEAR_CONFIGS entry for ${year}`);
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseOrgnrCell
// ─────────────────────────────────────────────────────────────────────────────

describe("parseOrgnrCell", () => {
  it("accepts a 9-digit number cell", () => {
    expect(parseOrgnrCell(971433841)).toBe("971433841");
  });

  it("accepts a 9-digit string cell", () => {
    expect(parseOrgnrCell("971433841")).toBe("971433841");
  });

  it("rejects null, empty, and non-9-digit values", () => {
    expect(parseOrgnrCell(null)).toBeNull();
    expect(parseOrgnrCell("")).toBeNull();
    expect(parseOrgnrCell("12345")).toBeNull();
    expect(parseOrgnrCell("2022/3372")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseYearRows — real fixtures, one per shipped year's own column layout
// ─────────────────────────────────────────────────────────────────────────────

describe("parseYearRows — 2019 (Org.nr. mottakar / Tildelt etter avkorting)", () => {
  const config = configFor(2019);
  const rows = parseYearRows(loadFixtureAoa("moms_2019.xlsx", config), config);

  it("matches a real recipient's real awarded amount exactly", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "811912182");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(56816);
    expect(row!.amount_label).toBe("Tildelt etter avkorting (NOK)");
    expect(row!.year).toBe(2019);
  });
});

describe("parseYearRows — 2020 (Org.nr. søkar / Utbetalt Beløp), a real duplicate-recipient case", () => {
  const config = configFor(2020);
  const rows = parseYearRows(loadFixtureAoa("moms_2020.xlsx", config), config);

  it("sums a recipient's two real 2020 rows (one withdrawn, one finally awarded) into one", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "971433841");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(191699); // Utbetalt Beløp: 0 (Søknad Avbrote) + 191699 (Endelig Tildelt)
  });

  it("does not duplicate the summed recipient into two rows", () => {
    const matches = rows.filter((r) => r.organisasjonsnummer === "971433841");
    expect(matches).toHaveLength(1);
  });

  it("treats a rejected application's 0 amount as a real zero, not a dropped row", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "914084873");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(0);
  });
});

describe("parseYearRows — 2021 (Org.nr. mottakar / Utbetalt beløp ink. administrasjonsgebyr)", () => {
  const config = configFor(2021);
  const rows = parseYearRows(loadFixtureAoa("moms_2021.xlsx", config), config);

  it("matches a real recipient's real paid amount exactly", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "913517792");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(61061);
    expect(row!.amount_label).toBe("Utbetalt beløp ink. administrasjonsgebyr (NOK)");
  });
});

describe("parseYearRows — 2022 (Org.nr / Tildelt beløp), a real duplicate-recipient case", () => {
  const config = configFor(2022);
  const rows = parseYearRows(loadFixtureAoa("moms_2022.xlsx", config), config);

  it("sums a recipient's two real 2022 rows (standalone + underledd application) into one", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "979751346");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(34123); // 34123 (Enkeltstående) + 0 (Underledd)
  });

  it("treats a missing amount cell as zero, not an error", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "979511671");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(0);
  });
});

describe("parseYearRows — 2023 (Org.nr / Tildelt beløp), a real duplicate-recipient case", () => {
  const config = configFor(2023);
  const rows = parseYearRows(loadFixtureAoa("moms_2023.xlsx", config), config);

  it("sums a recipient's two real 2023 rows into one", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "897190702");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(0); // both real rows for this org in the fixture are 0/None
  });

  it("matches a real recipient's real awarded amount exactly", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "999147992");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(14708);
  });
});

describe("parseYearRows — 2024 (Organisasjonsnummer / Tildelt)", () => {
  const config = configFor(2024);
  const rows = parseYearRows(loadFixtureAoa("moms_2024.xlsx", config), config);

  it("matches Norges Røde Kors's real 2024 figure exactly", () => {
    const row = rows.find((r) => r.organisasjonsnummer === "864139442");
    expect(row).toBeDefined();
    expect(row!.amount_nok).toBe(45652744);
    expect(row!.amount_label).toBe("Tildelt");
  });
});

describe("parseYearRows — rows with no valid recipient orgnr are skipped, not thrown on", () => {
  it("handles an all-null trailing row gracefully", () => {
    const config = configFor(2024);
    const aoa: unknown[][] = [
      ["Tilskuddsordning", "Organisasjonsnummer", "Organisasjonsnavn", "Kommune", "Kategori", "Tildelt"],
      ["X", "977538319", "ORG", "Oslo", "Kat", 100],
      [null, null, null, null, null, null],
    ];
    const rows = parseYearRows(aoa, config);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount_nok).toBe(100);
  });
});
