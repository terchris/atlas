import { notFound } from "next/navigation";
import {
  listIndicators,
  listMissingKommuner,
  loadIndicatorValues,
  sourceAttribution,
  sourceDisplayName,
  unitForContentCode,
} from "@/lib/indicators";
import { IndicatorMap } from "./IndicatorMap";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ source_id: string; contents_code: string }>;
};

export default async function IndicatorExplorerPage({ params }: PageProps) {
  const { source_id: raw_source, contents_code: raw_code } = await params;
  const source_id = decodeURIComponent(raw_source);
  const contents_code = decodeURIComponent(raw_code);

  const [summary, values, missing] = await Promise.all([
    listIndicators().then((list) =>
      list.find(
        (i) => i.source_id === source_id && i.contents_code === contents_code,
      ) ?? null,
    ),
    loadIndicatorValues(source_id, contents_code),
    listMissingKommuner(source_id, contents_code),
  ]);

  if (!summary) notFound();

  const unit = unitForContentCode(source_id, contents_code);
  const attribution = sourceAttribution(source_id);
  const nullCount = values.filter((v) => v.value === null).length;

  return (
    <main
      style={{
        maxWidth: "80rem",
        margin: "1.5rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <nav style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <a href="/">← Atlas</a>
        {" / "}
        <a href="/data">Data-utforsker</a>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.35rem" }}>
          {sourceDisplayName(source_id)}
          {" — "}
          <code style={{ fontWeight: 400, color: "#555" }}>
            {contents_code}
          </code>
        </h1>
        {summary.contents_label && (
          <p style={{ margin: "0.15rem 0 0", color: "#333" }}>
            {summary.contents_label}
          </p>
        )}
        <p style={{ margin: "0.35rem 0 0", color: "#555", fontSize: "0.9rem" }}>
          Siste år: {summary.latest_year}
          {" · "}
          Enhet: {unit ?? "—"}
          {" · "}
          Oppdatert fra kilde:{" "}
          {new Date(summary.upstream_updated).toLocaleDateString("nb-NO")}
        </p>
      </header>

      <IndicatorMap
        values={values}
        missing={missing}
        contentsCode={contents_code}
        unit={unit}
        nullCount={nullCount}
      />

      <footer style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "#666" }}>
        <p style={{ margin: "0.2rem 0" }}>
          {attribution.url ? (
            <a href={attribution.url} target="_blank" rel="noopener noreferrer">
              {attribution.text}
            </a>
          ) : (
            attribution.text
          )}
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
