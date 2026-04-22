import { sql } from "@/lib/db";
import { BarnefattigdomMap } from "./Map";

export const dynamic = "force-dynamic";

export type KommuneRow = {
  kommune_nr: string;
  kommune_name: string;
  fylke_name: string | null;
  year: number;
  value_pct: number | null;
  personer: number | null;
};

export default async function BarnefattigdomPage() {
  // Pull both EUskala60 (share) and Personer (count) for the latest year per kommune.
  // One row per kommune, with both numbers.
  const rows = await sql<KommuneRow[]>`
    with latest as (
      select max(year) as year
      from marts.fact_kommune_indicators
      where source_id = 'ssb-08764' and contents_code = 'EUskala60'
    )
    select
      f.kommune_nr,
      f.kommune_name,
      f.fylke_name,
      f.year,
      max(case when f.contents_code = 'EUskala60' then f.value end)::float as value_pct,
      max(case when f.contents_code = 'Personer'  then f.value end)::float as personer
    from marts.fact_kommune_indicators f
    join latest l on f.year = l.year
    where f.source_id = 'ssb-08764'
      and f.contents_code in ('EUskala60', 'Personer')
      and f.kommune_is_active
    group by f.kommune_nr, f.kommune_name, f.fylke_name, f.year
    order by f.kommune_nr
  `;

  const year = rows[0]?.year ?? null;

  return (
    <main
      style={{
        maxWidth: "72rem",
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <nav style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <a href="/">← Atlas</a>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Barnefattigdom i Norge</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          Andel barn under 18 år som bor i husholdninger med lavinntekt
          (EU-skala 60 prosent) per kommune{year ? `, ${year}` : ""}.
        </p>
      </header>

      <BarnefattigdomMap data={rows} year={year} />

      <footer style={{ marginTop: "2rem", fontSize: "0.85rem", color: "#666" }}>
        <p style={{ margin: "0.2rem 0" }}>
          Kilde:{" "}
          <a
            href="https://www.ssb.no/statbank/table/08764"
            target="_blank"
            rel="noopener noreferrer"
          >
            Statistisk sentralbyrå, tabell 08764
          </a>
        </p>
        <p style={{ margin: "0.2rem 0" }}>
          Kommunegrenser: Kartverket via{" "}
          <a
            href="https://github.com/robhop/fylker-og-kommuner"
            target="_blank"
            rel="noopener noreferrer"
          >
            robhop/fylker-og-kommuner
          </a>{" "}
          (CC BY 4.0)
        </p>
      </footer>
    </main>
  );
}
