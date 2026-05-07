/**
 * /data/sources/[source_id] — per-source detail page.
 *
 * Three live fetches against PostgREST (all `cache: "no-store"`):
 *   - `api_v1.meta_sources?source_id=eq.<id>` — manifest metadata + freshness
 *   - `api_v1.meta_endpoints` — every endpoint Atlas exposes (full list; we
 *     filter client-side against the lineage join)
 *   - `marts.lineage?source_id=eq.<id>` (via Accept-Profile: marts) — the
 *     model-name rows this source feeds; PR #77's lineage seed
 *
 * Render shape:
 *   - Header card with source metadata (provider, license, periodicity,
 *     attribution, tags, freshness signals)
 *   - "Raw ingest table" block with a click-through to /data/raw/<table>
 *     (matched against meta_endpoints, not assumed)
 *   - "Derived endpoints" list — every endpoint whose table_name appears
 *     in the lineage rows (or whose api_v1 wrapper points at a lineage
 *     row's mart_<X> model)
 *
 * 404 when source_id doesn't exist in meta_sources.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic"; // see src/lib/api.ts fetchRows comment

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://api-atlas.localhost";

type MetaSource = {
  source_id: string;
  upstream_id: string;
  upstream_url: string;
  upstream_landing_page: string | null;
  upstream_title: string;
  description: string;
  publisher: string;
  license: string;
  license_url: string | null;
  periodicity: string;
  eu_theme: string;
  attribution: string;
  tags: string[];
  last_ingested_at: string | null;
  last_upstream_update_at: string | null;
  latest_row_count: number | null;
  total_runs: number;
  downstream_model_count: number;
};

type MetaEndpoint = {
  endpoint: string;
  schema_name: string;
  table_name: string;
  tags: string[];
};

type LineageRow = {
  model_name: string;
  source_id: string;
};

async function fetchSource(sourceId: string): Promise<MetaSource | null> {
  const res = await fetch(
    `${API_URL}/meta_sources?source_id=eq.${encodeURIComponent(sourceId)}&limit=1`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`meta_sources fetch failed: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as MetaSource[];
  return rows[0] ?? null;
}

async function fetchEndpoints(): Promise<MetaEndpoint[]> {
  const res = await fetch(`${API_URL}/meta_endpoints?order=endpoint`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`meta_endpoints fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as MetaEndpoint[];
}

async function fetchLineage(sourceId: string): Promise<LineageRow[]> {
  const res = await fetch(
    `${API_URL}/lineage?source_id=eq.${encodeURIComponent(sourceId)}`,
    {
      cache: "no-store",
      headers: { "Accept-Profile": "marts" },
    },
  );
  if (!res.ok) {
    throw new Error(`marts.lineage fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as LineageRow[];
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
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

/**
 * Match endpoints against lineage rows. Two cases:
 *   1. Direct: ep.table_name === lineage.model_name (marts.indicators__X,
 *      marts.dim_X, marts.fact_X, marts.mart_X, etc.)
 *   2. api_v1 wrapper: ep.schema_name === "api_v1" and `mart_${ep.table_name}`
 *      === lineage.model_name (the PLAN-004 wrapper convention strips the
 *      "mart_" prefix from `models/marts/api/mart_*.sql` to produce the
 *      api_v1 view name).
 *
 * Raw tables never appear in lineage as model_name (they're sources, not
 * derived models); we surface the raw table separately via fetchEndpoints
 * + the source_id-to-table_name convention.
 */
function findDerivedEndpoints(
  endpoints: MetaEndpoint[],
  lineage: LineageRow[],
): MetaEndpoint[] {
  const modelNames = new Set(lineage.map((l) => l.model_name));
  return endpoints.filter((ep) => {
    if (modelNames.has(ep.table_name)) return true;
    if (
      ep.schema_name === "api_v1" &&
      modelNames.has(`mart_${ep.table_name}`)
    ) {
      return true;
    }
    return false;
  });
}

function findRawEndpoint(
  endpoints: MetaEndpoint[],
  sourceId: string,
): MetaEndpoint | null {
  const expected = sourceId.replaceAll("-", "_");
  return (
    endpoints.find(
      (ep) => ep.schema_name === "raw" && ep.table_name === expected,
    ) ?? null
  );
}

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ source_id: string }>;
}) {
  const { source_id } = await params;

  const [src, allEndpoints, lineage] = await Promise.all([
    fetchSource(source_id),
    fetchEndpoints(),
    fetchLineage(source_id),
  ]);

  if (!src) {
    notFound();
  }

  const rawEndpoint = findRawEndpoint(allEndpoints, source_id);
  const derived = findDerivedEndpoints(allEndpoints, lineage);
  const provider =
    src.tags.find((t) => t.startsWith("provider:"))?.slice(9) ?? "";

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/data/sources"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← All sources
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <Link
            href={`/data?tag=provider:${provider}`}
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            All endpoints from {provider}
          </Link>
        </nav>

        <header className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {provider}
            </span>
            <h1 className="font-mono text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {src.source_id}
            </h1>
          </div>
          <p className="text-lg leading-7 text-zinc-700 dark:text-zinc-300">
            {src.upstream_title}
          </p>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {src.description}
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Source metadata
            </h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">Publisher</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{src.publisher}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">License</dt>
              <dd>
                {src.license_url ? (
                  <a
                    href={src.license_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {src.license}
                  </a>
                ) : (
                  <span className="text-zinc-900 dark:text-zinc-100">{src.license}</span>
                )}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Periodicity</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{src.periodicity}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">EU theme</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{src.eu_theme}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Upstream ID</dt>
              <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                {src.upstream_id}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Attribution</dt>
              <dd className="italic text-zinc-700 dark:text-zinc-300">
                {src.attribution}
              </dd>
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Freshness
            </h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">Last ingested</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {relativeTime(src.last_ingested_at)}
                {src.last_ingested_at && (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    ({new Date(src.last_ingested_at).toISOString().slice(0, 10)})
                  </span>
                )}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Upstream update</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {relativeTime(src.last_upstream_update_at)}
                {src.last_upstream_update_at && (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    ({new Date(src.last_upstream_update_at).toISOString().slice(0, 10)})
                  </span>
                )}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Total runs</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{src.total_runs}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Latest rows</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {src.latest_row_count !== null
                  ? src.latest_row_count.toLocaleString()
                  : "—"}
              </dd>
            </dl>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Tags ({src.tags.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {src.tags.map((tag) => (
              <Link
                key={tag}
                href={`/data?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                title={`Filter catalog by ${tag}`}
              >
                {tag}
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Upstream
          </h2>
          <div className="flex flex-col gap-1 text-sm">
            <a
              href={src.upstream_landing_page ?? src.upstream_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              Open at {src.publisher} ↗
            </a>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-500">
              {src.upstream_landing_page ?? src.upstream_url}
            </span>
          </div>
        </section>

        {rawEndpoint && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Raw ingest table
            </h2>
            <article className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${layerBadgeClass("raw")}`}
                  >
                    raw
                  </span>
                  <Link
                    href={`/data/raw/${rawEndpoint.table_name}`}
                    className="font-mono text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                  >
                    {rawEndpoint.table_name} →
                  </Link>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  verbatim landing — every row Atlas pulled from upstream
                </span>
              </div>
            </article>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Derived endpoints ({derived.length})
          </h2>
          {derived.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              No dbt models derive from this source yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {derived.map((ep) => {
                const layer = ep.schema_name;
                return (
                  <article
                    key={ep.endpoint}
                    className="rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${layerBadgeClass(layer)}`}
                        >
                          {layer}
                        </span>
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
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Sourced live from{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
            {API_URL}/meta_sources?source_id=eq.{src.source_id}
          </code>
          ,{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
            /meta_endpoints
          </code>
          , and{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
            /lineage
          </code>{" "}
          (Accept-Profile: marts). Lineage edges from{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
            atlas-data/dbt/seeds/sources/lineage.csv
          </code>
          .
        </footer>
      </main>
    </div>
  );
}
