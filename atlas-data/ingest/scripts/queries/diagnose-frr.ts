import { closeSql, getSql } from "../../src/lib/postgres.js";

async function main() {
  const sql = getSql();

  console.log("--- frr_resources duplication check ---");
  const dup = await sql<{ id: string; n: number }[]>`
    SELECT id, COUNT(*)::int AS n
    FROM private_marts.frr_resources
    GROUP BY id HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 5
  `;
  console.log("Resources with multiple rows:", dup.length);
  for (const d of dup) console.log(" ", d.n, "rows for id:", d.id);

  console.log("\n--- dim_kommune duplicate names ---");
  const dupKomm = await sql<{ kommune_name: string; n: number }[]>`
    SELECT kommune_name, COUNT(*)::int AS n
    FROM marts.dim_kommune
    GROUP BY kommune_name HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 10
  `;
  console.log("dim_kommune names with >1 row:", dupKomm.length);
  for (const d of dupKomm) console.log(" ", d.n, " rows for kommune_name:", d.kommune_name);

  console.log("\n--- status array sizes in raw FRR ---");
  const statusSizes = await sql<{ status_count: number; n: number }[]>`
    SELECT jsonb_array_length(raw_payload->'status') AS status_count, COUNT(*)::int AS n
    FROM private_raw.frr_resources
    GROUP BY 1 ORDER BY 1
  `;
  console.log("Distribution of status array length:");
  for (const s of statusSizes) console.log(" ", s.n, "resources with", s.status_count, "status entries");

  console.log("\n--- status entries with non-null startTidspunkt ---");
  const validStatus = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM private_raw.frr_resources r,
         jsonb_array_elements(r.raw_payload->'status') AS st
    WHERE (st->>'startTidspunkt') IS NOT NULL
  `;
  console.log("Status array entries with startTidspunkt:", validStatus[0]?.n ?? 0);

  await closeSql();
}

main().catch(async (err) => {
  console.error(err);
  await closeSql().catch(() => {});
  process.exit(1);
});
