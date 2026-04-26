/**
 * Refresh marts.ref_ssb_nivaa from SSB table 09429 (Nivaa, NUS2000).
 * Decodes 7 codes (00, 01, 02a, 11, 03a, 04a, 09a) to Norwegian + English
 * labels. Upstream order interleaves "11" (Fagskole) between "02a" and
 * "03a" — preserved by orderedCodes().
 */
import { fetchSsbDimension, runSeedSource, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "ssb-nivaa";
const SEED_FILE = "ref_ssb_nivaa.csv";

export async function run(): Promise<void> {
  await runSeedSource({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    fetch: () => fetchSsbDimension({ tableId: "09429", dimension: "Nivaa" }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
