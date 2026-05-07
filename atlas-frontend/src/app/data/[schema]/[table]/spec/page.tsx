/**
 * OpenAPI / Swagger spec viewer for one endpoint across api_v1 / marts / raw.
 *
 * URL: /data/<schema>/<table>/spec
 *
 * Shows the relevant slice of PostgREST's spec — definitions[<table>]
 * (columns + types + descriptions) plus paths[/<table>] (HTTP method
 * surface + filterable query parameters). The slice is rendered as
 * pretty-printed JSON; external developers can copy any of it directly
 * into their own client codegen / docs / mental model.
 *
 * Sibling of the table viewer at /data/<schema>/<table>; both routes are
 * accessed from the catalog at /data via per-endpoint links.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchSpec } from "@/lib/api";

export const dynamic = "force-dynamic"; // see src/lib/api.ts fetchSpec comment

const VALID_SCHEMAS = new Set(["api_v1", "marts", "raw"]);

type Spec = {
  swagger?: string;
  info?: { title?: string; version?: string };
  paths: Record<string, unknown>;
  definitions?: Record<string, unknown>;
};

type EndpointSlice = {
  table: string;
  schema: string;
  definition: unknown | null;
  path: unknown | null;
  context: { swagger?: string; info?: { title?: string; version?: string } };
};

function loadSlice(
  spec: Spec,
  schema: string,
  table: string,
): EndpointSlice | null {
  const pathKey = `/${table}`;
  if (!Object.prototype.hasOwnProperty.call(spec.paths, pathKey)) {
    return null;
  }
  return {
    table,
    schema,
    definition: spec.definitions?.[table] ?? null,
    path: spec.paths[pathKey],
    context: {
      swagger: spec.swagger,
      info: spec.info,
    },
  };
}

export default async function EndpointSpecPage({
  params,
}: {
  params: Promise<{ schema: string; table: string }>;
}) {
  const { schema, table } = await params;

  if (!VALID_SCHEMAS.has(schema)) {
    notFound();
  }

  const spec = (await fetchSpec({ acceptProfile: schema })) as Spec;
  const slice = loadSlice(spec, schema, table);

  if (!slice) {
    notFound();
  }

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://api-atlas.localhost";

  const sliceJson = JSON.stringify(
    {
      definition: slice.definition,
      path: slice.path,
      context: slice.context,
    },
    null,
    2,
  );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/data"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Back to catalog
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <Link
            href={`/data/${schema}/${table}`}
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            View as table
          </Link>
        </nav>

        <header className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {schema}
            </span>
            <h1 className="font-mono text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {table}
              <span className="ml-3 text-base font-normal text-zinc-500 dark:text-zinc-400">
                spec
              </span>
            </h1>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The relevant slice of PostgREST&apos;s OpenAPI/Swagger spec for
            this endpoint — column shapes + descriptions and the filterable
            query-parameter surface. This is the contract: paste any of it
            into your own client.
          </p>
        </header>

        <section className="flex flex-wrap gap-3 text-xs">
          <a
            href={`${apiBase}/`}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-mono text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Full spec at {apiBase}/{schema !== "api_v1" ? ` (Accept-Profile: ${schema})` : ""} ↗
          </a>
          <a
            href={`${apiBase}/${table}`}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-mono text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Endpoint at {apiBase}/{table} ↗
          </a>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            JSON slice
          </div>
          <pre className="overflow-auto px-4 py-4 font-mono text-xs leading-relaxed text-zinc-900 dark:text-zinc-100">
            <code>{sliceJson}</code>
          </pre>
        </section>

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          PostgREST 14.x emits Swagger 2.0 (release notes call it &quot;OpenAPI
          2.0&quot; — same spec, two names). The format key in the full document
          is <code className="font-mono">.swagger == &quot;2.0&quot;</code>. Multi-schema
          PostgREST returns one spec per schema; switch via the{" "}
          <code className="font-mono">Accept-Profile</code> request header.
        </footer>
      </main>
    </div>
  );
}
