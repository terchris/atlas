/**
 * One-off verification: counts and ressurstype distribution after raw ingest.
 * Run from repo root:
 *   tsx --env-file=atlas-data/ingest/.env atlas-data/ingest/scripts/verify-frr.ts
 */
import { closeSql, getSql } from "../src/lib/postgres.js";

async function main() {
  const sql = getSql();
  const total =
    await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM private_raw.frr_resources`;
  console.log("Total rows in private_raw.frr_resources:", total[0]!.n);

  const types = await sql<{ ressurstype: string; n: number }[]>`
    SELECT raw_payload->>'ressurstype' AS ressurstype, COUNT(*)::int AS n
    FROM private_raw.frr_resources GROUP BY 1 ORDER BY 2 DESC
  `;
  console.log("Distribution by ressurstype:");
  for (const r of types) {
    console.log("  ", r.n.toString().padStart(5), " ", r.ressurstype);
  }
  await closeSql();
}

main().catch(async (err) => {
  console.error(err);
  await closeSql().catch(() => {});
  process.exit(1);
});
