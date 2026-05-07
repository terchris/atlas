/**
 * Atlas data catalog — open by default, organised by tags.
 *
 * Reads `api_v1.meta_endpoints` to discover every queryable endpoint
 * across api_v1, marts, and raw schemas. There are deliberately NO
 * hardcoded endpoint names here — adding any new model, raw table, or
 * api_v1 wrapper makes a new card appear here on next page load.
 *
 * Layout: filter sidebar on the left (namespace-grouped checkboxes with
 * faceted-search counts), endpoint cards on the right. URL-driven filter
 * state (`?tag=topic:income&tag=geo:kommune`) is bookmarkable.
 *
 * Filter semantics: AND across namespaces, OR within a namespace —
 * standard faceted search. See `lib/catalog-filter.ts` for the pure
 * helpers + tests.
 *
 * Cards link to `/data/<schema>/<table>` (table viewer) and
 * `/data/<schema>/<table>/spec` (spec viewer). The table viewer sends
 * `Accept-Profile: <schema>` for non-default schemas.
 */

import Link from "next/link";

import {
  type Endpoint,
  applyTextSearch,
  buildToggleHref,
  computeSidebarCounts,
  filterEndpoints,
  groupTagsByNamespace,
  normalizeActiveTags,
  orderedNamespaces,
} from "@/lib/catalog-filter";

export const revalidate = 60;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://api-atlas.localhost";

async function fetchEndpoints(): Promise<Endpoint[]> {
  const res = await fetch(`${API_URL}/meta_endpoints?order=endpoint`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(
      `meta_endpoints fetch failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as Endpoint[];
}

function namespaceLabel(ns: string): string {
  switch (ns) {
    case "eu_theme":
      return "EU theme";
    case "layer":
      return "Layer";
    case "provider":
      return "Provider";
    case "topic":
      return "Topic";
    case "geo":
      return "Geography";
    case "cadence":
      return "Cadence";
    default:
      return ns;
  }
}

function layerBadgeClass(layer: string): string {
  switch (layer) {
    case "api_v1":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "marts":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300";
    case "raw":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
}

export default async function DataCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const activeTags = normalizeActiveTags(sp.tag);
  const q = String(sp.q ?? "").trim();

  const allEndpoints = await fetchEndpoints();
  const tagFiltered = filterEndpoints(allEndpoints, activeTags);
  const visible = applyTextSearch(tagFiltered, q);
  const counts = computeSidebarCounts(allEndpoints, activeTags);
  const namespaces = orderedNamespaces(counts.keys());
  const activeByNs = groupTagsByNamespace(activeTags);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Catalog
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Atlas data
          </h1>
          <p className="max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Every queryable endpoint Atlas exposes — across the curated{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">api_v1</code>{" "}
            wrappers, the dbt-built{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">marts</code>{" "}
            layer, and the verbatim{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">raw</code>{" "}
            ingest tables. Filter by any combination of tags. The list is
            sourced live from{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
              api_v1.meta_endpoints
            </code>{" "}
            — see also{" "}
            <Link href="/data/sources" className="underline">
              /data/sources
            </Link>{" "}
            for the per-ingest-source view.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          {/* Sidebar */}
          <aside className="flex flex-col gap-6">
            <form method="GET" action="/data" className="flex gap-2">
              {activeTags.map((t) => (
                <input key={t} type="hidden" name="tag" value={t} />
              ))}
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search endpoints…"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Go
              </button>
            </form>

            {activeTags.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>Active filters ({activeTags.length})</span>
                  <Link
                    href={q ? `/data?q=${encodeURIComponent(q)}` : "/data"}
                    className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                  >
                    Clear
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeTags.map((tag) => (
                    <Link
                      key={tag}
                      href={buildToggleHref(activeTags, tag, q)}
                      className="group inline-flex items-center gap-1 rounded-full bg-zinc-950 px-2 py-0.5 text-xs font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      title={`Remove ${tag}`}
                    >
                      <span>{tag}</span>
                      <span className="text-xs opacity-60 group-hover:opacity-100">
                        ✕
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {namespaces.map((ns) => {
              const values = counts.get(ns);
              if (!values || values.size === 0) return null;
              const sortedValues = [...values.entries()].sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0].localeCompare(b[0]);
              });
              const activeForNs = new Set(activeByNs.get(ns) ?? []);
              return (
                <section key={ns} className="flex flex-col gap-2">
                  <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {namespaceLabel(ns)}
                  </h2>
                  <ul className="flex flex-col gap-0.5">
                    {sortedValues.map(([value, count]) => {
                      const tag = `${ns}:${value}`;
                      const active = activeForNs.has(value);
                      const disabled = !active && count === 0;
                      return (
                        <li key={value}>
                          {disabled ? (
                            <span className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-zinc-300 dark:text-zinc-700">
                              <span>{value}</span>
                              <span className="font-mono text-xs">0</span>
                            </span>
                          ) : (
                            <Link
                              href={buildToggleHref(activeTags, tag, q)}
                              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm transition-colors ${
                                active
                                  ? "bg-zinc-950 font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                                  : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex h-3 w-3 items-center justify-center rounded-sm border ${
                                    active
                                      ? "border-zinc-50 bg-zinc-50 text-zinc-950 dark:border-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
                                      : "border-zinc-400 dark:border-zinc-600"
                                  }`}
                                >
                                  {active ? "✓" : ""}
                                </span>
                                {value}
                              </span>
                              <span
                                className={`font-mono text-xs ${
                                  active
                                    ? "text-zinc-300 dark:text-zinc-600"
                                    : "text-zinc-500 dark:text-zinc-400"
                                }`}
                              >
                                {count}
                              </span>
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </aside>

          {/* Cards */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between text-sm text-zinc-600 dark:text-zinc-400">
              <span>
                Showing <strong>{visible.length.toLocaleString()}</strong> of{" "}
                {allEndpoints.length.toLocaleString()} endpoints
                {(activeTags.length > 0 || q) && (
                  <>
                    {" "}— filtered
                    {q && (
                      <>
                        {" "}by <code className="font-mono text-xs">{q}</code>
                      </>
                    )}
                    {activeTags.length > 0 && (
                      <> across {activeTags.length} tag{activeTags.length === 1 ? "" : "s"}</>
                    )}
                  </>
                )}
              </span>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                No endpoints match the current filters.
              </div>
            ) : (
              visible.map((ep) => {
                const layer = ep.tags.find((t) => t.startsWith("layer:"))?.slice(6) ?? "";
                const otherTags = ep.tags.filter(
                  (t) => !t.startsWith("layer:"),
                );
                return (
                  <article
                    key={ep.endpoint}
                    className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        {layer && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${layerBadgeClass(
                              layer,
                            )}`}
                          >
                            {layer}
                          </span>
                        )}
                        <Link
                          href={`/data/${ep.schema_name}/${ep.table_name}`}
                          className="font-mono text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                        >
                          {ep.table_name}
                        </Link>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <Link
                          href={`/data/${ep.schema_name}/${ep.table_name}`}
                          className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                        >
                          View as table →
                        </Link>
                        <Link
                          href={`/data/${ep.schema_name}/${ep.table_name}/spec`}
                          className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                        >
                          View spec →
                        </Link>
                      </div>
                    </div>
                    {otherTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {otherTags.sort().map((tag) => {
                          const active = activeTags.includes(tag);
                          return (
                            <Link
                              key={tag}
                              href={buildToggleHref(activeTags, tag, q)}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                                active
                                  ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                              }`}
                              title={active ? `Remove ${tag}` : `Filter by ${tag}`}
                            >
                              {tag}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </div>

        <footer className="border-t border-zinc-200 pt-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            Sourced live from{" "}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              {API_URL}/meta_endpoints
            </code>
            . Schema-aware: {allEndpoints.filter((e) => e.schema_name === "api_v1").length}{" "}
            <code className="rounded bg-emerald-100 px-1 text-xs dark:bg-emerald-900/40">
              api_v1
            </code>
            , {allEndpoints.filter((e) => e.schema_name === "marts").length}{" "}
            <code className="rounded bg-sky-100 px-1 text-xs dark:bg-sky-900/40">
              marts
            </code>
            , {allEndpoints.filter((e) => e.schema_name === "raw").length}{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
              raw
            </code>
            . Tag URLs (e.g.{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
              ?tag=topic:income&amp;tag=geo:kommune
            </code>
            ) are bookmarkable.
          </p>
        </footer>
      </main>
    </div>
  );
}
