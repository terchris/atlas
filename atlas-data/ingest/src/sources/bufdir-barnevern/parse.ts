/**
 * Pure parsing logic for the bufdir-barnevern ZIP-based ingest.
 *
 * Extracted from `index.ts` so the parser + URL discovery can be exercised by
 * the golden-file test suite at `__tests__/parse.test.ts` without touching
 * HTTP, Postgres, or `process.env`. Keep this file pure — no I/O, no logger,
 * no env-dependent branches.
 *
 * This is the sibling of `bufdir-barnefattigdom/parse.ts` — same shape
 * (discovery tiers, surrogate-id derivation, sheet parser), different
 * literals, because the two Bufdir monitors' bundles are shaped differently
 * (verified live 2026-10-01, see PLAN-003-bufdir-barnevern.md Phase 1):
 *
 *   - Barnefattigdom workbooks: sheet `Data`, columns Region/Regionnavn/
 *     Enhet/Tallformat/<years>, filenames `Indikator_<N>_...xlsx`.
 *   - Barnevern workbooks: sheet `Sheet1`, columns Region/Regionnavn/
 *     Tallformat/<years> — **no Enhet column at all** — filenames
 *     `<code>_...xlsx` where `<code>` is alphanumeric (`1a`, `3m`, `4f`, …),
 *     never purely numeric.
 *
 * Index.ts owns:
 *   - HTTP fetch (calling discoverZipUrl with the HTML it just downloaded)
 *   - ZIP extraction (handing each workbook's bytes to parseWorkbookSheet)
 *   - Postgres upsert + ingest_run lifecycle
 *
 * This file owns:
 *   - URL discovery from monitor-page HTML (multi-tier with progressive
 *     fallback so a Bufdir filename / hostname change doesn't break ingest)
 *   - XLSX parsing for the per-workbook `Sheet1`
 *   - Norwegian decimal + suppression-marker handling
 *   - Surrogate `indicator_api_id` derivation
 */
import { createHash } from "node:crypto";
import XLSX from "xlsx";

/** One emitted row, before postgres timestamping. */
export type BufdirBarnevernRow = {
  indicator_api_id: string;
  indicator_slug: string;
  indicator_group_slug: string;
  indicator_name: string;
  indicator_title: string;
  link_text: string | null;
  region_code: string;
  category_format: string;
  year: number;
  value: number | null;
  values_json: unknown;
};

/** Fixed bucket for ZIP-backed rows (mirrors the barnefattigdom constant). */
export const INDICATOR_GROUP_SLUG_ZIP = "barnevern_zip";

/**
 * Multi-tier ZIP URL discovery from monitor-page HTML.
 *
 * Same strategy as `bufdir-barnefattigdom/parse.ts`'s `discoverZipUrl`, but
 * matching Barnevern's own literal filename shape, verified live 2026-10-01:
 *
 *   https://ca-statistikk-strapi-prod…azurecontainerapps.io/uploads/
 *     Kommunemonitor_barnevern_2026_09_04_cedc894149.zip
 *
 * Note the word order differs from Barnefattigdom's
 * `YYYY_MM_DD_barnefattigdom_monitor_<hash>.zip` — `Kommunemonitor_barnevern`
 * leads here, the date comes after. Don't assume symmetry between the two
 * sources' URL shapes; each gets its own tier set matched to what was
 * actually observed.
 *
 * Tiers:
 *   - "canonical": today's shape (`/uploads/kommunemonitor_barnevern_YYYY_MM_DD_<hash>.zip`)
 *   - "loose-date-format": any punctuation/order after the `kommunemonitor_barnevern` token
 *   - "loose-monitor": any URL containing "kommunemonitor_barnevern" + .zip, no /uploads/ requirement
 *   - "loose-bare": any URL containing "barnevern" + .zip
 *
 * Hostname is intentionally not constrained — same reasoning as the sibling
 * module: Bufdir's CDN host has already moved once.
 */
export type DiscoveryMatch = {
  url: string;
  matchTier:
    | "canonical"
    | "loose-date-format"
    | "loose-monitor"
    | "loose-bare"
    | "sole-upload";
};

const DISCOVERY_TIERS: { name: DiscoveryMatch["matchTier"]; re: RegExp }[] = [
  {
    name: "canonical",
    re: /https:\/\/[^\s"'<>]+\/uploads\/kommunemonitor_barnevern_\d{4}_\d{2}_\d{2}_[a-z0-9]+\.zip/i,
  },
  {
    name: "loose-date-format",
    re: /https:\/\/[^\s"'<>]+\/uploads\/kommunemonitor_barnevern[\d_-]*[^\s"'<>]*\.zip/i,
  },
  {
    name: "loose-monitor",
    re: /https:\/\/[^\s"'<>]+kommunemonitor_barnevern[^\s"'<>]*\.zip/i,
  },
  {
    name: "loose-bare",
    re: /https:\/\/[^\s"'<>]+barnevern[^\s"'<>]*\.zip/i,
  },
];

// Last resort: any ZIP under /uploads/ on the page. Same reasoning as the
// sibling module: safe only when there is exactly one candidate — guessing
// among several would risk silently ingesting the wrong bundle.
const SOLE_UPLOAD_RE = /https:\/\/[^\s"'<>]+\/uploads\/[^\s"'<>]*\.zip/gi;

export function discoverZipUrl(html: string): DiscoveryMatch {
  for (const tier of DISCOVERY_TIERS) {
    const m = html.match(tier.re);
    if (m) return { url: m[0], matchTier: tier.name };
  }
  const uploads = [...new Set(html.match(SOLE_UPLOAD_RE) ?? [])];
  if (uploads.length === 1) {
    return { url: uploads[0]!, matchTier: "sole-upload" };
  }
  if (uploads.length > 1) {
    throw new Error(
      `Found ${uploads.length} ZIPs under /uploads/ and none names barnevern, ` +
        `so which one holds the child-welfare data is a guess. Pick one deliberately ` +
        `and add a tier for it. Candidates: ${uploads.join(", ")}`,
    );
  }
  throw new Error(
    "Could not find any barnevern .zip URL in monitor page HTML — Bufdir likely restructured the page; investigate before retrying.",
  );
}

/**
 * Surrogate `indicator_api_id` from the XLSX filename stem (without `.xlsx`).
 *
 * Barnevern's indicator codes are alphanumeric (`1a`, `1e`, `3m`, `4f`, …) —
 * never purely numeric like Barnefattigdom's `Indikator_<N>`. Same two-tier
 * shape as the sibling (code-prefix canonical, hash fallback defensive), with
 * a `bv_` prefix so the two sources' surrogate ids stay visibly distinct even
 * though a collision is already unlikely (one scheme is alphanumeric, the
 * other purely numeric).
 *
 * The one non-conforming filename in the live bundle
 * (`Turnover_kommunalt barnevern_2016-2024.xlsx`) has no code prefix at all —
 * it falls through to the hash-fallback tier here, but in practice never
 * reaches this function: `index.ts`'s entry filter excludes it before
 * parsing (see that file's comment — its internal layout is structurally
 * different, not just differently named; forcing it through the standard
 * parser would throw, not quietly produce wrong data).
 */
const CODE_PREFIX_RE = /^(\d+[a-z])_/i;

export type SurrogateIdResult = {
  id: string;
  tier: "code-prefix" | "hash-fallback";
};

export function surrogateIndicatorApiId(workbookStem: string): SurrogateIdResult {
  const m = workbookStem.match(CODE_PREFIX_RE);
  if (m) {
    return { id: `bv_zip_ind_${m[1]!.toLowerCase()}`, tier: "code-prefix" };
  }
  const body = createHash("sha256")
    .update(workbookStem, "utf8")
    .digest("hex")
    .slice(0, 24);
  return { id: `bv_zip_${body}`, tier: "hash-fallback" };
}

/** Norwegian-friendly slug: lowercase, spaces→underscores, strip punctuation. */
export function slugFromIndicatorName(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "_");
  return s.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
}

/** Strip path; keep only the final filename portion. */
export function basenameOnly(entryPath: string): string {
  const parts = entryPath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? entryPath;
}

/**
 * Filenames this source's ingest treats as a standard indicator workbook:
 * an alphanumeric code (`1a`, `3m`, `4f`, …) followed by an underscore.
 *
 * `Turnover_kommunalt barnevern_2016-2024.xlsx` — the one file in the live
 * bundle without this prefix — is excluded by this test, which is also the
 * mechanism that keeps it out of the parser: confirmed by direct inspection
 * (2026-10-01) that it uses a completely different layout (year-range
 * column headers `turnover 2015-2016, …`, kommune code+name combined into
 * one cell), not just a different filename. `3m_turnover_saksbehandlere.xlsx`
 * already carries the equivalent indicator in the standard shape.
 */
export function isStandardIndicatorWorkbook(fileBase: string): boolean {
  return CODE_PREFIX_RE.test(fileBase);
}

/**
 * Parse one Bufdir workbook cell into a typed value.
 *
 * - `..` and `.` and blanks → null (Bufdir's suppression marker, SSB convention).
 * - `andel` Tallformat: Norwegian decimal (`9,2` or `17689,64`, with leading
 *   spaces) → float. ⚠️ **Barnevern's own vocabulary, not the sibling
 *   Barnefattigdom source's `prosent`** — verified live 2026-10-01 across all
 *   23 standard workbooks: every decimal-format cell uses the literal value
 *   `Andel`, lowercased to `andel` here. **Despite the name ("share"), these
 *   are not all 0–100 percentages** — e.g. `2A_utgifter_per_barn_...xlsx`
 *   ("expenditure per child") carries `andel` values like `17689,64`, a
 *   kroner figure. Treat `andel` as "this column uses Norwegian-decimal
 *   formatting", not as "this column is a percentage". An earlier draft of
 *   this parser checked for `prosent` (copied from the sibling module
 *   without re-verifying against Barnevern's own data) and silently dropped
 *   every `andel` row — roughly half of all rows, and all of 9 of 23
 *   workbooks entirely. Caught by running the real ingest against the live
 *   ZIP before merging, not by the unit tests alone.
 * - `antall` Tallformat: integer cell.
 * - Returns null if the parse fails (defensive — better null than NaN downstream).
 */
export function parseCell(raw: unknown, tallformat: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === "." || s === "..") return null;
  s = s.replace(/\s/g, "");
  if (tallformat === "andel") {
    s = s.replace(",", ".");
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Locate the row that starts with the literal "Region" header; throws if absent. */
export function findHeaderRow(aoa: unknown[][]): number {
  for (let i = 0; i < aoa.length; i++) {
    const c0 = aoa[i]?.[0];
    if (typeof c0 === "string" && c0.trim().toLowerCase() === "region") {
      return i;
    }
  }
  throw new Error("No header row starting with Region in Sheet1");
}

/**
 * Indicator title is composed from text rows above the header, joined with
 * ` — ` so multi-line workbook titles round-trip cleanly. Returns
 * "unnamed indicator" when no title rows exist (defensive default).
 *
 * For Barnevern this usually collapses to just the filename stem — the row
 * above the header is a single cell equal to the filename, not a separate
 * human-readable sentence the way some Barnefattigdom workbooks carry
 * (confirmed on `1A`, `2C`, `3A`, `4F` samples, 2026-10-01). Kept generic
 * rather than special-cased, in case a richer title row shows up in a
 * workbook not sampled during this plan's Phase 1.
 */
export function indicatorTitleAboveHeader(
  hdrIx: number,
  aoa: unknown[][],
): string {
  const parts: string[] = [];
  for (let i = 0; i < hdrIx; i++) {
    const c = aoa[i]?.[0];
    if (typeof c !== "string" || !c.trim()) continue;
    parts.push(
      c
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return parts.join(" — ") || "unnamed indicator";
}

/**
 * Parse one workbook's `Sheet1` into the row stream the ingest writes.
 *
 * Throws if:
 *   - the workbook has no `Sheet1`
 *   - no header row starting with "Region" exists
 *   - no year columns appear after `Tallformat`
 *
 * Skips (without throwing):
 *   - blank rows
 *   - rows where `Tallformat` is not in {antall, andel}
 *
 * Unlike Barnefattigdom's `Data` sheet, there is no `Enhet` column to filter
 * on — Barnevern's indicators are already child-population rates, not paired
 * child/household tuples (confirmed 2026-10-01, see parse.ts module header).
 * Header layout: `Region | Regionnavn | Tallformat | <year columns>` — years
 * start at column index 3 (zero-based), one column earlier than
 * Barnefattigdom's index 4, because there's one fewer leading column
 * (`Enhet` is gone, `Tallformat` shifts from index 3 to index 2).
 *
 * One emitted row per (region × format × year) tuple. Each row carries a
 * `values_json` snapshot of the full year-set so downstream consumers can
 * see the whole time series of a slice without re-aggregating.
 */
export function parseWorkbookSheet(
  workbookBytes: Buffer,
  fileBase: string,
): BufdirBarnevernRow[] {
  const stem = fileBase.replace(/\.xlsx$/i, "");
  const { id: indicatorApiId } = surrogateIndicatorApiId(stem);
  const slugPart = stem.replace(CODE_PREFIX_RE, "").trim();
  const humanName = (
    slugPart.replace(/_/g, " ") || stem.replace(/_/g, " ")
  ).trim();
  const indicatorSlug = slugFromIndicatorName(humanName);

  const wb = XLSX.read(workbookBytes, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets["Sheet1"];
  if (!sheet) {
    throw new Error(`${fileBase}: missing Sheet1`);
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const hdrIx = findHeaderRow(aoa);
  const indicatorTitle = indicatorTitleAboveHeader(hdrIx, aoa);
  const indicatorName = indicatorTitle;

  const headerRow = aoa[hdrIx] ?? [];
  const yearCols: { col: number; year: number }[] = [];
  for (let j = 3; j < headerRow.length; j++) {
    const h = headerRow[j];
    const y =
      typeof h === "number" && Number.isFinite(h)
        ? Math.trunc(h)
        : Number.parseInt(String(h ?? ""), 10);
    if (Number.isFinite(y) && y >= 1990 && y <= 2100) {
      yearCols.push({ col: j, year: y });
    }
  }
  if (yearCols.length === 0) {
    throw new Error(`${fileBase}: no year columns after Tallformat`);
  }

  const rows: BufdirBarnevernRow[] = [];
  for (let r = hdrIx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row?.length) continue;
    const regionRaw = row[0];
    if (regionRaw === null || regionRaw === undefined || regionRaw === "")
      continue;
    const region_code = String(regionRaw).trim();
    if (!region_code) continue;

    const fmt = String(row[2] ?? "").trim().toLowerCase();
    if (fmt !== "antall" && fmt !== "andel") continue;

    const valuesJson: Record<string, number | null> = {};
    for (const { col, year } of yearCols) {
      valuesJson[String(year)] = parseCell(row[col], fmt);
    }

    for (const { year } of yearCols) {
      rows.push({
        indicator_api_id: indicatorApiId,
        indicator_slug: indicatorSlug,
        indicator_group_slug: INDICATOR_GROUP_SLUG_ZIP,
        indicator_name: indicatorName,
        indicator_title: indicatorTitle,
        link_text: null,
        region_code,
        category_format: fmt,
        year,
        value: valuesJson[String(year)] ?? null,
        values_json: valuesJson,
      });
    }
  }
  return rows;
}
