/**
 * Pure parsing logic for the udir-fravar ingest (Udir's "Fravær i
 * grunnskole" — median/average days and hours of documented absence, plus
 * participant count, for 10th-grade pupils only, per kommune, for every
 * available school year). Atlas's fourth Udir source, reusing the same
 * `statistikkportalen.udir.no` client `udir-gsi`/`udir-elevundersokelsen-
 * mobbing`/`udir-nasjonale-prover` already proved out.
 *
 * Verified live 2026-10-03 (PLAN-017-udir-fravar.md Phase 1/2) —
 * ⚠️ **This report's shape matches `udir-gsi`'s and `udir-nasjonale-
 * prover`'s, NOT `udir-elevundersokelsen-mobbing`'s.** Confirmed via the
 * response's own `metadata.rowHierarchy`
 * (`["Nasjonalt","Fylke","Kommune","Enhet"]`) — `EnhetID` IS the row
 * hierarchy here, so the cheap `radSti` depth-by-segment-count technique
 * `udir-gsi` already uses applies directly: one call per year
 * bulk-fetches every kommune nationally (confirmed live: `radSti=-12.*.*`
 * returns 15 fylke rows (2-segment `id`) and 356 kommune rows (3-segment
 * `id`, including Svalbard) in one response).
 *
 * **This report is structurally 10th-grade-only, not a filtered slice of
 * a multi-grade table.** `Rapportside.gyldigeFiltre` carries no `TrinnID`
 * at all, and the report's own description text states why: *"Tabellen
 * viser medianen for antall dager og timer fravær for elever på 10.
 * trinn, slik det er ført på vitnemålet."* There is no `grade` dimension
 * to parse or pass through — unlike `udir-nasjonale-prover`'s multi-grade
 * shape.
 *
 * A genuinely separate sibling report, `VGO_fravaer` (videregående), is
 * NOT covered by this module — confirmed live that its `EnhetID`
 * hierarchy has no kommune level at all (`["Nasjonalt","Fylke","Enhet"]`),
 * a structural fact about how Norway organises videregående skole
 * (fylkeskommune-run, not kommune-run), not a parsing gap. See
 * PLAN-017's [Q4] — deliberately deferred, not silently dropped.
 *
 * ⚠️ `Utlandet` (schools abroad) exists in this report's `EnhetID`
 * hierarchy (same `-13`→`-476`/`2599` chain `udir-nasjonale-prover`
 * found) and carries **real, non-suppressed data every year** — confirmed
 * live (65 real pupils for 2024-25), the same shape
 * `udir-nasjonale-prover` already found, not the empty-response shape
 * this file's Phase 1 research first (wrongly) concluded. ⚠️ **A real
 * correction, caught at the start of Phase 2**: the Phase 1 manual test
 * that produced an apparent zero-row result had an explicit, conflicting
 * `EnhetID(-12)` filter alongside the `-13.*.*` radSti anchor — an
 * invalid combination, not a real empty response. Re-tested without that
 * conflicting filter (matching this module's own `dataUrl`, which never
 * sets `EnhetID` in the filter string, only via `radSti`) and the real
 * data appeared immediately.
 *
 * ⚠️ **Backfills every discovered year, not latest-only.** A real
 * correction made at the start of Phase 2: `udir-gsi`'s own code (not its
 * prose) backfills fully when the call cost is cheap, which this report's
 * cost matches (2 calls/year). See this source's README for the full
 * correction.
 */

export type FravarRow = {
  region_code: string;
  year: number;
  measure: string;
  value: number | null;
};

/** The current report's data endpoint path, resolved dynamically — same shape as udir-gsi's. */
export type ResolvedReport = {
  /** e.g. "rest/v1/Statistikk/GSK/FravaerG/1/1" — data/filterVerdier/filterSpec hang off this. */
  basePath: string;
  /** Udir's own declared "current" school year, e.g. 202506. */
  defaultYearCode: number;
};

/**
 * Resolve the live rapportNr/rapportVersjon and current year from the
 * Rapportside endpoint (GET .../Rapportside/GSK_fravaer). Never hardcode
 * these — report versions advance when Udir republishes.
 *
 * ⚠️ This report's own `filterDefaultVerdier.TidID` is a 3-element trend
 * default (confirmed live: `[202306, 202406, 202506]`), unlike `udir-gsi`'s
 * single-value `TidID` — `TidID[0]` is only ever used here as
 * `filterVerdier`'s own "obligatorisk" anchor value (any one valid year
 * satisfies it) to discover the FULL available-year list; it is never
 * treated as "the current year" by this module, so the 3-vs-1 shape
 * difference does not matter to the result.
 */
export function parseRapportside(json: unknown): ResolvedReport {
  const rappside = (json as any)?.rappside;
  const elementer = rappside?.rapportElementer;
  if (!Array.isArray(elementer) || elementer.length === 0) {
    throw new Error(
      "Rapportside response has no rapportElementer — Udir likely restructured GSK_fravaer; investigate before retrying.",
    );
  }
  const dataEndepunkt: string | undefined = elementer[0]?.dataEndepunkt;
  if (!dataEndepunkt || typeof dataEndepunkt !== "string") {
    throw new Error("Rapportside response's first rapportElement has no dataEndepunkt.");
  }
  const basePath = dataEndepunkt.replace(/\/data$/, "");
  if (basePath === dataEndepunkt) {
    throw new Error(`dataEndepunkt "${dataEndepunkt}" did not end in "/data" as expected.`);
  }

  const defaultYearCode = rappside?.filterDefaultVerdier?.TidID?.[0];
  if (typeof defaultYearCode !== "number") {
    throw new Error("Rapportside response has no filterDefaultVerdier.TidID[0] (current year).");
  }

  return { basePath, defaultYearCode };
}

/**
 * Extract every valid school-year code from a filterVerdier response — not
 * a hardcoded range. Confirmed live: 11 years (2014-15 through 2024-25) —
 * all of them are backfilled (see this file's header), not just the latest.
 */
export function parseAvailableYears(json: unknown): number[] {
  const tidId = (json as any)?.TidID;
  if (!Array.isArray(tidId) || tidId.length === 0) {
    throw new Error("filterVerdier response has no TidID list — cannot discover available years.");
  }
  const years = tidId
    .map((t: any) => t?.id)
    .filter((id: unknown): id is number => typeof id === "number");
  if (years.length === 0) {
    throw new Error("filterVerdier TidID list parsed to zero numeric year codes.");
  }
  return years.sort((a, b) => a - b);
}

/**
 * One cell's value. Udir's own suppression marker is the literal character
 * `*` — same convention as every Atlas source this session. Handles both
 * real cell shapes seen live: a Norwegian-decimal-comma figure (e.g.
 * "9,0") and a plain-ASCII-space-thousands-separated integer (e.g.
 * "4 277"), same technique `udir-nasjonale-prover`'s own `parseCell`
 * already uses.
 */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "*") return null;
  const n = Number.parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one year's `GSK_fravaer` data response (fetched with
 * `EierformID(-10)_KjoennID(-10)_VisAntallPersoner(1)_VisMaaltall(1)`
 * pinned and `inkluderKoder=true`). Same depth-by-segment-count technique
 * `udir-gsi`/`udir-nasjonale-prover` already use: a row is kept iff its
 * own `id` has exactly 3 dot-separated segments (fylke-level rows have 2).
 *
 * ⚠️ A GENUINELY EMPTY RESPONSE (`metadata.columns: []`, `rows: []`) IS
 * NOT AN ERROR — this is defensive, matching the convention
 * `udir-nasjonale-prover` established for its own real 9th-grade-English
 * case. No real combination has been found empty for THIS report (the
 * `Utlandet` anchor turned out to carry real data every year — see this
 * file's header), but the guard stays as a defensive case rather than an
 * assumption that no future combination will ever be empty.
 *
 * A kommune can also be entirely ABSENT from the row set without the
 * response being empty overall (confirmed live: Utsira, likely too small
 * a 10th-grade cohort to report that year) — this is the same "real
 * absence, not suppression" shape as a fully-suppressed row (literal `*`
 * on every measure, confirmed live on Modalen); this function does not
 * special-case either, it just represents whatever Udir returned.
 */
export function parseFravarData(json: unknown, year: number): FravarRow[] {
  const columns = (json as any)?.metadata?.columns;
  const rows = (json as any)?.rows;
  if (Array.isArray(columns) && columns.length === 0 && Array.isArray(rows) && rows.length === 0) {
    return []; // genuinely nothing to report for this year/anchor — see this function's header comment
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`Fravær data response for year ${year} has no metadata.columns.`);
  }
  const measureLevel = columns[columns.length - 1];
  if (!Array.isArray(measureLevel) || measureLevel.length === 0) {
    throw new Error(`Fravær data response for year ${year} has an empty measure column level.`);
  }
  const measureNames: string[] = measureLevel.map((c: any) => c?.name);
  if (measureNames.some((n) => typeof n !== "string" || !n)) {
    throw new Error(`Fravær data response for year ${year} has an unnamed measure column.`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`Fravær data response for year ${year} has no rows array.`);
  }

  const out: FravarRow[] = [];
  for (const row of rows) {
    const id: string | undefined = row?.id;
    const kode: string | undefined = row?.kode;
    if (typeof id !== "string" || typeof kode !== "string") continue;
    const depth = id.split(".").length;
    if (depth !== 3) continue; // not a kommune-level row (fylke=2, school=4)

    const data: unknown[] = row?.data;
    if (!Array.isArray(data) || data.length !== measureNames.length) {
      throw new Error(
        `Row "${kode}" for year ${year} has ${Array.isArray(data) ? data.length : "no"} data cells, expected ${measureNames.length} (one per measure) — layout may have changed.`,
      );
    }

    for (let i = 0; i < measureNames.length; i++) {
      out.push({
        region_code: kode,
        year,
        measure: measureNames[i]!,
        value: parseCell(String(data[i])),
      });
    }
  }

  return out;
}
