/**
 * Atlas data catalog — introspection-driven.
 *
 * This page lists every endpoint Atlas's PostgREST exposes by reading the
 * live OpenAPI/Swagger spec at runtime. There are deliberately NO hardcoded
 * endpoint names in this file — adding a new mart_* view to atlas-data and
 * regenerating api_v1 makes a new entry appear here automatically on next
 * page load.
 *
 * See PLAN-005 Phase 4 + INVESTIGATE-frontend-data-access-architecture.md
 * for the design rationale.
 */

import Link from "next/link";

import { fetchCount, fetchSpec } from "@/lib/api";

export const revalidate = 60;

/**
 * The catalog page renders against the Swagger 2.0 spec PostgREST emits.
 * We narrow the relevant slice here rather than depending on a generated
 * Swagger 2.0 type (openapi-typescript only generates from OpenAPI 3.x).
 */
type Spec = {
  paths: Record<
    string,
    {
      get?: { summary?: string; description?: string };
    }
  >;
  definitions?: Record<
    string,
    {
      type?: string;
      properties?: Record<
        string,
        { type?: string; format?: string; description?: string }
      >;
    }
  >;
};

type EndpointEntry = {
  name: string;
  count: number | null;
  columns: Array<{
    name: string;
    type: string;
    format: string;
    description: string;
  }>;
};

async function loadCatalog(): Promise<EndpointEntry[]> {
  const spec = (await fetchSpec()) as Spec;

  // PostgREST emits one path per exposed view in the api_v1 schema.
  // Filter out the spec root ("/") which serves the spec itself, not data.
  const endpointNames = Object.keys(spec.paths)
    .filter((p) => p.startsWith("/") && p !== "/")
    .map((p) => p.slice(1))
    .sort();

  const results = await Promise.all(
    endpointNames.map(async (name): Promise<EndpointEntry> => {
      const count = await fetchCount(name).catch(() => null);
      const def = spec.definitions?.[name];
      const columns = def?.properties
        ? Object.entries(def.properties).map(([col, meta]) => ({
            name: col,
            type: meta.type ?? "unknown",
            format: meta.format ?? "",
            description: meta.description ?? "",
          }))
        : [];
      return { name, count, columns };
    }),
  );

  return results;
}

export default async function DataCatalogPage() {
  const catalog = await loadCatalog();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Catalog
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Atlas data
          </h1>
          <p className="max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Every endpoint Atlas&apos;s public API exposes. Each one is a curated
            view in the <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">api_v1</code>{" "}
            schema. Click an entry to see its columns. The list is sourced
            live from the API&apos;s OpenAPI spec — adding a new view publishes a
            new entry here automatically.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          {catalog.map((endpoint) => (
            <details
              key={endpoint.name}
              className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-base">
                <code className="font-mono text-sm text-zinc-950 dark:text-zinc-50">
                  /{endpoint.name}
                </code>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {endpoint.count !== null
                    ? `${endpoint.count.toLocaleString()} rows`
                    : "count unavailable"}
                </span>
              </summary>
              <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                {endpoint.columns.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {endpoint.columns.map((col) => (
                      <li key={col.name} className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-2">
                          <code className="font-mono text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {col.name}
                          </code>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {col.type}
                            {col.format ? ` (${col.format})` : ""}
                          </span>
                        </div>
                        {col.description && (
                          <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
                            {col.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No column metadata in spec.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    Try it:{" "}
                    <code className="font-mono">
                      curl &apos;
                      {process.env.NEXT_PUBLIC_API_URL ??
                        "http://api-atlas.localhost"}
                      /{endpoint.name}?limit=3&apos;
                    </code>
                  </span>
                  <Link
                    href={`/data/${endpoint.name}`}
                    className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                  >
                    View as table →
                  </Link>
                  <Link
                    href={`/data/${endpoint.name}/spec`}
                    className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                  >
                    View spec →
                  </Link>
                </div>
              </div>
            </details>
          ))}
        </section>

        <footer className="border-t border-zinc-200 pt-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            All {catalog.length} endpoints sourced live from{" "}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              {process.env.NEXT_PUBLIC_API_URL ??
                "http://api-atlas.localhost"}
              /
            </code>
            . Total rows across the catalog:{" "}
            {catalog
              .reduce((sum, e) => sum + (e.count ?? 0), 0)
              .toLocaleString()}
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
