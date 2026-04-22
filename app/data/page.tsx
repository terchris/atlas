import {
  listIndicators,
  sourceDisplayName,
  unitForContentCode,
} from "@/lib/indicators";

export const dynamic = "force-dynamic";

export default async function DataExplorerIndex() {
  const indicators = await listIndicators();
  const bySource = new Map<string, typeof indicators>();
  for (const ind of indicators) {
    const list = bySource.get(ind.source_id) ?? [];
    list.push(ind);
    bySource.set(ind.source_id, list);
  }

  return (
    <main
      style={{
        maxWidth: "64rem",
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <nav style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <a href="/">← Atlas</a>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Data-utforsker</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          Alle indikatorer i <code>marts.fact_kommune_indicators</code>.
          Verktøy for datakvalitetskontroll — klikk en indikator for å se
          verdier, dekning og hull på kartet.
        </p>
      </header>

      {[...bySource.entries()].map(([sourceId, rows]) => (
        <section key={sourceId} style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
            {sourceDisplayName(sourceId)}
          </h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid #e5e5e5",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "0.5rem 0.5rem" }}>Indikator</th>
                <th style={{ padding: "0.5rem 0.5rem" }}>År</th>
                <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>
                  Dekning
                </th>
                <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>
                  Verdiintervall
                </th>
                <th style={{ padding: "0.5rem 0.5rem" }}> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const totalActive = r.kommuner_with_value + r.kommuner_with_null;
                const pct = totalActive > 0
                  ? Math.round((r.kommuner_with_value / totalActive) * 100)
                  : 0;
                const unit = unitForContentCode(r.source_id, r.contents_code);
                const href = `/data/${encodeURIComponent(r.source_id)}/${encodeURIComponent(r.contents_code)}`;
                return (
                  <tr
                    key={`${r.source_id}-${r.contents_code}`}
                    style={{ borderBottom: "1px solid #eee" }}
                  >
                    <td style={{ padding: "0.5rem 0.5rem" }}>
                      <code style={{ color: "#555", fontSize: "0.85rem" }}>
                        {r.contents_code}
                      </code>
                      {r.contents_label && (
                        <div
                          style={{ color: "#333", fontSize: "0.85rem" }}
                        >
                          {r.contents_label}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.5rem",
                        color: "#666",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.latest_year}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.5rem",
                        textAlign: "right",
                        color: pct < 100 ? "#b56900" : "#2a7a2a",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.kommuner_with_value} / {totalActive} ({pct}%)
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.5rem",
                        textAlign: "right",
                        color: "#666",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatRange(r.min_value, r.max_value, unit)}
                    </td>
                    <td style={{ padding: "0.5rem 0.5rem" }}>
                      <a href={href}>Åpne kart →</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "#666" }}>
        Dette er en intern datakvalitetsside. Den viser hver indikator i
        sin råform slik Atlas har fått den — ikke en kuratert historie.
      </p>
    </main>
  );
}

function formatRange(
  min: number | null,
  max: number | null,
  unit: string | null,
): string {
  if (min == null || max == null) return "—";
  const fmt = (n: number) =>
    Math.abs(n) >= 1000
      ? n.toLocaleString("nb-NO", { maximumFractionDigits: 0 })
      : n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  const suffix = unit ? ` ${unit}` : "";
  return `${fmt(min)} — ${fmt(max)}${suffix}`;
}
