/**
 * End-to-end validation queries against private_marts.frr_*.
 * Per PLAN-frr-ingest.md Phase 6 acceptance criteria.
 *
 * Run from repo root:
 *   tsx --env-file=atlas-data-repo/ingest/.env atlas-data-repo/ingest/scripts/validate-frr.ts
 */
import { closeSql, getSql } from "../src/lib/postgres.js";

async function main() {
  const sql = getSql();
  const log = (label: string, val: unknown) =>
    console.log(`  ${label.padEnd(50)} ${JSON.stringify(val)}`);

  console.log("=== Row counts ===");
  for (const table of [
    "frr_resources",
    "frr_resource_position",
    "frr_resource_status",
    "frr_resource_phone",
  ]) {
    const r = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM private_marts.${sql(table)}
    `;
    log(`private_marts.${table}`, r[0]!.n);
  }

  console.log("\n=== Q6.1: resources in Oslo (kommune_nr=0301) by ressurstype ===");
  const oslo = await sql<{ ressurstype: string; n: number }[]>`
    SELECT ressurstype, COUNT(*)::int AS n
    FROM private_marts.frr_resources
    WHERE current_kommune_nr = '0301'
    GROUP BY 1 ORDER BY 2 DESC
  `;
  for (const r of oslo) log(r.ressurstype, r.n);

  console.log("\n=== Q6.2: org units (sample of 10 by hovedfunksjon) ===");
  const ous = await sql<
    { id: string; hovedfunksjon: string; current_kommune_navn: string | null }[]
  >`
    SELECT id, hovedfunksjon, current_kommune_navn
    FROM private_marts.frr_resources
    WHERE ressurstype = 'organisatorisk enhet'
    ORDER BY hovedfunksjon
    LIMIT 10
  `;
  for (const o of ous) log(`${o.hovedfunksjon} (${o.id})`, o.current_kommune_navn);

  console.log("\n=== Q6.3: walk mor_id from one kjøretøy up to its org unit ===");
  const sample = await sql<{ id: string }[]>`
    SELECT id FROM private_marts.frr_resources
    WHERE ressurstype = 'kjøretøy' AND mor_id IS NOT NULL
    LIMIT 1
  `;
  if (sample.length > 0) {
    const sampleId = sample[0]!.id;
    const path = await sql<
      {
        id: string;
        mor_id: string | null;
        ressurstype: string;
        depth: number;
      }[]
    >`
      WITH RECURSIVE up(id, mor_id, ressurstype, depth) AS (
        SELECT id, mor_id, ressurstype, 0
        FROM private_marts.frr_resources WHERE id = ${sampleId}
        UNION ALL
        SELECT r.id, r.mor_id, r.ressurstype, up.depth + 1
        FROM private_marts.frr_resources r
        JOIN up ON r.id = up.mor_id WHERE up.depth < 10
      )
      SELECT * FROM up
    `;
    log(`Walk from kjøretøy id=${sampleId}`, `${path.length} hops`);
    for (const p of path)
      console.log(`    depth=${p.depth} ressurstype=${p.ressurstype} id=${p.id}`);
  }

  console.log("\n=== Q6.4: resources with capability 'Terrenggående vinter' ===");
  const cap = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM private_marts.frr_resources
    WHERE 'Terrenggående vinter' = ANY(kapasiteter)
  `;
  log("count", cap[0]!.n);

  console.log("\n=== Q6.5: phone redaction sanity ===");
  const phones = await sql<
    { kategori: string; redacted: number; total: number }[]
  >`
    SELECT
      kategori,
      COUNT(*) FILTER (WHERE is_redacted)::int AS redacted,
      COUNT(*)::int AS total
    FROM private_marts.frr_resource_phone
    GROUP BY kategori
    ORDER BY total DESC
  `;
  for (const p of phones)
    log(p.kategori ?? "(null)", `${p.redacted} redacted of ${p.total} total`);

  console.log("\n=== Q6.6: personnavn redaction sanity ===");
  const pn = await sql<
    {
      marked: number;
      sentinel_present: number;
      total: number;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE is_personnavn_redacted)::int AS marked,
      COUNT(*) FILTER (WHERE personnavn LIKE '[ANONYMISERT%')::int AS sentinel_present,
      COUNT(*)::int AS total
    FROM private_marts.frr_resources
  `;
  log(
    "marked / sentinel_present / total",
    `${pn[0]!.marked} / ${pn[0]!.sentinel_present} / ${pn[0]!.total}`,
  );

  console.log("\n=== Q6.7: position history depth (top 10) ===");
  const posHist = await sql<{ resource_id: string; n: number }[]>`
    SELECT resource_id, COUNT(*)::int AS n
    FROM private_marts.frr_resource_position
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `;
  for (const p of posHist) log(p.resource_id, `${p.n} positions`);

  console.log("\n=== Status distribution on the spine ===");
  const stat = await sql<{ current_statuskode: string | null; n: number }[]>`
    SELECT current_statuskode, COUNT(*)::int AS n
    FROM private_marts.frr_resources
    GROUP BY 1 ORDER BY 2 DESC
  `;
  for (const s of stat) log(s.current_statuskode ?? "(null)", s.n);

  console.log("\n=== ressurstype distribution on spine ===");
  const types = await sql<{ ressurstype: string; n: number }[]>`
    SELECT ressurstype, COUNT(*)::int AS n
    FROM private_marts.frr_resources
    GROUP BY 1 ORDER BY 2 DESC
  `;
  for (const t of types) log(t.ressurstype, t.n);

  console.log("\n=== Resources with current_kommune_nr resolved (out of total) ===");
  const resolved = await sql<{ resolved: number; total: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE current_kommune_nr IS NOT NULL)::int AS resolved,
      COUNT(*)::int AS total
    FROM private_marts.frr_resources
  `;
  log("kommune_nr resolved / total", `${resolved[0]!.resolved} / ${resolved[0]!.total}`);

  await closeSql();
}

main().catch(async (err) => {
  console.error(err);
  await closeSql().catch(() => {});
  process.exit(1);
});
