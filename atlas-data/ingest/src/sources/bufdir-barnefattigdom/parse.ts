/**
 * Pure parsing logic for the bufdir-barnefattigdom ZIP-based ingest.
 *
 * Extracted from `index.ts` so the parser + URL discovery can be exercised by
 * the golden-file test suite at `__tests__/parse.test.ts` without touching
 * HTTP, Postgres, or `process.env`. Keep this file pure — no I/O, no logger,
 * no env-dependent branches.
 *
 * Index.ts owns:
 *   - HTTP fetch (calling discoverZipUrl with the HTML it just downloaded)
 *   - ZIP extraction (handing each workbook's bytes to parseDataSheet)
 *   - Postgres upsert + ingest_run lifecycle
 *
 * This file owns:
 *   - URL discovery from monitor-page HTML (multi-tier with progressive
 *     fallback so a Bufdir filename / hostname change doesn't break ingest)
 *   - XLSX parsing for the per-workbook `Data` sheet
 *   - Norwegian decimal + suppression-marker handling
 *   - Surrogate `indicator_api_id` derivation
 */
import { createHash } from "node:crypto";
import XLSX from "xlsx";

/** One emitted row, before postgres timestamping. */
export type BufdirBarnefattigdomRow = {
  indicator_api_id: string;
  indicator_slug: string;
  indicator_group_slug: string;
  indicator_name: string;
  indicator_title: string;
  link_text: string | null;
  region_code: string;
  category_unit: string;
  category_format: string;
  year: number;
  value: number | null;
  values_json: unknown;
};

/** Fixed bucket replacing Strapi indicator groups for ZIP-backed rows. */
export const INDICATOR_GROUP_SLUG_ZIP = "barnefattigdom_zip";

/**
 * Multi-tier ZIP URL discovery from monitor-page HTML.
 *
 * Strategy: try the most specific pattern first (the URL shape Bufdir ships
 * today), fall back through progressively looser matchers, and report which
 * tier matched. The caller logs `matchTier` so the operator gets early warning
 * when upstream drifts away from the canonical shape — a "loose-bare" hit
 * still works but says "Bufdir's URL format is changing; revisit before the
 * looser matcher itself starts mis-matching."
 *
 * Tiers:
 *   - "canonical": today's shape (`/uploads/YYYY_MM_DD_barnefattigdom_monitor_<hash>.zip`)
 *   - "loose-date-format": YYYY-MM-DD or YYYYMMDD or no date prefix
 *   - "loose-monitor":   any URL containing "barnefattigdom_monitor" + .zip
 *   - "loose-bare":      any URL containing "barnefattigdom" + .zip
 *
 * Hostname is intentionally not constrained — Bufdir has flagged its CDN host
 * (`azurecontainerapps.io`) as something that might move.
 */
export type DiscoveryMatch = {
  url: string;
  matchTier:
    | "canonical"
    | "loose-date-format"
    | "loose-monitor"
    | "loose-bare";
};

const DISCOVERY_TIERS: { name: DiscoveryMatch["matchTier"]; re: RegExp }[] = [
  {
    name: "canonical",
    re: /https:\/\/[^\s"'<>]+\/uploads\/\d{4}_\d{2}_\d{2}_barnefattigdom_monitor_[a-z0-9]+\.zip/i,
  },
  {
    name: "loose-date-format",
    re: /https:\/\/[^\s"'<>]+\/uploads\/[\d_-]*barnefattigdom_monitor[^\s"'<>]*\.zip/i,
  },
  {
    name: "loose-monitor",
    re: /https:\/\/[^\s"'<>]+barnefattigdom_monitor[^\s"'<>]*\.zip/i,
  },
  {
    name: "loose-bare",
    re: /https:\/\/[^\s"'<>]+barnefattigdom[^\s"'<>]*\.zip/i,
  },
];

export function discoverZipUrl(html: string): DiscoveryMatch {
  for (const tier of DISCOVERY_TIERS) {
    const m = html.match(tier.re);
    if (m) return { url: m[0], matchTier: tier.name };
  }
  throw new Error(
    "Could not find any barnefattigdom .zip URL in monitor page HTML — Bufdir likely restructured the page; investigate before retrying.",
  );
}

/** Surrogate `indicator_api_id` from XLSX filename stem (without `.xlsx`). */
export function surrogateIndicatorApiId(workbookStem: string): string {
  const body = createHash("sha256")
    .update(workbookStem, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `bf_zip_${body}`;
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
 * Parse one Bufdir workbook cell into a typed value.
 *
 * - `..` and `.` and blanks → null (Bufdir's suppression marker, SSB convention).
 * - `prosent` Tallformat: Norwegian decimal (`9,2` with leading spaces) → 9.2.
 * - `antall` Tallformat: integer cell.
 * - Returns null if the parse fails (defensive — better null than NaN downstream).
 */
export function parseCell(raw: unknown, tallformat: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === "." || s === "..") return null;
  s = s.replace(/\s/g, "");
  if (tallformat === "prosent") {
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
  throw new Error("No header row starting with Region in Data sheet");
}

/**
 * Indicator title is composed from text rows above the header, joined with
 * ` — ` so multi-line workbook titles round-trip cleanly. Returns
 * "unnamed indicator" when no title rows exist (defensive default).
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
 * Parse one workbook's `Data` sheet into the row stream the ingest writes.
 *
 * Throws if:
 *   - the workbook has no `Data` sheet
 *   - no header row starting with "Region" exists
 *   - no year columns appear after `Tallformat`
 *
 * Skips (without throwing):
 *   - blank rows
 *   - rows where `Enhet` is not in {barn, husholdning}
 *   - rows where `Tallformat` is not in {antall, prosent}
 *
 * One emitted row per (region × unit × format × year) tuple. Each row carries
 * a `values_json` snapshot of the full year-set so downstream consumers can
 * see the whole time series of a slice without re-aggregating.
 */
export function parseDataSheet(
  workbookBytes: Buffer,
  fileBase: string,
): BufdirBarnefattigdomRow[] {
  const stem = fileBase.replace(/\.xlsx$/i, "");
  const indicatorApiId = surrogateIndicatorApiId(stem);
  const slugPart = stem.replace(/^Indikator_\d+[a-z]?_/i, "").trim();
  const humanName = (
    slugPart.replace(/_/g, " ") || stem.replace(/_/g, " ")
  ).trim();
  const indicatorSlug = slugFromIndicatorName(humanName);

  const wb = XLSX.read(workbookBytes, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets["Data"];
  if (!sheet) {
    throw new Error(`${fileBase}: missing Data sheet`);
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
  for (let j = 4; j < headerRow.length; j++) {
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

  const rows: BufdirBarnefattigdomRow[] = [];
  for (let r = hdrIx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row?.length) continue;
    const regionRaw = row[0];
    if (regionRaw === null || regionRaw === undefined || regionRaw === "")
      continue;
    const region_code = String(regionRaw).trim();
    if (!region_code) continue;

    const unit = String(row[2] ?? "").trim().toLowerCase();
    const fmt = String(row[3] ?? "").trim().toLowerCase();
    if (unit !== "barn" && unit !== "husholdning") continue;
    if (fmt !== "antall" && fmt !== "prosent") continue;

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
        category_unit: unit,
        category_format: fmt,
        year,
        value: valuesJson[String(year)] ?? null,
        values_json: valuesJson,
      });
    }
  }
  return rows;
}
