/**
 * Pure parsing logic for the nav-aap ingest (NAV's AAP155 table: recipients
 * of arbeidsavklaringspenger — work-assessment allowance, a transitional
 * benefit paid while NAV assesses someone's capacity for work — count and
 * share of the population, per kommune, monthly).
 *
 * Verified live 2026-10-02 (PLAN-012-nav-aap.md Phase 1) — written fresh,
 * NOT adapted from `nav-uforetrygd`'s parser (see that plan's [Q3]): this
 * table's real shape is simpler. No fylke-only sheet, no bydel nesting
 * (confirmed live: zero 6-digit codes anywhere), no Oslo/Stavanger row-order
 * inconsistency. Two sheets in scope, `"1. Kommune. Antall"` and
 * `"2. Kommune. Andel"` — a repeating fylke block (a skippable "I alt <fylke>"
 * rollup row followed directly by its kommune rows, no separate total sheet).
 *
 * ⚠️ A 16th "fylke" block has no numeric code at all: `"I alt Ukjent"`
 * (rollup, skip) followed by `"Ukjent"` (NAV's own "region not determinable"
 * bucket — confirmed live, 1,500+ people nationally per month, a real count,
 * not a rounding artifact). Represented verbatim as region_code = "Ukjent";
 * `classify_region_code`'s digit-based branches all fail to match a
 * non-numeric string, so it falls through to that macro's existing `unknown`
 * branch with no code change needed — see PLAN-012's [Q1].
 *
 * ⚠️ `Ukjent` EXISTS ONLY IN THE ANTALL SHEET, NOT ANDEL. Confirmed live:
 * the `"2. Kommune. Andel"` sheet has zero mentions of "Ukjent" anywhere —
 * NAV omits it entirely, presumably because there is no population
 * denominator to compute a share against for a region that isn't a real
 * geographic area. 357 regions in Andel, 358 in Antall — a genuine
 * asymmetry between the two sheets, not a parsing defect. Do not assume the
 * two sheets cover the same region set.
 *
 * `region_kind` is deliberately NOT derived here — that is
 * `classify_region_code`'s job at the dbt layer, same as every other Atlas
 * source. This module only extracts region_code faithfully.
 */
import XLSX from "xlsx";

export type CategoryFormat = "antall" | "andel";

export type NavAapRow = {
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
 * Discovery of the live AAP155 download link from the AAP sub-page's HTML.
 *
 * 🔵 Simpler than `nav-uforetrygd`'s equivalent: the link is a real
 * `<a href="/_/attachment/inline/<uuid>:<hash>/AAP155%20...xlsx">` anchor
 * directly in the server-rendered HTML (confirmed live by finding the
 * literal `href="..."` attribute in the raw page source) — no
 * `__NEXT_DATA__` JSON parsing needed. Still a relative link (caller
 * prepends `https://www.nav.no`), and still "inline" not "download" in the
 * path — a content-disposition hint only, does not block a plain GET.
 * Same progressive-fallback shape as every other NAV/Bufdir discovery
 * function in this project: try the literal `AAP155` token first, loosen,
 * then refuse to guess among multiple unnamed candidates.
 */
export type DiscoveryMatch = {
  path: string;
  matchTier: "canonical" | "loose-bare" | "sole-upload";
};

const DISCOVERY_TIERS: { name: DiscoveryMatch["matchTier"]; re: RegExp }[] = [
  {
    name: "canonical",
    re: /\/_\/attachment\/inline\/[0-9a-f-]+:[0-9a-f]+\/AAP155[^\s"'<>]*\.xlsx/i,
  },
  {
    name: "loose-bare",
    re: /\/_\/attachment\/inline\/[^\s"'<>]*AAP155[^\s"'<>]*\.xlsx/i,
  },
];

const SOLE_UPLOAD_RE = /\/_\/attachment\/inline\/[^\s"'<>]+\.xlsx/gi;

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
      `Found ${uploads.length} inline .xlsx attachment links and none names AAP155, ` +
        `so which one holds AAP kommune data is a guess. Pick one deliberately ` +
        `and add a tier for it. Candidates: ${uploads.join(", ")}`,
    );
  }
  throw new Error(
    "Could not find any AAP155 .xlsx URL in the AAP page HTML — NAV likely restructured the page; investigate before retrying.",
  );
}

/**
 * A row's region_code from its label cell, or null if the label is not a
 * region row this table publishes at all (a fylke "I alt <name>" rollup, a
 * blank row, or the month-name header row itself).
 *
 * Only two shapes are real region rows here (confirmed live — no 2-digit or
 * 6-digit codes exist in this table at all, unlike PST302):
 *   - a 4-digit kommune code followed by its name ("1101 Eigersund")
 *   - the literal label "Ukjent" (NAV's own unknown-region bucket, no code)
 * Everything else — including "I alt 11 Rogaland" and "I alt Ukjent" — is a
 * rollup/header row and is deliberately excluded, not summed into the
 * output; the per-kommune rows already carry the real data.
 */
const KOMMUNE_LABEL_RE = /^(\d{4})\s+\S/;

export function extractRegionCode(label: string): string | null {
  if (label === "Ukjent") return "Ukjent";
  const m = label.match(KOMMUNE_LABEL_RE);
  return m ? m[1]! : null;
}

/**
 * One cell's value. `*` is NAV's own suppression marker — confirmed live on
 * `1151 Utsira` (Norway's smallest kommune by population), every month
 * suppressed in both sheets. The workbook's own "0. Om tabellene" sheet
 * states the exact rule: any cell representing fewer than 4 people, per
 * Statistikklovens § 2-6. Cells are native numeric in this workbook
 * (confirmed live) — the comma-replace below is defensive, matching every
 * other Atlas source's `parseCell`, not required by anything observed here.
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
 * Parse one sheet (`"1. Kommune. Antall"` or `"2. Kommune. Andel"`) into the
 * row stream the ingest writes.
 *
 * A single flat scan, no block/nesting tracking:
 *   - The first `"Periode: <year> <mm> - <year> <mm>"`-shaped label cell
 *     sets the sheet's year (one year per file, both periods in the range
 *     share a year in every file seen so far — confirmed live for the
 *     2026-01..2026-08 file).
 *   - The first row whose month-column cells are *all* Norwegian month
 *     names sets the column->month mapping for the rest of the sheet.
 *   - Every other row with a label: extract region_code via
 *     `extractRegionCode`; skip if none (rollup rows, headers, blanks).
 *     Skip if it has zero data cells across the month columns (would only
 *     happen for a row this function otherwise mis-detects as a region row,
 *     which has not been observed — kept as a defensive guard, same
 *     discipline as `nav-uforetrygd`'s parser).
 *   - Label column is **B** (index 1), not A — column A is empty throughout
 *     this report (confirmed live, same layout as PST302).
 */
export function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  categoryFormat: CategoryFormat,
): NavAapRow[] {
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
  const rows: NavAapRow[] = [];

  for (const row of aoa) {
    const labelRaw = row[1];
    const label = typeof labelRaw === "string" ? labelRaw.trim() : null;

    if (year === null && label) {
      const ym = label.match(/^Periode:\s*(\d{4})\s*\d{2}\s*-\s*\d{4}\s*\d{2}\s*$/);
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
        const monthNum = typeof v === "string" ? MONTH_NUMBERS[v.trim()] : undefined;
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
    throw new Error(`${sheetName}: no "Periode: ..." year cell found`);
  }
  if (!monthColumns) {
    throw new Error(`${sheetName}: no month-name header row found`);
  }

  return rows;
}
