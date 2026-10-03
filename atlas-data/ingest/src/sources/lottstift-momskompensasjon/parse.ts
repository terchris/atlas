/**
 * Pure parsing logic for the lottstift-momskompensasjon ingest (Lotteri- og
 * stiftelsestilsynet's annual VAT-compensation allocations to voluntary
 * organisations). Atlas's first Lottstift source.
 *
 * Verified live 2026-10-04 (PLAN-020-lottstift-momskompensasjon.md Phase 1) —
 * NOT the `tilskudd.lottstift.no` GraphQL-backed search app the investigation
 * pointed at (no public endpoint found there). The real, working mechanism is
 * `lottstift.no/nb/om-oss/apne-data/`'s own direct static XLSX downloads, one
 * file per year.
 *
 * ⚠️ Every year's column layout is genuinely different — confirmed by
 * downloading and inspecting all 9 available years directly, not assumed
 * from one sample. Six years (2019-2024) carry a usable recipient
 * organisasjonsnummer; 2016-2018 do not (only a recipient NAME under an
 * umbrella applicant, e.g. "4H NORGE" reporting "4H ØSTFOLD" as a
 * name-only sub-row) and are deliberately not ingested — matching a
 * recipient to Brreg by name alone would be the exact kind of unreliable
 * guess this project avoids.
 *
 * Geography and ICNPO category deliberately do NOT come from each file's
 * own `Kommune`/`Kategori` text columns (present and shaped differently in
 * some years, absent in others — 2020 has neither). They come from joining
 * the recipient's organisasjonsnummer against the already-shipped
 * `dim_brreg_enhet` at the dbt layer, which already resolves both reliably,
 * for every organisation, regardless of which year's file is being read.
 * This module only extracts (organisasjonsnummer, amount) per row.
 *
 * ⚠️ A small number of organisations receive more than one case/grant in
 * the same year (confirmed live: 30 duplicate recipients in 2022, 30 in
 * 2023, 14 in 2020) — amounts are summed per (organisasjonsnummer, year),
 * not kept as separate rows. Atlas's own grain question here is "how much
 * did this org receive this year," not "how many separate administrative
 * cases existed."
 */

export type MomskompensasjonRow = {
  organisasjonsnummer: string;
  year: number;
  amount_nok: number;
  amount_label: string;
};

/**
 * One year's real column layout, confirmed live 2026-10-04 by downloading
 * and inspecting that year's own file directly. `amountLabel` records which
 * of the year's own column headers fed `amount_nok` — the real meaning
 * (requested vs. approved vs. awarded vs. paid) differs by year, and this
 * keeps that difference visible rather than silently normalising it away.
 */
export type YearConfig = {
  year: number;
  url: string;
  sheetName: string;
  /** 0-indexed column holding the real recipient's organisasjonsnummer. */
  orgnrCol: number;
  /** 0-indexed column holding the amount this year represents as final. */
  amountCol: number;
  amountLabel: string;
};

export const YEAR_CONFIGS: YearConfig[] = [
  {
    year: 2019,
    url: "https://lottstift.no/app/uploads/2021/07/Oversikt-over-alle-mottakarar_2019-1.xlsx",
    sheetName: "2019",
    orgnrCol: 3, // "Org.nr. mottakar"
    amountCol: 7, // "Tildelt etter avkorting (NOK)"
    amountLabel: "Tildelt etter avkorting (NOK)",
  },
  {
    year: 2020,
    url: "https://lottstift.no/app/uploads/2021/06/Oversikt-over-alle-sokarar_2020_moms.xlsx",
    sheetName: "2020",
    orgnrCol: 0, // "Org.nr. søkar" — no separate mottakar column this year
    amountCol: 4, // "Utbetalt Beløp (NOK)"
    amountLabel: "Utbetalt Beløp (NOK)",
  },
  {
    year: 2021,
    url: "https://lottstift.no/app/uploads/2023/01/Oversikt-over-alle-mottakarar_2021_moms.xlsx",
    sheetName: "2021",
    orgnrCol: 3, // "Org.nr. mottakar"
    amountCol: 8, // "Utbetalt beløp ink. administrasjonsgebyr (NOK)"
    amountLabel: "Utbetalt beløp ink. administrasjonsgebyr (NOK)",
  },
  {
    year: 2022,
    url: "https://lottstift.no/app/uploads/2022/12/Oversikt-over-mottakere-og-tildelt-belop-2022.xlsx",
    sheetName: "Uttrekk_moms",
    orgnrCol: 1, // "Org.nr" (the recipient; col 4 "Org.nr søkar" is the applicant)
    amountCol: 8, // "Tildelt beløp"
    amountLabel: "Tildelt beløp",
  },
  {
    year: 2023,
    url: "https://lottstift.no/app/uploads/2023/12/Oversikt-over-mottakere-og-tildelt-belop-2023.xlsx",
    sheetName: "Uttrekk_moms",
    orgnrCol: 1, // "Org.nr"
    amountCol: 9, // "Tildelt beløp"
    amountLabel: "Tildelt beløp",
  },
  {
    year: 2024,
    url: "https://lottstift.no/app/uploads/2026/06/Oversikt-over-tildelinger-momskompensasjon-2024.xlsx",
    sheetName: "Tildelinger",
    orgnrCol: 1, // "Organisasjonsnummer"
    amountCol: 5, // "Tildelt"
    amountLabel: "Tildelt",
  },
];

/**
 * One cell's amount value. A missing/blank cell (confirmed live — some rows
 * genuinely have no reported amount, e.g. a still-pending case) is treated
 * as 0 for summing purposes, not an error and not a dropped row.
 */
function parseAmountCell(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * One organisasjonsnummer cell. Confirmed live: some years store it as a
 * number (openpyxl/xlsx autodetects a numeric-looking cell), others as a
 * string — normalised to a 9-digit string either way. A blank/zero cell
 * (no recipient identified on this row) is skipped by the caller, not
 * coerced into a fake "0" organisation.
 */
export function parseOrgnrCell(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if (!/^\d{9}$/.test(s)) return null;
  return s;
}

/**
 * Parse one year's workbook (already read via `XLSX.read`, sheet accessed
 * via `XLSX.utils.sheet_to_json(sheet, {header: 1, raw: true, defval:
 * null})` — same convention `nav-aap`'s own `parseSheet` already uses) into
 * summed (organisasjonsnummer, year, amount) rows.
 *
 * Rows with no valid 9-digit recipient organisasjonsnummer are skipped, not
 * thrown on — confirmed live that this can legitimately happen (a blank
 * trailing row at the end of a sheet).
 */
export function parseYearRows(aoa: unknown[][], config: YearConfig): MomskompensasjonRow[] {
  const sums = new Map<string, number>();

  // Skip the header row (row 0) and, for the two years whose own sheet
  // carries no header at index 0 at all, nothing further is needed — every
  // shipped year's real header sits at aoa[0], confirmed live for each.
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i]!;
    const orgnr = parseOrgnrCell(row[config.orgnrCol]);
    if (!orgnr) continue;
    const amount = parseAmountCell(row[config.amountCol]);
    sums.set(orgnr, (sums.get(orgnr) ?? 0) + amount);
  }

  const out: MomskompensasjonRow[] = [];
  for (const [organisasjonsnummer, amount_nok] of sums) {
    out.push({
      organisasjonsnummer,
      year: config.year,
      amount_nok,
      amount_label: config.amountLabel,
    });
  }
  return out;
}
