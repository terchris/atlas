/**
 * Refresh marts.ref_brreg_icnpo from Brreg's Frivillighetsregister API.
 *
 * Endpoint: https://data.brreg.no/frivillighetsregisteret/api/icnpo-kategorier
 * Response shape (HAL):
 *   { _embedded: { icnpoKategorier: [{ icnpoNummer, navn, spraakkode }, …] } }
 *
 * Hierarchy is encoded in the code itself:
 *   - 1-digit codes ("1"–"9") and 2-digit codes ("10"–"14") are MAIN groups.
 *   - 4-digit codes ("1100", "2100", …) are SUBGROUPS of the 1-digit main
 *     group sharing the first character.
 *   - 5-digit codes ("10100", "11100", …) are SUBGROUPS of the 2-digit
 *     main group sharing the first two characters.
 * No `parent_code` field is published; we derive it.
 *
 * Brreg publishes Norwegian only (spraakkode = "NOB"); label_en stays blank.
 *
 * 14 main groups + 32 subgroups = 46 rows (verified live 2026-04-23).
 * The original PLAN-001 estimate of "12 main + 30 subgroups = 42" was off.
 *
 * Refresh cadence: rare. Last ICNPO revision was 2009. Review once a year.
 */
import { runSeedSourceGeneric, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "brreg-icnpo";
const SEED_FILE = "ref_brreg_icnpo.csv";
const ENDPOINT = "https://data.brreg.no/frivillighetsregisteret/api/icnpo-kategorier";

type IcnpoCategory = {
  icnpoNummer: string;
  navn: string;
  spraakkode: string;
};

type IcnpoResponse = {
  _embedded: { icnpoKategorier: IcnpoCategory[] };
};

function deriveParent(code: string): string {
  // Main groups: no parent.
  if (code.length === 1 || code.length === 2) return "";
  // 4-digit subgroup → 1-digit main group (first char).
  if (code.length === 4) return code.slice(0, 1);
  // 5-digit subgroup → 2-digit main group (first 2 chars).
  if (code.length === 5) return code.slice(0, 2);
  throw new Error(`Unexpected ICNPO code length: ${code.length} (code=${code})`);
}

function compareCodes(a: string, b: string): number {
  // Sort by main group first (parent or self), then by length, then by code.
  // This puts each main group followed by its subgroups in code order.
  const aParent = deriveParent(a) || a;
  const bParent = deriveParent(b) || b;
  const aMain = parseInt(aParent, 10);
  const bMain = parseInt(bParent, 10);
  if (aMain !== bMain) return aMain - bMain;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

async function fetchIcnpo(): Promise<readonly (readonly string[])[]> {
  const res = await fetch(ENDPOINT, {
    headers: {
      "User-Agent": "atlas-data/0.0 (https://atlas.helpers.no)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Brreg ICNPO endpoint ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as IcnpoResponse;
  const cats = json._embedded?.icnpoKategorier;
  if (!Array.isArray(cats) || cats.length === 0) {
    throw new Error("Brreg ICNPO response missing _embedded.icnpoKategorier");
  }

  const sorted = [...cats].sort((a, b) => compareCodes(a.icnpoNummer, b.icnpoNummer));

  return sorted.map((c, i) => [
    c.icnpoNummer,
    deriveParent(c.icnpoNummer),
    c.navn,
    "", // label_en — Brreg publishes Norwegian only
    String(i + 1),
  ]);
}

export async function run(): Promise<void> {
  await runSeedSourceGeneric({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    header: ["code", "parent_code", "label_no", "label_en", "sort_order"],
    fetch: fetchIcnpo,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
