import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { listChaptersInKommune } from "@/lib/supply";
import type { DimKommune, DimFylke, FactKommuneIndicator } from "@/lib/types";

type PageProps = {
  params: Promise<{ kommune_nr: string }>;
};

export const dynamic = "force-dynamic";

export default async function KommunePage({ params }: PageProps) {
  const { kommune_nr } = await params;

  if (!/^[0-9]{4}$/.test(kommune_nr)) {
    notFound();
  }

  const [kommune, fylke, indicators, supplyRows] = await Promise.all([
    sql<DimKommune[]>`
      select *
      from marts.dim_kommune
      where kommune_nr = ${kommune_nr}
      limit 1
    `.then((r) => r[0] ?? null),
    sql<DimFylke[]>`
      select f.*
      from marts.dim_kommune k
      join marts.dim_fylke f using (fylke_nr)
      where k.kommune_nr = ${kommune_nr}
      limit 1
    `.then((r) => r[0] ?? null),
    sql<FactKommuneIndicator[]>`
      select *
      from marts.fact_kommune_indicators
      where kommune_nr = ${kommune_nr}
      order by source_id, contents_code
    `,
    listChaptersInKommune(kommune_nr),
  ]);

  if (!kommune) notFound();

  const groupedBySource = new Map<string, FactKommuneIndicator[]>();
  for (const ind of indicators) {
    const list = groupedBySource.get(ind.source_id) ?? [];
    list.push(ind);
    groupedBySource.set(ind.source_id, list);
  }

  return (
    <main
      style={{
        maxWidth: "56rem",
        margin: "3rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <nav style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <a href="/">← Atlas</a>
      </nav>

      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>
          {kommune.kommune_name}
          {kommune.kommune_name_alt && (
            <span
              style={{ color: "#666", fontWeight: 400, marginLeft: "0.5rem" }}
            >
              / {kommune.kommune_name_alt}
            </span>
          )}
        </h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          Kommunenummer {kommune.kommune_nr}
          {fylke && (
            <>
              {" · "}
              {fylke.fylke_name}
              {fylke.fylke_name_alt && ` / ${fylke.fylke_name_alt}`} fylke
            </>
          )}
          {!kommune.is_active && (
            <span
              style={{
                marginLeft: "0.75rem",
                padding: "0.1rem 0.5rem",
                background: "#f3e5e5",
                color: "#8b1e1e",
                fontSize: "0.8rem",
                borderRadius: "3px",
              }}
            >
              Historisk — ikke lenger aktiv kommune
            </span>
          )}
        </p>
      </header>

      {indicators.length === 0 ? (
        <p>
          <em>Ingen indikatorer tilgjengelig for denne kommunen ennå.</em>
        </p>
      ) : (
        [...groupedBySource.entries()].map(([sourceId, rows]) => (
          <section key={sourceId} style={{ marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.5rem" }}>
              {sourceHeading(sourceId)}
            </h2>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.95rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e5e5" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>
                    Indikator
                  </th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                    År
                  </th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                    Verdi
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.source_id}-${r.contents_code}-${r.year}`}
                    style={{ borderBottom: "1px solid #eee" }}
                  >
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <code style={{ color: "#555", fontSize: "0.85rem" }}>
                        {r.contents_code}
                      </code>
                      {r.contents_label && (
                        <>
                          {" "}
                          <span>{r.contents_label}</span>
                        </>
                      )}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.5rem 0.75rem",
                        color: "#666",
                      }}
                    >
                      {r.year}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.5rem 0.75rem",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatValue(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "0.8rem", color: "#777", marginTop: "0.5rem" }}>
              {sourceAttribution(sourceId)}
            </p>
          </section>
        ))
      )}

      <SupplySection kommuneNr={kommune_nr} kommuneName={kommune.kommune_name} rows={supplyRows} />
    </main>
  );
}

// Org-neutral "Lokale tilbud" section appended to the kommune view.
// Today only Red Cross has supply; this grows organically as more NGOs ingest.
type SupplyRow = Awaited<ReturnType<typeof listChaptersInKommune>>[number];

function SupplySection({
  kommuneNr,
  kommuneName,
  rows,
}: {
  kommuneNr: string;
  kommuneName: string;
  rows: SupplyRow[];
}) {
  // Group by service_category_label_no for display.
  const grouped = new Map<string, SupplyRow[]>();
  for (const r of rows) {
    const key = r.service_category_label_no;
    const arr = grouped.get(key) ?? [];
    arr.push(r);
    grouped.set(key, arr);
  }

  return (
    <section
      style={{
        marginTop: "3rem",
        marginBottom: "2rem",
        paddingTop: "2rem",
        borderTop: "2px solid #e5e5e5",
      }}
    >
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.25rem" }}>
        Lokale tilbud i {kommuneName}
      </h2>
      <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 1rem" }}>
        Aktiviteter fra organisasjoner Atlas følger. Voksende etter hvert som
        flere organisasjoner blir importert.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: "0.95rem", color: "#555" }}>
          <em>
            Ingen ingestede organisasjoner har lokale tilbud i {kommuneName}.
          </em>
        </p>
      ) : (
        <div>
          {[...grouped.entries()].map(([categoryLabel, catRows]) => {
            // Dedupe chapters within this category (one chapter may map to
            // a category through multiple activity rows).
            const seen = new Map<string, SupplyRow>();
            for (const r of catRows) seen.set(r.chapter_id, r);
            const chapters = [...seen.values()].sort((a, b) =>
              a.name.localeCompare(b.name, "nb"),
            );
            return (
              <div key={categoryLabel} style={{ marginBottom: "1.25rem" }}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    margin: "0 0 0.25rem",
                    color: "#222",
                  }}
                >
                  {categoryLabel}
                </h3>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {chapters.map((c) => (
                    <li
                      key={c.chapter_id}
                      style={{ fontSize: "0.9rem", margin: "0.15rem 0" }}
                    >
                      <Link
                        href={`/ngo/redcross/chapters/${c.chapter_id}`}
                        style={{ color: "#0062BA" }}
                      >
                        {c.name}
                      </Link>
                      <span style={{ color: "#888", marginLeft: "0.5rem" }}>
                        ({c.ngo_brand_name ?? c.ngo_name})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: "0.8rem", color: "#777", marginTop: "1rem" }}>
        Se også: <Link href={`/ngo`}>alle organisasjoner</Link>
        {kommuneNr ? " · " : ""}
      </p>
    </section>
  );
}

function formatValue(row: FactKommuneIndicator): string {
  if (row.value === null) return row.status ?? "—";
  const n = Number(row.value);
  if (!Number.isFinite(n)) return row.value;
  // Percent-ish content codes — render with one decimal + "%".
  if (/skala|prosent|share/i.test(row.contents_code)) {
    return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
  }
  return n.toLocaleString("nb-NO");
}

function sourceHeading(sourceId: string): string {
  switch (sourceId) {
    case "ssb-08764":
      return "Barnefattigdom (SSB 08764)";
    case "ssb-06913":
      return "Befolkningsendringer (SSB 06913)";
    default:
      return sourceId;
  }
}

function sourceAttribution(sourceId: string): string {
  switch (sourceId) {
    case "ssb-08764":
      return "Kilde: Statistisk sentralbyrå, tabell 08764";
    case "ssb-06913":
      return "Kilde: Statistisk sentralbyrå, tabell 06913";
    default:
      return `Kilde: ${sourceId}`;
  }
}
