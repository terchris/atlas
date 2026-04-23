/**
 * Refresh marts.dim_postnummer from Bring's public Postnummerregister.
 *
 * NOTE on source choice: PLAN-foundation-reference-tables.md proposed SSB
 * Klass 488 as the source, but that classification is "Kodeliste for
 * terminaltype for godstransport på vei" (freight-terminal codes) — NOT
 * postnummer. SSB Klass does not host the Norwegian postal register. The
 * canonical Norwegian source is Bring's weekly Postnummerregister, which
 * is also republished by Posten on data.norge.no. We fetch Bring's free
 * public TXT directly here.
 *
 * Source: https://www.bring.no/postnummerregister-ansi.txt
 *   - Tab-separated, no header, ~5 122 rows.
 *   - Encoding: Windows-1252 (the .txt UTF-8 variant returns 404).
 *   - 5 columns per row:
 *       1) postnummer (4 digits, leading zeros)
 *       2) poststedsnavn (post office name, ALLCAPS)
 *       3) kommune_nr (4 digits)
 *       4) kommune_navn (kept locally; NOT exported — dim_kommune is the
 *          source of truth)
 *       5) kategori (B/G/P/S — gateadresse / postboks / service / both;
 *          out of scope for v1, dropped)
 *   - Refreshed weekly by Bring; we ingest on demand.
 *
 * Seed columns produced: postnummer, post_office, kommune_nr, sort_order.
 *
 * Refresh cadence: periodic (quarterly is enough; Posten reform schedule
 * is twice-yearly per the Bring docs).
 */
import { runSeedSourceGeneric, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "bring-postnummer";
const SEED_FILE = "dim_postnummer.csv";
const ENDPOINT = "https://www.bring.no/postnummerregister-ansi.txt";

async function fetchPostnummer(): Promise<readonly (readonly string[])[]> {
  const res = await fetch(ENDPOINT, {
    headers: {
      "User-Agent": "atlas-data/0.0 (https://atlas.helpers.no)",
    },
  });
  if (!res.ok) {
    throw new Error(`Bring postnummer: HTTP ${res.status} ${res.statusText}`);
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("windows-1252").decode(buffer);

  type Row = { postnummer: string; postOffice: string; kommune_nr: string };
  const rows: Row[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields.length < 4) {
      throw new Error(`Bring postnummer: unexpected row (<4 fields): ${JSON.stringify(line)}`);
    }
    const [postnummer, postOffice, kommune_nr] = fields;
    if (!/^\d{4}$/.test(postnummer ?? "")) {
      throw new Error(`Bring postnummer: bad postnummer ${JSON.stringify(postnummer)} in row`);
    }
    if (!/^\d{4}$/.test(kommune_nr ?? "")) {
      throw new Error(`Bring postnummer: bad kommune_nr ${JSON.stringify(kommune_nr)} for postnummer ${postnummer}`);
    }
    rows.push({
      postnummer: postnummer ?? "",
      postOffice: postOffice ?? "",
      kommune_nr: kommune_nr ?? "",
    });
  }

  rows.sort((a, b) => a.postnummer.localeCompare(b.postnummer));

  return rows.map((r, i) => [
    r.postnummer,
    r.postOffice,
    r.kommune_nr,
    String(i + 1),
  ]);
}

export async function run(): Promise<void> {
  await runSeedSourceGeneric({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    header: ["postnummer", "post_office", "kommune_nr", "sort_order"],
    fetch: fetchPostnummer,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
