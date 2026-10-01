/**
 * Pure parsing logic for the imdi-bosetting ingest (IMDi's kommune-level
 * refugee resettlement figures — requested, decided, settled, and
 * settled-with-collective-protection counts, per kommune, per year).
 *
 * Extracted from `index.ts` so discovery + the table parser can be exercised
 * by the golden-file test suite without touching HTTP or Postgres. Keep this
 * file pure — no I/O, no logger, no env-dependent branches.
 *
 * Verified live 2026-10-01 (PLAN-009-imdi-bosetting.md Phase 1) — static,
 * server-rendered HTML (no SPA, no client-side rendering), unlike the NAV
 * sources. IMDi publishes **kommune names, not codes** — `kommune_nr`
 * resolution happens downstream via `crosswalk_kommune_name`, not in this
 * module; there is no upstream code to extract. IMDi's own fylke groupings
 * are not stable across years (pre- vs post-2024-reform names), so fylke is
 * deliberately not captured here either — see the manifest's own notes.
 */
import * as cheerio from "cheerio";

export type Metric =
  | "anmodet"
  | "vedtatt"
  | "bosatte"
  | "bosatte_kollektiv_beskyttelse"
  | "avtalt"
  | "avtalt_kollektiv_beskyttelse";

/**
 * Column count is NOT fixed across this source's own history: verified live
 * 2026-10-01 against all 5 then-discoverable years — 2022/2023/2025 tables
 * have 5 columns (Kommune + 4 metrics); 2024 has 5 for every fylke EXCEPT
 * Oslo, whose table alone carries 2 extra columns ("avtalt" / agreed-to-
 * resettle, and its collective-protection split); 2026 (the in-progress
 * current year) has all 7 columns on every one of its 15 fylke tables. This
 * reads as IMDi piloting the two new columns on Oslo in 2024 before rolling
 * them out everywhere in 2026 — not corrected or normalized away; both
 * "avtalt" rows and years without them are published as IMDi published them.
 *
 * Mapping is therefore by header TEXT, not position — a table emits exactly
 * the metrics whose header it actually has. An unrecognized header throws
 * rather than silently misaligning columns.
 */
const HEADER_TO_METRIC: Record<string, Metric> = {
  "Antall personer kommunen har blitt anmodet om å bosette:": "anmodet",
  "Antall personer kommunen har vedtatt å bosette:": "vedtatt",
  "Antall bosatte personer:": "bosatte",
  "Antall bosatte personer med kollektiv beskyttelse:": "bosatte_kollektiv_beskyttelse",
  "Antall personer kommunen har avtalt å bosette:": "avtalt",
  "Antall personer med kollektiv beskyttelse kommunen har avtalt å bosette:":
    "avtalt_kollektiv_beskyttelse",
};

export type ImdiBosettingRow = {
  kommune_name: string;
  year: number;
  metric: Metric;
  value: number | null;
};

/**
 * Discover every `/bosetting/bosettingstall/nokkeltall-bosetting-<YYYY>/`
 * link on the hub page. Discover, don't hardcode a year range — a future
 * year appearing on the hub is picked up automatically, same as every other
 * source's URL discovery this project uses.
 */
export type YearPage = {
  year: number;
  path: string;
};

const YEAR_LINK_RE = /\/bosetting\/bosettingstall\/nokkeltall-bosetting-(\d{4})\/?/i;

export function discoverYearPages(hubHtml: string): YearPage[] {
  const $ = cheerio.load(hubHtml);
  const seen = new Map<number, string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const m = href.match(YEAR_LINK_RE);
    if (!m) return;
    const year = Number(m[1]);
    const path = `/bosetting/bosettingstall/nokkeltall-bosetting-${m[1]}/`;
    seen.set(year, path);
  });
  if (seen.size === 0) {
    throw new Error(
      "Could not find any nokkeltall-bosetting-<YYYY> link on the hub page — IMDi likely restructured the page; investigate before retrying.",
    );
  }
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, path]) => ({ year, path }));
}

/**
 * IMDi's own suppression marker is the literal string `:` — explained
 * inline on the page itself: *"Dette betyr at tallet er fjernet av
 * personvernhensyn"* (the number has been removed for privacy reasons,
 * usually fewer than 5 people in that cell). Different from every other
 * source ingested this session (`*` for NAV, `..`/`.` for SSB/Bufdir).
 *
 * A cell can also hold free text instead of a suppression marker or a number
 * — confirmed live 2026-10-01, Moskenes' 2024 "bosatte" cell reads "avventer
 * vedtak" (awaiting a decision) rather than `:` or a count. Not a second
 * suppression convention to special-case: `Number.parseInt` on non-numeric
 * text already returns `NaN`, which this function already maps to `null` —
 * any unparseable cell becomes null, whatever its text says.
 */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === ":") return null;
  const n = Number.parseInt(s.replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse the kommune-level resettlement tables for one year's page.
 *
 * Finds the `<h2>` whose text starts with `"Oversikt over bosettingen i
 * kommunene i <year>"` (the live current-year page appends `"(oppdatert
 * <date>)"` to this heading — match the fixed prefix, not an exact string).
 * A current-year page also has a *separate* `"anmodning"` (request-only)
 * section elsewhere on the page — deliberately not matched here; this
 * function only resolves the one heading whose prefix names "bosettingen",
 * so the separate section is never visited regardless of its own shape.
 *
 * Every `<table>` between that heading and the next `<h2>` is one fylke's
 * kommune table, first column always "Kommune". The remaining columns are
 * resolved by header TEXT via `HEADER_TO_METRIC` (see that map's own comment
 * for why — column count genuinely varies by table). An unrecognized header
 * throws rather than silently dropping or misaligning a metric.
 */
export function parseKommuneTables(html: string, year: number): ImdiBosettingRow[] {
  const $ = cheerio.load(html);

  const heading = $("h2")
    .filter((_, el) => {
      const text = $(el).text().trim();
      return text.startsWith(`Oversikt over bosettingen i kommunene i ${year}`);
    })
    .first();

  if (heading.length === 0) {
    throw new Error(
      `No "Oversikt over bosettingen i kommunene i ${year}" heading found — IMDi likely restructured the page; investigate before retrying.`,
    );
  }

  const tables = heading.nextUntil("h2").filter("table");
  if (tables.length === 0) {
    throw new Error(
      `Found the "${year}" kommune heading but no tables followed it before the next heading.`,
    );
  }

  const rows: ImdiBosettingRow[] = [];

  tables.each((_, table) => {
    const $table = $(table);
    const headerTexts = $table
      .find("thead th")
      .map((_, th) => $(th).text().trim())
      .get();

    if (headerTexts[0] !== "Kommune") {
      throw new Error(
        `A ${year} kommune table's first header is "${headerTexts[0]}", expected "Kommune" — layout may have changed.`,
      );
    }
    if (headerTexts.length < 2) {
      throw new Error(`A ${year} kommune table has no metric columns beyond "Kommune".`);
    }

    const metricColumns = headerTexts.slice(1).map((text) => {
      const metric = HEADER_TO_METRIC[text];
      if (!metric) {
        throw new Error(
          `A ${year} kommune table has an unrecognized header "${text}" — IMDi likely added a new metric; map it in HEADER_TO_METRIC before retrying.`,
        );
      }
      return metric;
    });

    $table.find("tbody tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length !== metricColumns.length + 1) return; // skip malformed rows rather than throw mid-stream
      const kommuneName = $(cells[0]).text().trim();
      if (!kommuneName) return;

      for (let i = 0; i < metricColumns.length; i++) {
        const cellText = $(cells[i + 1]).text();
        rows.push({
          kommune_name: kommuneName,
          year,
          metric: metricColumns[i]!,
          value: parseCell(cellText),
        });
      }
    });
  });

  return rows;
}
