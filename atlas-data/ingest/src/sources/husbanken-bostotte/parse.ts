/**
 * Pure parsing logic for the husbanken-bostotte ingest (Husbanken's bostøtte
 * — housing allowance — applications, decisions, payouts and rejections,
 * plus the calculated kroner amount, per kommune, per year).
 *
 * Verified live 2026-10-02 (PLAN-011-husbanken-statistikkbank.md Phase 1/2)
 * — a real Qlik Sense app ("Statistikkbank", id
 * ee185fe5-e94d-463e-bff8-cd1c5f2f566f) at qlik.husbanken.no/public, reached
 * through the officially-documented Qlik Engine API (WebSocket JSON-RPC),
 * NOT the Power BI the investigation assumed. See `qlik_client.ts` for the
 * connection/session mechanics; this file only parses what comes back.
 *
 * The hypercube response is requested with explicit `qLabel`s on every
 * measure (`soknad`/`vedtak`/`utbetaling`/`avslag`/`belop`) specifically so
 * `qMeasureInfo[].qFallbackTitle` carries clean names — without `qLabel`,
 * Qlik echoes the raw expression string (`"Sum(BostøtteSøknadTeller)"`)
 * instead, which is why this file does not need a name-lookup table the way
 * `udir-gsi` briefly expected to.
 */

export type HusbankenRow = {
  region_code: string;
  year: number;
  measure: string;
  value: number | null;
};

/** One row of a Qlik hypercube qMatrix — qText/qNum per dimension/measure cell. */
type QlikCell = { qText: string; qNum: number | string };

/**
 * Parse a `GetLayout` (or `GetHyperCubeData`) hypercube payload into flat
 * rows. Expects exactly 2 dimensions (`KommuneNr`, `År`) followed by N
 * measures, in that column order — matches the request shape
 * `qlik_client.ts` builds.
 *
 * ⚠️ A real, confirmed data-quality artifact, not suppression: some rows
 * carry `year` as the literal text `"-"` (a record with no assigned year in
 * Husbanken's own source system) — confirmed live on both Svalbard rows and
 * in the national-aggregate view. These are dropped, not zero-filled; a
 * fabricated year would misrepresent what Husbanken actually recorded.
 *
 * ⚠️ `region_code` is NOT always a real kommune — matching the exact lesson
 * `udir-gsi` learned the hard way. Svalbard (`2100`, `2111`) appears in this
 * dataset too, confirmed live, always as real zero values (not suppressed —
 * Husbanken's bostøtte programme genuinely has no Svalbard administration).
 * `kommune_nr` resolution happens downstream via `classify_region_code`, not
 * here.
 *
 * No suppression marker was found on small-kommune data (checked live
 * against Røyrvik, Norway's smallest kommune by bostøtte volume) — every
 * cell is a real number, confirmed, not assumed absent.
 */
export function parseHypercubeRows(
  dataPages: { qMatrix: QlikCell[][] }[],
  measureNames: string[],
): HusbankenRow[] {
  const out: HusbankenRow[] = [];
  for (const page of dataPages) {
    for (const row of page.qMatrix) {
      const regionCode = row[0]?.qText;
      const yearText = row[1]?.qText;
      if (!regionCode || !yearText) continue;
      if (!/^\d{4}$/.test(yearText)) continue; // the "-" (no assigned year) bucket

      const year = Number.parseInt(yearText, 10);
      const measureCells = row.slice(2);
      if (measureCells.length !== measureNames.length) {
        throw new Error(
          `Row for region "${regionCode}" year ${yearText} has ${measureCells.length} measure cells, expected ${measureNames.length} — layout may have changed.`,
        );
      }

      for (let i = 0; i < measureNames.length; i++) {
        out.push({
          region_code: regionCode,
          year,
          measure: measureNames[i]!,
          value: parseCell(measureCells[i]!),
        });
      }
    }
  }
  return out;
}

/**
 * Qlik's own `qNum` is already a parsed number (or the string `"NaN"` when
 * the cell has no numeric value — confirmed live on text-only dimension
 * cells, not observed on a measure cell so far, but handled defensively the
 * same way every other source's `parseCell` treats an unparseable cell as
 * null rather than throwing).
 */
export function parseCell(cell: QlikCell): number | null {
  const n = typeof cell.qNum === "number" ? cell.qNum : Number.parseFloat(cell.qNum);
  return Number.isFinite(n) ? n : null;
}

/** Extract the ordered measure names from a hypercube's own qMeasureInfo. */
export function extractMeasureNames(qMeasureInfo: { qFallbackTitle: string }[]): string[] {
  const names = qMeasureInfo.map((m) => m.qFallbackTitle);
  if (names.some((n) => !n)) {
    throw new Error("Hypercube qMeasureInfo has an unnamed measure — qLabel may not have applied.");
  }
  return names;
}
