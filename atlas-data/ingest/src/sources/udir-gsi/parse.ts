/**
 * Pure parsing logic for the udir-gsi ingest (Udir's GSI — Grunnskolens
 * informasjonssystem: pupil counts, special-ed/Norwegian-reinforcement
 * counts, and school counts, per kommune, per school year).
 *
 * Verified live 2026-10-02 (PLAN-010-udir-gsi.md Phase 1/2) — a real,
 * Swagger-documented API ("USS — Udirs StatistikkSystem") at
 * statistikkportalen.udir.no/api/rapportering, distinct from the DEAD
 * hostname (api.udir-statistikkbanken.no) Udir's own public docs name.
 * ⚠️ The API's own Swagger description says it is "not intended for
 * external use today, and will change without notice" — treat a shape
 * change as an expected failure mode, not a surprise.
 *
 * Nothing here is hardcoded that the API can tell us dynamically:
 * - the current rapportNr/rapportVersjon come from the Rapportside endpoint
 *   (a prior pass hardcoded version 1 and would have silently queried a
 *   stale report — the live report is version 8, confirmed 2026-10-02)
 * - the set of valid school years comes from filterVerdier's own TidID list
 *
 * Scope: kommune-level, grand-total slice only (TrinnID/KjoennID/
 * KommunalitetID all pinned to -10, the "alle"/all sentinel) — not the
 * full trinn × kjønn × eierform cross-tab the raw API can return. See
 * PLAN-010's [Q2] for why: this is Atlas's first sub-kommune-CAPABLE source
 * but deliberately does not ingest at school level, and even at kommune
 * level the full cross-tab is ~420 columns per kommune per year for one
 * report alone — far more than Report #10 (the stated consumer) needs.
 * Pinning the three breakdown filters collapses the response to exactly 4
 * measure columns (confirmed live), which is what this module parses.
 */

export type GsiRow = {
  region_code: string;
  year: number;
  measure: string;
  value: number | null;
};

/** The current report's data endpoint path, resolved dynamically. */
export type ResolvedReport = {
  /** e.g. "rest/v1/Statistikk/GSK/GSI/1/8" — data/filterVerdier/filterSpec hang off this. */
  basePath: string;
  /** Udir's own declared "current" school year, e.g. 202510. */
  defaultYearCode: number;
};

/**
 * Resolve the live rapportNr/rapportVersjon and current year from the
 * Rapportside endpoint (GET .../Rapportside/GSK_Elev_Skol). Never hardcode
 * these — report versions advance when Udir republishes.
 */
export function parseRapportside(json: unknown): ResolvedReport {
  const rappside = (json as any)?.rappside;
  const elementer = rappside?.rapportElementer;
  if (!Array.isArray(elementer) || elementer.length === 0) {
    throw new Error(
      "Rapportside response has no rapportElementer — Udir likely restructured GSK_Elev_Skol; investigate before retrying.",
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
 * Extract every valid school-year code from a filterVerdier response.
 * One API call (with any one concrete TidID value, to satisfy TidID's own
 * "obligatorisk" requirement) returns the FULL valid-value list for every
 * filter dimension in the response, not just the one that was wildcarded —
 * this is how all available years are discovered without hardcoding a range.
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
 * GSI's own suppression marker is the literal character `*` — the same
 * convention `nav-uforetrygd` uses, different from IMDi's `:` and the
 * Bufdir sources' `..`/`.`. Confirmed live on real small kommuner (Træna,
 * Utsira) where individually-tailored-instruction and Norwegian-
 * reinforcement counts are suppressed while the plain pupil/school counts
 * are not.
 */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "*") return null;
  const n = Number.parseInt(s.replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one year's GSI data response at the third hierarchy level (fetched
 * with TrinnID(-10)_KjoennID(-10)_KommunalitetID(-10) pinned and
 * inkluderKoder=true — see this file's header for why).
 *
 * Row identification: each row carries its own hierarchy path as a
 * dot-separated `id` (e.g. "1.49" for a fylke, "1.49.1423" for the next
 * level down) — NOT a usable code itself, which only appears in the `kode`
 * field (present because inkluderKoder=true was passed). A row is kept iff
 * its `id` has exactly 3 dot-separated segments; fylke rows (2 segments)
 * are mixed into the same response by the `-12.*.*` radSti and must be
 * filtered out, not summed in.
 *
 * ⚠️ "3 segments deep" is NOT the same claim as "is a real kommune" — field
 * named `region_code`, not `kommune_nr`, for exactly this reason.
 * Verified live: `2100` ("Svalbard") and `2111` sit at the same tree depth
 * as genuine kommuner (GSI reports Longyearbyen skole under a pseudo-kommune
 * node), matching the known SSB `21\d{2}` Svalbard pattern this project's
 * `classify_region_code` macro already handles — resolve `kommune_nr`
 * through that macro in the indicators model, never by assuming every
 * 4-digit code here is one.
 *
 * Measure names come directly from the response's own column metadata
 * (`metadata.columns`, last level) — with the three breakdown filters
 * pinned, this collapses to exactly one entry per measure, so no separate
 * Tekst-lookup round trip is needed to name them (a Phase 1 assumption
 * that turned out to be unnecessary once the right query shape was found).
 */
export function parseGsiData(json: unknown, year: number): GsiRow[] {
  const metadata = (json as any)?.metadata;
  const columns = metadata?.columns;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`GSI data response for year ${year} has no metadata.columns.`);
  }
  const measureLevel = columns[columns.length - 1];
  if (!Array.isArray(measureLevel) || measureLevel.length === 0) {
    throw new Error(`GSI data response for year ${year} has an empty measure column level.`);
  }
  const measureNames: string[] = measureLevel.map((c: any) => c?.name);
  if (measureNames.some((n) => typeof n !== "string" || !n)) {
    throw new Error(`GSI data response for year ${year} has an unnamed measure column.`);
  }

  const rows = (json as any)?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`GSI data response for year ${year} has no rows array.`);
  }

  const out: GsiRow[] = [];
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
