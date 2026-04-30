type Tool = {
  href: string;
  title: string;
  description: string;
};

const TOOLS: Tool[] = [
  {
    href: "/coverage-gap/barnefattigdom",
    title: "Barnefattigdom — choropleth-kart",
    description:
      "Andel barn under 18 år i lavinntektshusholdninger per kommune. Lest fra marts.mart_coverage_gap_barnefattigdom.",
  },
  {
    href: "/kommuner/0301",
    title: "Kommune-detalj (eksempel: Oslo, 0301)",
    description:
      "Alle tilgjengelige indikatorer per kommune. Lest fra marts.dim_kommune + marts.fact_kommune_indicators.",
  },
  {
    href: "/data",
    title: "Data-utforsker",
    description:
      "Alle 17 indikatorer på tvers av SSB- og FHI-kilder med dekning og verdiintervaller. For datakvalitetskontroll.",
  },
  {
    href: "/ngo",
    title: "NGO-katalog",
    description:
      "Oversikt over de NGO-ene Atlas følger og deres aktivitetstilbud.",
  },
  {
    href: "/ngo/redcross",
    title: "Røde Kors — landingsside",
    description:
      "Distrikter, lokallag og aktiviteter. Bruker dim_chapter / dim_activity / fact_chapter_activities.",
  },
  {
    href: "/ngo/redcross/distrikter",
    title: "Røde Kors — 18 distrikter",
    description: "Distriktsnivå-oversikt med dekning per kommune.",
  },
  {
    href: "/ngo/redcross/chapters",
    title: "Røde Kors — ~390 lokallag",
    description: "Alle lokallag med kommune-tilhørighet og service-kategorier.",
  },
  {
    href: "/admin/supply/redcross-branches",
    title: "Admin — Røde Kors ingest-diagnostikk",
    description:
      "FK-integritetskontroll, raw vs marts radtellinger, expected-vs-actual. Den primære diagnose-siden for ingest-bidragsytere.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <div className="mb-3 inline-block rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#0062BA]">
          For Atlas contributors
        </div>
        <h1 className="mb-2 text-3xl font-semibold text-zinc-900">
          Atlas — Contributor frontend
        </h1>
        <p className="text-zinc-700">
          Diagnostic UI for verifying that ingest jobs landed correctly, dbt
          produced the expected mart shapes, and FK integrity holds. Reads{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em]">
            marts.*
          </code>{" "}
          directly via Postgres. Not a public-facing site — the customer-facing
          app for external developers lives at{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em]">
            atlas-frontend/
          </code>{" "}
          (locally{" "}
          <a
            href="http://localhost:3001"
            className="text-[#0062BA] underline hover:text-[#004580]"
          >
            http://localhost:3001
          </a>
          ).
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Diagnostic tools
        </h2>
        <ul className="grid gap-3 list-none p-0">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <a
                href={tool.href}
                className="block rounded-lg border border-zinc-300 bg-white px-5 py-4 no-underline transition-colors hover:border-[#0062BA] hover:shadow-[0_0_0_3px_rgba(0,98,186,0.12)]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <strong className="text-base font-semibold text-[#0062BA]">
                    {tool.title}
                  </strong>
                  <span className="shrink-0 font-medium text-[#0062BA]">
                    Open →
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-600">
                  {tool.description}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Atlas contributor frontend · Data fra{" "}
        <a
          href="https://www.ssb.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0062BA] underline hover:text-[#004580]"
        >
          SSB
        </a>
        ,{" "}
        <a
          href="https://www.fhi.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0062BA] underline hover:text-[#004580]"
        >
          FHI
        </a>
        , og{" "}
        <a
          href="https://www.rodekors.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0062BA] underline hover:text-[#004580]"
        >
          Røde Kors
        </a>
        .
      </p>
    </main>
  );
}
