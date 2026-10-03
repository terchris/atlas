/**
 * Pure parsing logic for the udir-elevundersokelsen-mobbing ingest (Udir's
 * Elevundersøkelsen — pupil survey — bullying ("mobbing") indicator and its
 * three underlying questions, per kommune, per grade (7th and 10th), per
 * school year). Atlas's second Udir source, reusing the same
 * statistikkportalen.udir.no ("USS — Udirs StatistikkSystem") client
 * `udir-gsi` already proved out.
 *
 * Verified live 2026-10-03 (PLAN-015-udir-elevundersokelsen-mobbing.md
 * Phase 1/2) — ⚠️ **NOT the same response shape as `udir-gsi`, despite
 * sharing one client.** `udir-gsi`'s `EnhetID` (geography) IS its row
 * hierarchy, filtered to kommune depth by `radSti`. For this report,
 * `EnhetID` is a pure filter/column dimension: `rowHierarchy` is
 * `["Indikator","Spørsmål"]` (confirmed live — a 3-level `radSti` errors
 * with "For dyp radsti: for denne rapporten støttes maksimalt 2 nivåer").
 *
 * **[Q1] resolved — one HTTP call per region node per grade, not a bulk
 * wildcard-and-decode call.** A wildcarded `EnhetID` (e.g. via `radSti`)
 * returns the entire national column tree nested fylke→kommune→school in
 * one response, but whether a kommune's own aggregate is a distinct leaf
 * inside that tree (separate from its individual schools) was never
 * confirmed — decoding it on that unverified assumption risks silently
 * extracting one school's figure as the kommune's. A **specific,
 * non-wildcarded** `EnhetID` filter value collapses the response to
 * **exactly one column, labelled "Alle skoler"** — confirmed live this is
 * the kommune's own aggregate, not a drill into a school, by comparing
 * against the national tree's column structure for the same kommune. This
 * module therefore makes one call per region node (region_code discovered
 * from `filterVerdier`'s own `EnhetID` list, nivaa 3) per grade.
 *
 * ⚠️ `TrinnID(-10)` is NOT "alle" for this report, unlike `udir-gsi`'s
 * `-10`-means-"alle" sentinel for `KommunalitetID`. `TrinnID`'s real
 * `filterVerdier` only lists ids `4`-`9` (grades 5-10) — no "alle" option.
 * Passing `-10` did not error; it silently returned the LAST value in the
 * report's own default list (`[6,9]` → grade 10) without flagging anything
 * wrong, caught only by cross-checking against an explicit `TrinnID(9)`
 * call. Always pass an explicit grade id — see `GRADE_TO_TRINN_ID` below.
 * `TrinnID(6,9)` (comma-joined, both grades in one call) is a genuine 400 —
 * one call per grade, matching `fhi-mobbing`'s own established 7th+10th
 * axis, which is also why that's this source's v1 scope.
 */

export type MobbingRow = {
  region_code: string;
  grade: number;
  year: number;
  measure: string;
  measure_label: string;
  value: number | null;
};

/** Real grade number -> Udir's internal TrinnID id. Confirmed live: id 6 -> "7. årstrinn", id 9 -> "10. årstrinn". */
export const GRADE_TO_TRINN_ID: Record<number, number> = {
  7: 6,
  10: 9,
};

/** The expected column label for each grade, used as a defensive cross-check against the response. */
const GRADE_COLUMN_LABEL: Record<number, string> = {
  7: "7. årstrinn",
  10: "10. årstrinn",
};

/** The current report's data endpoint path, resolved dynamically — same shape as udir-gsi's. */
export type ResolvedReport = {
  /** e.g. "rest/v1/Statistikk/GSK/EUG/5/5" — data/filterVerdier/filterSpec hang off this. */
  basePath: string;
  /** Udir's own declared "current" school year, e.g. 202512. */
  defaultYearCode: number;
};

/**
 * Resolve the live rapportNr/rapportVersjon and current year from the
 * Rapportside endpoint (GET .../Rapportside/GSK_EUG_mobbing). Never
 * hardcode these — report versions advance when Udir republishes.
 *
 * ⚠️ The classic `ElevundersoekelsenG`-table Rapportside (`GSK_EU_mobbing`)
 * is a RETIRED predecessor — its own `filterDefaultVerdier.TidID` is frozen
 * at `[201901, 202001, 202101]`. Fetch `GSK_EUG_mobbing` (the live `EUG`
 * table), not the classic one — confirmed live 2026-10-03.
 */
export function parseRapportside(json: unknown): ResolvedReport {
  const rappside = (json as any)?.rappside;
  const elementer = rappside?.rapportElementer;
  if (!Array.isArray(elementer) || elementer.length === 0) {
    throw new Error(
      "Rapportside response has no rapportElementer — Udir likely restructured GSK_EUG_mobbing; investigate before retrying.",
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
 * Extract every valid school-year code from a filterVerdier response — same
 * discovery convention as udir-gsi, not hardcoded.
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

export type RegionNode = {
  /** Internal EnhetID — what the data-call filter needs, e.g. -720 for Arendal. */
  id: number;
  /** The real region code, e.g. "4203" (Arendal), "2100" (Svalbard pseudo-kommune), "2599" (Utlandet, uspesifisert). */
  kode: string;
  navn: string;
};

/**
 * Extract every "kommune-equivalent" node (EnhetID hierarchy nivaa 3) from a
 * filterVerdier response — one API call's `EnhetID` list already covers the
 * whole country (not scoped to whatever single value was in the request),
 * same "discover once" convention as `udir-gsi`'s year discovery.
 *
 * ⚠️ 351 nodes confirmed live, not ~357-359 like every other kommune-grain
 * source — Elevundersøkelsen's own EnhetID tree only includes a kommune if
 * at least one of its schools reports into this specific table that year; a
 * kommune with literally nothing to report is absent from the tree, not
 * present-and-suppressed. Represent exactly what the tree contains; do not
 * assume every SSB kommune code must appear.
 *
 * ⚠️ `region_code` here is NOT always a real kommune, same discipline as
 * `udir-gsi`. Confirmed live: `2100` (Svalbard, matching `udir-gsi`'s own
 * finding at the identical API hierarchy depth) and `2599` ("Utlandet,
 * uspesifisert" — Norwegian schools abroad, reporting under the fylke-level
 * sibling `"Utlandet"`, kode `"25"` — ⚠️ the retired pre-2024 Finnmark fylke
 * code, a real collision, though fylke-level codes are out of scope for
 * this kommune-grain source). `region_kind` is resolved downstream via
 * `classify_region_code`, never assumed from this list alone.
 */
export function parseRegionNodes(json: unknown): RegionNode[] {
  const enhetId = (json as any)?.EnhetID;
  if (!Array.isArray(enhetId) || enhetId.length === 0) {
    throw new Error("filterVerdier response has no EnhetID list — cannot discover region nodes.");
  }
  const nodes: RegionNode[] = [];
  for (const e of enhetId) {
    if (e?.nivaa !== 3) continue;
    const id = e?.id;
    const kode = e?.kode;
    const navn = e?.navn;
    if (typeof id !== "number" || typeof kode !== "string" || typeof navn !== "string") continue;
    nodes.push({ id, kode, navn });
  }
  if (nodes.length === 0) {
    throw new Error("filterVerdier EnhetID list parsed to zero nivaa-3 (kommune-equivalent) nodes.");
  }
  return nodes;
}

/**
 * Udir's own suppression marker is the literal character `*` — same
 * convention as `udir-gsi`/`nav-uforetrygd`/every NAV source this session.
 * Confirmed live on Bykle (Norway's smallest kommune by population) and on
 * Svalbard, both fully suppressed for 10th grade 2025-26.
 */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "*") return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one region/grade/year's data response. Every filter dimension is
 * pinned to a single value (no wildcarding), so each row's `data` array has
 * exactly one cell — confirmed live. Rows are the indicator ("Mobbing på
 * skolen") plus its three underlying survey questions; `kode` is a stable
 * identifier the API provides directly (e.g. "EUIndeks_1398",
 * "EUSpoersmaal_Q11811") — unlike `udir-gsi`, which only had a human
 * label, no stable code, at the measure level.
 *
 * Defensive cross-check: the response's own column metadata names the
 * grade column (e.g. "10. årstrinn") — verified to match the grade this
 * call asked for, catching a silently-wrong grade the way Phase 1's
 * `TrinnID(-10)` investigation found one.
 *
 * ⚠️ A GENUINELY EMPTY RESPONSE (`metadata.columns: []`, `rows: []`) IS NOT
 * AN ERROR — confirmed live on Hægebostad (kommune 4226), which has real
 * 7th-grade data (suppressed, `*`) but ZERO 10th-grade data: the kommune's
 * schools simply have no qualifying 10th-grade (ungdomsskole) cohort in
 * this survey/year at all. This is a real, legitimate "nothing to report"
 * outcome, distinct from suppression (which still carries the column, with
 * `*` cells) — represented here as zero rows for that region/grade, not an
 * exception. The grade-label cross-check below still throws for the
 * DIFFERENT case — a non-empty response missing the expected label — which
 * is the actual wrong-grade-resolution defect class this guard exists for.
 */
export function parseMobbingData(json: unknown, regionCode: string, grade: number, year: number): MobbingRow[] {
  const expectedLabel = GRADE_COLUMN_LABEL[grade];
  if (!expectedLabel) {
    throw new Error(`parseMobbingData called with unknown grade ${grade} — expected 7 or 10.`);
  }

  const columns = (json as any)?.metadata?.columns;
  const rows = (json as any)?.rows;
  if (Array.isArray(columns) && columns.length === 0 && Array.isArray(rows) && rows.length === 0) {
    return []; // genuinely nothing to report for this region/grade — see this function's header comment
  }

  if (!Array.isArray(columns)) {
    throw new Error(`Data response for region ${regionCode} grade ${grade} year ${year} has no metadata.columns.`);
  }
  const gradeLevel = columns.find((level: unknown) => {
    return Array.isArray(level) && level.some((c: any) => typeof c?.name === "string" && c.name === expectedLabel);
  });
  if (!gradeLevel) {
    throw new Error(
      `Data response for region ${regionCode} grade ${grade} year ${year} does not carry the expected "${expectedLabel}" column — the grade filter may have silently resolved to the wrong grade (see this file's header comment on TrinnID(-10)).`,
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Data response for region ${regionCode} grade ${grade} year ${year} has no rows.`);
  }

  const out: MobbingRow[] = [];
  for (const row of rows) {
    const kode: string | undefined = row?.kode;
    const navn: string | undefined = row?.navn;
    const data: unknown[] = row?.data;
    if (typeof kode !== "string" || typeof navn !== "string") continue;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error(
        `Row "${kode}" for region ${regionCode} grade ${grade} year ${year} has ${Array.isArray(data) ? data.length : "no"} data cells, expected exactly 1 — layout may have changed.`,
      );
    }
    out.push({
      region_code: regionCode,
      grade,
      year,
      measure: kode,
      measure_label: navn,
      value: parseCell(String(data[0])),
    });
  }

  return out;
}
