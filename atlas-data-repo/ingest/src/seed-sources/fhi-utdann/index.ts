/**
 * Refresh marts.ref_fhi_utdann from FHI table 794 (UTDANN — parents'
 * education). Decodes 5 codes ("0"–"4"). Norwegian only — FHI does not
 * publish English category labels, so label_en stays blank in the seed.
 *
 * UTDANN also appears in FHI table 360 with the same code list; we fetch
 * from 794 because it has a richer per-table query schema for sanity.
 */
import { fetchFhiDimension, runSeedSource, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "fhi-utdann";
const SEED_FILE = "ref_fhi_utdann.csv";

export async function run(): Promise<void> {
  await runSeedSource({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    fetch: () => fetchFhiDimension({ sourceId: "nokkel", tableId: 794, dimension: "UTDANN" }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
