/**
 * Generic "fetch all Brreg enheter for an NGO" helper.
 *
 * Wraps the typed `fetchEnheter` + `paginate` from ./client.ts and applies an
 * exact-prefix post-filter against Brreg's fuzzy score-matched `navn` query
 * (Brreg's `navn` param is compound-similarity-ranked, not exact; without a
 * post-filter, a query like `navn=norsk+folkehjelp` also returns every FLI
 * whose name just contains "norsk").
 *
 * Usage:
 *   const { enheter } = await fetchNgoUnits({
 *     navn: "norsk folkehjelp",
 *     organisasjonsform: "FLI",
 *     nameStartsWith: "Norsk Folkehjelp",
 *   });
 *
 * Caller handles persistence. This function is I/O but pure-ish — given the
 * same Brreg state it returns the same set of enheter.
 */

import { fetchEnheter, paginate, type Enhet } from "./client.js";

export type FetchNgoUnitsOpts = {
  /** Brreg fuzzy-name query. Score-matched; pass the lower-cased NGO name. */
  navn: string;
  /** Brreg organisasjonsform kode filter. `FLI` for NGO foreninger. */
  organisasjonsform: string;
  /**
   * Case-insensitive exact prefix every returned enhet's `navn` must start
   * with. Filters out the fuzzy-match noise Brreg returns alongside real
   * matches. Optional — omit to accept every row Brreg returns (rarely
   * what you want).
   */
  nameStartsWith?: string;
  /** Brreg page size. Default 100 (max per Brreg docs = 10 000 / page). */
  size?: number;
};

export type FetchNgoUnitsResult = {
  /** Enheter that passed the nameStartsWith filter. */
  enheter: Enhet[];
  /** Total pages walked in Brreg. */
  pages: number;
  /** Raw rows scanned across all pages before filtering. */
  scanned: number;
  /**
   * Rows scanned but dropped by the nameStartsWith filter. Useful as a sanity
   * signal — if this is ~zero on a well-tuned query, nameStartsWith might be
   * redundant; if this is orders of magnitude larger than `enheter.length`,
   * the fuzzy match is doing most of the work.
   */
  fuzzyNoiseFiltered: number;
};

export async function fetchNgoUnits(
  opts: FetchNgoUnitsOpts,
): Promise<FetchNgoUnitsResult> {
  const { navn, organisasjonsform, nameStartsWith, size = 100 } = opts;
  const prefixLower = nameStartsWith?.toLowerCase();

  const passesPrefix = (enhetNavn: string | undefined): boolean => {
    if (!prefixLower) return true;
    if (!enhetNavn) return false;
    return enhetNavn.toLowerCase().startsWith(prefixLower);
  };

  const enheter: Enhet[] = [];
  let pages = 0;
  let scanned = 0;
  let fuzzyNoiseFiltered = 0;

  for await (const batch of paginate<Enhet>(
    (page) => fetchEnheter({ navn, organisasjonsform, size, page }),
    "enheter",
  )) {
    pages += 1;
    for (const enhet of batch) {
      scanned += 1;
      if (!passesPrefix(enhet.navn)) {
        fuzzyNoiseFiltered += 1;
        continue;
      }
      enheter.push(enhet);
    }
  }

  return { enheter, pages, scanned, fuzzyNoiseFiltered };
}
