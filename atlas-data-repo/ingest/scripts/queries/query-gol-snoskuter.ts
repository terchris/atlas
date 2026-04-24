import { closeSql, getSql } from "../../src/lib/postgres.js";

async function main() {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      visningsnavn: string;
      ressurstype: string;
      hovedfunksjon: string | null;
      current_statuskode: string | null;
      current_kommune_navn: string | null;
      undertyper: string[] | null;
      kapasiteter: string[] | null;
    }[]
  >`
    SELECT id, visningsnavn, ressurstype, hovedfunksjon,
           current_statuskode, current_kommune_navn,
           undertyper, kapasiteter
    FROM private_marts.frr_resources
    WHERE current_kommune_navn = 'Gol'
      AND 'Snøskuter' = ANY(undertyper)
    ORDER BY visningsnavn
  `;
  console.log(
    `${rows.length} resources where kommunenavn='Gol' AND 'Snøskuter' in undertyper:\n`,
  );
  for (const r of rows) {
    console.log(
      `id=${r.id}  status=${r.current_statuskode}  ressurstype=${r.ressurstype}`,
    );
    console.log(`  visningsnavn:  ${r.visningsnavn}`);
    console.log(`  hovedfunksjon: ${r.hovedfunksjon}`);
    console.log(`  undertyper:    ${JSON.stringify(r.undertyper)}`);
    console.log(`  kapasiteter:   ${JSON.stringify(r.kapasiteter)}`);
    console.log("");
  }
  await closeSql();
}

main().catch(async (err) => {
  console.error(err);
  await closeSql().catch(() => {});
  process.exit(1);
});
