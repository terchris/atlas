/**
 * Pure parsing logic for the nav-helt-ledige ingest (NAV's HL060 table:
 * "Helt ledige. Fylke og kommune. Tidsserie måned" — count and share of the
 * labour force registered as fully unemployed, per kommune, monthly).
 *
 * Verified live 2026-10-02 (PLAN-014-nav-helt-ledige.md Phase 1) — written
 * fresh, NOT adapted from `nav-aap`'s or `nav-uforetrygd`'s parsers (see
 * PLAN-014's [Q2]): this table's row-classification rule is simpler than
 * either — neither the bare fylke header row ("Oslo - Oslove") nor the
 * "I alt <name>" rollup row carries any digit at all, so "the label starts
 * with exactly 4 digits" alone separates real kommune rows, with no "I alt
 * <2-digit-fylke>" prefix to additionally guard against (unlike AAP155's
 * "I alt 03 Oslo"). Two sheets in scope, `"3. Kommune Antall"` and
 * `"4. Kommune Prosent av arbeidsst"` — a repeating fylke block (a skippable
 * bare fylke-name header row, its own month-name header row, an "I alt
 * <name>" rollup row to skip, then its kommune rows).
 *
 * ⚠️ A 17th fylke block is `"Svalbard og øvrige områder"`, whose only
 * "kommune" is the real pseudo-kommune code `2100 Svalbard` — confirmed live,
 * matches `classify_region_code`'s existing `^21\d{2}$` svalbard branch, same
 * finding as `udir-gsi`/`husbanken-bostotte`.
 *
 * ⚠️ An 18th block is the bare literal `"Ukjent"` — unlike every prior NAV
 * source this session, here the FYLKE HEADER ITSELF is the bare string
 * "Ukjent" (no "I alt" prefix), and the KOMMUNE LEAF ROW is *also* the bare
 * string "Ukjent" — both call `extractRegionCode` to the same "Ukjent"
 * result. Confirmed live: the header row carries zero data cells (filtered
 * out downstream by the existing hasData guard, the same guard that already
 * exists for this exact reason), and the leaf row carries the real count —
 * see PLAN-014's [Q5]. `classify_region_code`'s digit-based branches all
 * fail to match a non-numeric string, so "Ukjent" falls through to that
 * macro's existing `unknown` branch, no code change needed.
 *
 * ⚠️ UNLIKE `nav-aap`, "Ukjent" IS present in BOTH sheets here (359 distinct
 * region codes in both Antall and Prosent — 357 kommuner + Svalbard's 2100 +
 * Ukjent, confirmed live) — but in the
 * Prosent sheet every one of its month cells is the suppression marker `*`,
 * not a real share. Represent it the same as any other suppressed cell
 * (null), not a dropped row — do not assume the two-sheets-disagree pattern
 * from `nav-aap` carries over here; it was checked independently and found
 * not to hold.
 *
 * `region_kind` is deliberately NOT derived here — that is
 * `classify_region_code`'s job at the dbt layer, same as every other Atlas
 * source. This module only extracts region_code faithfully.
 */
import XLSX from "xlsx";

export type CategoryFormat = "antall" | "prosent";

export type NavHeltLedigeRow = {
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
 * Discovery of the live HL060 download link from the helt-ledige page's
 * HTML.
 *
 * 🔵 Same real-anchor shape as `nav-aap`'s discovery function — a real
 * `<a href="/_/attachment/download/<uuid>:<hash>/202608_HL060%20...xlsx">`
 * anchor directly in the server-rendered HTML (confirmed live), no
 * `__NEXT_DATA__` JSON parsing needed. ⚠️ The path segment is `download`,
 * not `inline` (AAP155's segment) — confirmed, not assumed identical across
 * NAV tables. Still a relative link (caller prepends `https://www.nav.no`).
 * Same progressive-fallback shape as every other NAV/Bufdir discovery
 * function in this project: try the literal `HL060` token first, loosen,
 * then refuse to guess among multiple unnamed candidates.
 */
export type DiscoveryMatch = {
  path: string;
  matchTier: "canonical" | "loose-bare" | "sole-upload";
};

const DISCOVERY_TIERS: { name: DiscoveryMatch["matchTier"]; re: RegExp }[] = [
  {
    name: "canonical",
    re: /\/_\/attachment\/download\/[0-9a-f-]+:[0-9a-f]+\/[^\s"'<>]*HL060[^\s"'<>]*\.xlsx/i,
  },
  {
    name: "loose-bare",
    re: /\/_\/attachment\/download\/[^\s"'<>]*HL060[^\s"'<>]*\.xlsx/i,
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
      `Found ${uploads.length} download .xlsx attachment links and none names HL060, ` +
        `so which one holds helt-ledige kommune data is a guess. Pick one deliberately ` +
        `and add a tier for it. Candidates: ${uploads.join(", ")}`,
    );
  }
  throw new Error(
    "Could not find any HL060 .xlsx URL in the helt-ledige page HTML — NAV likely restructured the page; investigate before retrying.",
  );
}

/**
 * A row's region_code from its label cell, or null if the label is not a
 * region row this table publishes at all (a bare fylke header, an "I alt
 * <name>" rollup, a blank row, or the month-name header row itself).
 *
 * Only two shapes are real region rows here (confirmed live — no 2-digit
 * fylke codes and no 6-digit bydel codes exist anywhere in this table):
 *   - a 4-digit kommune code followed by its name ("1101 Eigersund")
 *   - the literal label "Ukjent" (NAV's own unknown-region bucket, no code —
 *     used for BOTH the fylke-level header row and the kommune-level leaf
 *     row; the header row is filtered out downstream by the hasData guard)
 * Everything else — including "Oslo - Oslove", "Svalbard og øvrige
 * områder", and every "I alt <name>" rollup — is a header/rollup row and is
 * deliberately excluded, not summed into the output; the per-kommune rows
 * already carry the real data.
 */
const KOMMUNE_LABEL_RE = /^(\d{4})\s+\S/;

export function extractRegionCode(label: string): string | null {
  if (label === "Ukjent") return "Ukjent";
  const m = label.match(KOMMUNE_LABEL_RE);
  return m ? m[1]! : null;
}

/**
 * One cell's value. `*` is NAV's own suppression marker — confirmed live on
 * `1151 Utsira` (mixed real/suppressed cells within the same row: 4 real
 * values, 4 suppressed, across the 8 months). The workbook's own "0. Om
 * tabellene" sheet states the exact rule: any cell representing fewer than 4
 * people, per Statistikklovens § 7-1 (a different paragraph than AAP155's
 * § 2-6 — confirmed by reading this table's own methodology sheet, not
 * assumed identical). Cells are native numeric in this workbook (confirmed
 * live) — the comma-replace below is defensive, matching every other Atlas
 * source's `parseCell`, not required by anything observed here.
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
 * The sheet's one covered year, from its own period-label cell.
 *
 * ⚠️ A different shape than AAP155's "Periode: <year> <mm> - <year> <mm>"
 * cell — this table's own label cell reads "<Month> - <month> <year>" (e.g.
 * "Januar - august 2026"), confirmed live. Don't assume every NAV workbook
 * shares one period-label convention; read each table's own cell.
 */
const PERIOD_LABEL_RE = /^[A-ZÆØÅ][a-zæøå]+\s*-\s*[a-zæøå]+\s+(\d{4})$/;

/**
 * Parse one sheet (`"3. Kommune Antall"` or `"4. Kommune Prosent av
 * arbeidsst"`) into the row stream the ingest writes.
 *
 * A single flat scan, no block/nesting tracking — same shape as `nav-aap`'s
 * parser, which already tolerates the blank-row spacing being inconsistent
 * between the two sheets (confirmed live: the Antall sheet has no blank row
 * between one fylke's last kommune and the next fylke header, the Prosent
 * sheet does) because blank-label rows are simply skipped, never counted on
 * for structure:
 *   - The first period-label cell (see `PERIOD_LABEL_RE`) sets the sheet's
 *     year (one year per file, confirmed live for the 2026-01..2026-08
 *     file).
 *   - The first row whose month-column cells are *all* Norwegian month
 *     names sets the column->month mapping for the rest of the sheet (it
 *     repeats verbatim per fylke block; only the first occurrence is used).
 *   - Every other row with a label: extract region_code via
 *     `extractRegionCode`; skip if none (fylke headers, "I alt" rollups,
 *     blanks). Skip if it has zero data cells across the month columns
 *     (the guard that correctly drops the bare "Ukjent" fylke-header row
 *     while keeping the "Ukjent" kommune-leaf row — see this file's module
 *     header and PLAN-014's [Q5]).
 *   - Label column is **B** (index 1), not A — column A is empty throughout
 *     this report (confirmed live, same layout as every NAV-Excel source
 *     this session).
 */
export function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  categoryFormat: CategoryFormat,
): NavHeltLedigeRow[] {
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
  const rows: NavHeltLedigeRow[] = [];

  for (const row of aoa) {
    const labelRaw = row[1];
    const label = typeof labelRaw === "string" ? labelRaw.trim() : null;

    if (year === null && label) {
      const ym = label.match(PERIOD_LABEL_RE);
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
    throw new Error(`${sheetName}: no period-label year cell found`);
  }
  if (!monthColumns) {
    throw new Error(`${sheetName}: no month-name header row found`);
  }

  return rows;
}
