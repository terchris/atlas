/**
 * Pure parsing logic for the nav-uforetrygd ingest (NAV's PST302 table:
 * uføretrygd recipients, count and share of population 18-67, per kommune,
 * monthly).
 *
 * Extracted from `index.ts` so discovery + the sheet parser can be exercised
 * by the golden-file test suite without touching HTTP or Postgres. Keep this
 * file pure — no I/O, no logger, no env-dependent branches.
 *
 * Verified live 2026-10-01 (PLAN-004-nav-uforetrygd.md Phase 1) — this is
 * NOT shaped like the Bufdir sources. One xlsx, not a ZIP. Two sheets in
 * scope, `Kommune-bydel. Antall` and `Kommune-bydel. Andel` — a pivoted
 * report, not a flat table: a repeating fylke-header → fylke-total →
 * kommune-rows block per fylke, with Oslo/Bergen/Stavanger/Trondheim nested
 * one level deeper into bydel rows under their own kommune-total row.
 *
 * ⚠️ Oslo's kommune-total row appears AFTER its bydel children with no
 * "i alt" suffix; Stavanger's (and presumably Bergen's/Trondheim's) appears
 * BEFORE, WITH the suffix. This parser does not rely on row order or that
 * suffix at all — every row is classified independently by its label's
 * leading digit-run (2/4/6 digits), and kept if it carries at least one data
 * cell. A header-only row (a fylke title, or the month-name row itself) has
 * zero data cells in the month columns and is skipped for that reason alone,
 * not because it failed a position check.
 *
 * `region_kind` (fylke/kommune/bydel) is deliberately NOT derived here —
 * that is `classify_region_code`'s job at the dbt layer, same as every other
 * Atlas source. This module only extracts the region_code faithfully.
 */
import XLSX from "xlsx";

export type CategoryFormat = "antall" | "andel";

export type NavUforetrygdRow = {
  region_code: string;
  category_format: CategoryFormat;
  year: number;
  month: number;
  value: number | null;
  values_json: unknown;
};

/** Norwegian month name -> 1-12. No abbreviations observed in the source. */
export const MONTH_NUMBERS: Record<string, number> = {
  Januar: 1,
  Februar: 2,
  Mars: 3,
  April: 4,
  Mai: 5,
  Juni: 6,
  Juli: 7,
  August: 8,
  September: 9,
  Oktober: 10,
  November: 11,
  Desember: 12,
};

/**
 * Discovery of the live PST302 download link from the monitor page's HTML.
 *
 * Links on this page are **relative** (`/_/attachment/download/...`), not
 * absolute — unlike the Bufdir sources' CDN links. The caller prepends
 * `https://www.nav.no`. Progressive fallback, same shape as the Bufdir
 * sources' `discoverZipUrl`: try the literal `PST302` token first, loosen,
 * then refuse to guess among multiple unnamed candidates.
 */
export type DiscoveryMatch = {
  path: string;
  matchTier: "canonical" | "loose-bare" | "sole-upload";
};

const DISCOVERY_TIERS: { name: DiscoveryMatch["matchTier"]; re: RegExp }[] = [
  {
    name: "canonical",
    re: /\/_\/attachment\/download\/[0-9a-f-]+:[0-9a-f]+\/PST302[^\s"'<>]*\.xlsx/i,
  },
  {
    name: "loose-bare",
    re: /\/_\/attachment\/download\/[^\s"'<>]*PST302[^\s"'<>]*\.xlsx/i,
  },
];

const SOLE_UPLOAD_RE = /\/_\/attachment\/download\/[^\s"'<>]+\.xlsx/gi;

export function discoverWorkbookPath(html: string): DiscoveryMatch {
  for (const tier of DISCOVERY_TIERS) {
    const m = html.match(tier.re);
    if (m) return { path: m[0], matchTier: tier.name };
  }
  const uploads = [...new Set(html.match(SOLE_UPLOAD_RE) ?? [])];
  if (uploads.length === 1) {
    return { path: uploads[0]!, matchTier: "sole-upload" };
  }
  if (uploads.length > 1) {
    throw new Error(
      `Found ${uploads.length} .xlsx attachment links and none names PST302, ` +
        `so which one holds uføretrygd data is a guess. Pick one deliberately ` +
        `and add a tier for it. Candidates: ${uploads.join(", ")}`,
    );
  }
  throw new Error(
    "Could not find any PST302 .xlsx URL in the monitor page HTML — NAV likely restructured the page; investigate before retrying.",
  );
}

/**
 * A row's region_code from its label cell, or null if the label isn't a
 * region row at all (a fylke section title and a kommune/fylke total row
 * use the exact same label shape otherwise — see module header; this
 * function alone cannot and does not try to distinguish them. The caller
 * decides relevance by whether the row carries any data cell.)
 *
 * Only 2, 4 or 6-digit leading codes are accepted (fylke, kommune, bydel) —
 * anything else is not a region label this table is known to produce.
 */
const REGION_LABEL_RE = /^(\d+)\s+\S/;

export function extractRegionCode(label: string): string | null {
  const m = label.match(REGION_LABEL_RE);
  if (!m) return null;
  const code = m[1]!;
  if (code.length === 2 || code.length === 4 || code.length === 6) {
    return code;
  }
  return null;
}

/**
 * One cell's value. `*` is NAV's own suppression marker (confirmed live,
 * different from the Bufdir sources' `..`/`.` and SSB's `..`) -> null.
 * Cells are native numeric in this workbook (confirmed live) — the
 * comma-replace below is defensive, not required by anything observed.
 */
export function parseCell(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s || s === "*") return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one sheet (`Kommune-bydel. Antall` or `Kommune-bydel. Andel`) into
 * the row stream the ingest writes.
 *
 * A single flat scan, no block/nesting tracking:
 *   - The first `"<4-digit-year> : "`-shaped label cell sets the sheet's
 *     year (one year per file, confirmed live).
 *   - The first row whose month-column cells are *all* Norwegian month
 *     names sets the column→month mapping for the rest of the sheet
 *     (confirmed stable across fylke blocks live; not re-validated per
 *     block, since there one year/one column layout per file).
 *   - Every other row with a label: extract `region_code`; skip if none
 *     (section-header labels, blank rows). Skip if it has zero data cells
 *     across the month columns (a fylke/kommune title row with no numbers
 *     at all — the one case a label alone can't distinguish from a total
 *     row, resolved here by requiring actual data, not by position).
 *   - Label column is **B** (index 1), not A — column A is empty throughout
 *     this report (confirmed live).
 */
export function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  categoryFormat: CategoryFormat,
): NavUforetrygdRow[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`missing sheet "${sheetName}"`);
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  let year: number | null = null;
  let monthColumns: { col: number; month: number }[] | null = null;
  const rows: NavUforetrygdRow[] = [];

  for (const row of aoa) {
    const labelRaw = row[1];
    const label = typeof labelRaw === "string" ? labelRaw.trim() : null;

    if (year === null && label) {
      const ym = label.match(/^(\d{4})\s*:\s*$/);
      if (ym) {
        year = Number(ym[1]);
        continue;
      }
    }

    if (!monthColumns) {
      const candidate: { col: number; month: number }[] = [];
      let allMonths = true;
      let any = false;
      for (let c = 2; c < row.length; c++) {
        const v = row[c];
        if (v === null || v === undefined || v === "") continue;
        any = true;
        const monthNum =
          typeof v === "string" ? MONTH_NUMBERS[v.trim()] : undefined;
        if (!monthNum) {
          allMonths = false;
          break;
        }
        candidate.push({ col: c, month: monthNum });
      }
      if (any && allMonths) {
        monthColumns = candidate;
        continue;
      }
    }

    if (!label || !monthColumns || year === null) continue;

    const regionCode = extractRegionCode(label);
    if (!regionCode) continue;

    let hasData = false;
    for (const { col } of monthColumns) {
      const v = row[col];
      if (v !== null && v !== undefined && v !== "") {
        hasData = true;
        break;
      }
    }
    if (!hasData) continue;

    const valuesJson: Record<string, number | null> = {};
    for (const { col, month } of monthColumns) {
      valuesJson[String(month)] = parseCell(row[col]);
    }

    for (const { month } of monthColumns) {
      rows.push({
        region_code: regionCode,
        category_format: categoryFormat,
        year,
        month,
        value: valuesJson[String(month)] ?? null,
        values_json: valuesJson,
      });
    }
  }

  if (year === null) {
    throw new Error(`${sheetName}: no year cell ("<year> : ") found`);
  }
  if (!monthColumns) {
    throw new Error(`${sheetName}: no month-name header row found`);
  }

  return rows;
}
