/**
 * Refresh marts.ref_ssb_household_type from SSB table 06944 (HusholdType).
 * Decodes 5 codes ("0000"–"0004") to Norwegian + English labels.
 */
import { fetchSsbDimension, runSeedSource, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "ssb-household-type";
const SEED_FILE = "ref_ssb_household_type.csv";

export async function run(): Promise<void> {
  await runSeedSource({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    fetch: () => fetchSsbDimension({ tableId: "06944", dimension: "HusholdType" }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
