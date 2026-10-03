/**
 * Pure parsing logic for the udir-nasjonale-prover ingest (Udir's Nasjonale
 * prøver — national test — scale-score results, uncertainty margin, and
 * participant count, per kommune, per grade (5th, 8th, 9th), per subject
 * (engelsk/lesing/regning), for the latest school year). Atlas's third
 * Udir source, reusing the same `statistikkportalen.udir.no` client
 * `udir-gsi`/`udir-elevundersokelsen-mobbing` already proved out.
 *
 * Verified live 2026-10-03 (PLAN-016-udir-nasjonale-prover.md Phase 1/2) —
 * ⚠️ **This report's shape matches `udir-gsi`'s, NOT
 * `udir-elevundersokelsen-mobbing`'s.** Confirmed via the response's own
 * `metadata.rowHierarchy` (`["Nasjonalt","Fylke","Kommune","Enhet"]`) —
 * `EnhetID` IS the row hierarchy here, so the cheap `radSti`
 * depth-by-segment-count technique `udir-gsi` already uses applies
 * directly: one call per grade/subject/year combination bulk-fetches every
 * kommune nationally (confirmed live: `radSti=-12.*.*` returns 15 fylke
 * rows (2-segment `id`) and 356 kommune rows (3-segment `id`) in one
 * response). Do not port `udir-elevundersokelsen-mobbing`'s
 * per-region-call technique here; it does not apply.
 *
 * **Two separate report versions feed one conceptual dataset — query both
 * under one source.** `NasjonaleProever/1/1` covers 8th+9th grade
 * ("ungdomstrinn"); `NasjonaleProever/4/1` covers 5th grade only — same
 * table name, genuinely different report version and basePath, confirmed
 * live via each one's own Rapportside definition. ⚠️ **The 5th-grade
 * report's own `Rapportside.gyldigeFiltre` omits `TrinnID` — but its
 * `filterVerdier` response still carries one real `TrinnID` entry (grade
 * 5), and passing it explicitly to the data endpoint succeeds.**
 * `gyldigeFiltre` describes the UI's own valid-filter list, not what the
 * data endpoint actually accepts — do not special-case "this report has
 * no TrinnID" from it; `parseTrinnOptions` discovers grade uniformly from
 * `filterVerdier` for both reports.
 *
 * ⚠️ `Utlandet` (schools abroad) sits under its OWN top-level node (`id
 * -13`), a SIBLING of `Hele landet` (`id -12`), not a descendant —
 * `radSti=-12.*.*` does not reach it (confirmed live: absent from that
 * call's 371 rows). A second call per combination, `radSti=-13.*.*`, is
 * required — and it carries real, non-suppressed data (73 real pupils at
 * `Utlandet, uspesifisert`/`2599`), so v1 includes it. Neither `udir-gsi`
 * nor `udir-elevundersokelsen-mobbing` needed this second anchor.
 *
 * Grade and subject come from `filterVerdier`'s own `TrinnID`/`ProevetypeID`
 * lists — their `kode` field is already the real grade number ("8"/"9") or
 * the real subject code ("NPENG"/"NPLES"/"NPREG"), not a label requiring a
 * lookup table, unlike `udir-gsi`'s measure names.
 *
 * ⚠️ Not every grade×subject combination is valid — English exists only at
 * 8th grade, not 9th (confirmed live: the combination returns a genuinely
 * empty response, `{"columns":[],"rows":[]}`, same "real absence, not
 * suppression" shape `udir-elevundersokelsen-mobbing` found on
 * Hægebostad's 10th grade). This module does not hardcode which
 * combinations are valid — it iterates every discovered TrinnID ×
 * ProevetypeID pair and represents an empty result as zero rows, not an
 * error, so a future addition or removal of a valid combination by Udir
 * is picked up automatically rather than silently mis-filtered.
 */

export type ProeverRow = {
  region_code: string;
  grade: number;
  subject: string;
  year: number;
  measure: string;
  value: number | null;
};

/** The current report's data endpoint path, resolved dynamically — same shape as udir-gsi's. */
export type ResolvedReport = {
  /** e.g. "rest/v1/Statistikk/GSK/NasjonaleProever/1/1" — data/filterVerdier/filterSpec hang off this. */
  basePath: string;
  /** Udir's own declared "current" school year, e.g. 20252026. */
  defaultYearCode: number;
};

/**
 * Resolve the live rapportNr/rapportVersjon and current year from a
 * Rapportside endpoint. Never hardcode these — report versions advance
 * when Udir republishes. Shared helper for both report versions this
 * source queries (`GSK_NP_Geografisk` and `GSK_NP_Geo_Trinn5`).
 */
export function parseRapportside(json: unknown): ResolvedReport {
  const rappside = (json as any)?.rappside;
  const elementer = rappside?.rapportElementer;
  if (!Array.isArray(elementer) || elementer.length === 0) {
    throw new Error(
      "Rapportside response has no rapportElementer — Udir likely restructured this Nasjonale prøver report; investigate before retrying.",
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

  const defaultYearCode = rappside?.filterDefaultVerdier?.SkoleAarID?.[0];
  if (typeof defaultYearCode !== "number") {
    throw new Error("Rapportside response has no filterDefaultVerdier.SkoleAarID[0] (current year).");
  }

  return { basePath, defaultYearCode };
}

/** Extract every valid school-year code from a filterVerdier response — not a hardcoded range. */
export function parseAvailableYears(json: unknown): number[] {
  const skoleAarId = (json as any)?.SkoleAarID;
  if (!Array.isArray(skoleAarId) || skoleAarId.length === 0) {
    throw new Error("filterVerdier response has no SkoleAarID list — cannot discover available years.");
  }
  const years = skoleAarId
    .map((t: any) => t?.id)
    .filter((id: unknown): id is number => typeof id === "number");
  if (years.length === 0) {
    throw new Error("filterVerdier SkoleAarID list parsed to zero numeric year codes.");
  }
  return years.sort((a, b) => a - b);
}

export type TrinnOption = {
  /** Internal TrinnID filter value. */
  id: number;
  /** The real grade number — this report's own `kode` field, e.g. 8 or 9. */
  grade: number;
};

/**
 * Discover valid grades from a filterVerdier response's TrinnID list.
 *
 * ⚠️ `filterVerdier` returns the full discovered list for EVERY call, even
 * for a report whose own `Rapportside.gyldigeFiltre` does not list
 * `TrinnID` at all — confirmed live: the 5th-grade report's `gyldigeFiltre`
 * omits `TrinnID`, but its `filterVerdier` response still carries exactly
 * one `TrinnID` entry (`{id:4, kode:"5"}`), and passing `TrinnID(4)`
 * explicitly to that report's own data endpoint succeeds and returns the
 * identical result to omitting it. **Do not special-case "this report has
 * no TrinnID" from `gyldigeFiltre`** — this function and its caller
 * uniformly discover and pass TrinnID for every report, which is both
 * simpler and verified-correct rather than assumed from a UI-facing field
 * that turned out not to describe what the data endpoint actually accepts.
 */
export function parseTrinnOptions(json: unknown): TrinnOption[] {
  const trinnId = (json as any)?.TrinnID;
  if (!Array.isArray(trinnId)) return [];
  const out: TrinnOption[] = [];
  for (const t of trinnId) {
    const id = t?.id;
    const grade = Number.parseInt(String(t?.kode), 10);
    if (typeof id === "number" && Number.isFinite(grade)) out.push({ id, grade });
  }
  return out;
}

export type ProevetypeOption = {
  /** Internal ProevetypeID filter value. */
  id: number;
  /** The real subject code — this report's own `kode` field, e.g. "NPLES". */
  subject: string;
};

/** Discover valid subjects from a filterVerdier response's ProevetypeID list. */
export function parseProevetypeOptions(json: unknown): ProevetypeOption[] {
  const proevetypeId = (json as any)?.ProevetypeID;
  if (!Array.isArray(proevetypeId) || proevetypeId.length === 0) {
    throw new Error("filterVerdier response has no ProevetypeID list — cannot discover available subjects.");
  }
  const out: ProevetypeOption[] = [];
  for (const p of proevetypeId) {
    const id = p?.id;
    const subject = p?.kode;
    if (typeof id === "number" && typeof subject === "string") out.push({ id, subject });
  }
  if (out.length === 0) {
    throw new Error("filterVerdier ProevetypeID list parsed to zero valid subject codes.");
  }
  return out;
}

/**
 * One cell's value. Udir's own suppression marker is the literal character
 * `*` — same convention as `udir-gsi`/`udir-elevundersokelsen-mobbing`.
 * Handles all three real cell shapes seen live: a plain integer
 * (`Skalapoeng`, e.g. "48"), a Norwegian-decimal-comma figure
 * (`Usikkerhet`, e.g. "0,3"), and a plain-ASCII-space-thousands-separated
 * integer (`Antall elever deltatt`, e.g. "6 640" — confirmed byte-by-byte
 * to be a regular space, not a non-breaking one).
 */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "*") return null;
  const n = Number.parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one grade/subject/year/radSti-anchor data response into the
 * kommune-level row stream. Same depth-by-segment-count technique
 * `udir-gsi` already uses: a row is kept iff its own `id` has exactly 3
 * dot-separated segments (fylke-level rows have 2, school-level would
 * have 4 but are never reached since this module's own `radSti` only goes
 * two levels deep from its anchor).
 *
 * ⚠️ A GENUINELY EMPTY RESPONSE (`metadata.columns: []`, `rows: []`) IS NOT
 * AN ERROR — confirmed live on the 9th-grade-English combination, which
 * does not exist at all for this table. Represented here as zero rows.
 */
export function parseNasjonaleProeverData(
  json: unknown,
  grade: number,
  subject: string,
  year: number,
): ProeverRow[] {
  const columns = (json as any)?.metadata?.columns;
  const rows = (json as any)?.rows;
  if (Array.isArray(columns) && columns.length === 0 && Array.isArray(rows) && rows.length === 0) {
    return []; // genuinely nothing to report for this combination — see this function's header comment
  }

  if (!Array.isArray(columns)) {
    throw new Error(`Data response for grade ${grade} subject ${subject} year ${year} has no metadata.columns.`);
  }
  const measureLevel = columns[columns.length - 1];
  if (!Array.isArray(measureLevel) || measureLevel.length === 0) {
    throw new Error(`Data response for grade ${grade} subject ${subject} year ${year} has an empty measure column level.`);
  }
  const measureNames: string[] = measureLevel.map((c: any) => c?.name);
  if (measureNames.some((n) => typeof n !== "string" || !n)) {
    throw new Error(`Data response for grade ${grade} subject ${subject} year ${year} has an unnamed measure column.`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`Data response for grade ${grade} subject ${subject} year ${year} has no rows array.`);
  }

  const out: ProeverRow[] = [];
  for (const row of rows) {
    const id: string | undefined = row?.id;
    const kode: string | undefined = row?.kode;
    if (typeof id !== "string" || typeof kode !== "string") continue;
    const depth = id.split(".").length;
    if (depth !== 3) continue; // not a kommune-level row (fylke=2)

    const data: unknown[] = row?.data;
    if (!Array.isArray(data) || data.length !== measureNames.length) {
      throw new Error(
        `Row "${kode}" for grade ${grade} subject ${subject} year ${year} has ${Array.isArray(data) ? data.length : "no"} data cells, expected ${measureNames.length} (one per measure) — layout may have changed.`,
      );
    }

    for (let i = 0; i < measureNames.length; i++) {
      out.push({
        region_code: kode,
        grade,
        subject,
        year,
        measure: measureNames[i]!,
        value: parseCell(String(data[i])),
      });
    }
  }

  return out;
}
