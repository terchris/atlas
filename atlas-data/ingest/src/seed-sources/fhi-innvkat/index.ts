/**
 * Refresh marts.ref_fhi_innvkat from FHI table 360 (INNVKAT — immigration
 * category). Currently a 1-row seed (only code "0" = totalt), future-
 * proofed for additional categories. Norwegian only.
 */
import { fetchFhiDimension, runSeedSource, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "fhi-innvkat";
const SEED_FILE = "ref_fhi_innvkat.csv";

export async function run(): Promise<void> {
  await runSeedSource({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    fetch: () => fetchFhiDimension({ sourceId: "nokkel", tableId: 360, dimension: "INNVKAT" }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
