/**
 * Refresh marts.ref_ssb_family_type from SSB table 06083 (FamilieType).
 * Decodes 9 codes ("001"–"009") to Norwegian + English labels.
 */
import { fetchSsbDimension, runSeedSource, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "ssb-family-type";
const SEED_FILE = "ref_ssb_family_type.csv";

export async function run(): Promise<void> {
  await runSeedSource({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    fetch: () => fetchSsbDimension({ tableId: "06083", dimension: "FamilieType" }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
