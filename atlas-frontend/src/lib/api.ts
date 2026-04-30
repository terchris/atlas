/**
 * Typed PostgREST client for the Atlas customer frontend.
 *
 * No SQL, no `postgres.js`, no DB role. Every read is an HTTP fetch against
 * `process.env.NEXT_PUBLIC_API_URL` (Atlas's public PostgREST instance, or
 * any compatible PostgREST 12+ deployment for forks).
 *
 * Types come from `src/lib/api-types.ts`, which is regenerated from the live
 * OpenAPI spec via `npm run api:types`. Never edit `api-types.ts` by hand —
 * descriptions, types, and formats all flow through dbt schema.yml →
 * dbt-osmosis → COMMENT ON COLUMN → PostgREST spec → this typed surface.
 *
 * This module imports only from `node_modules` and `./api-types`. Per the
 * forkability constraint in INVESTIGATE-frontend-data-access-architecture.md,
 * it must not import from `atlas-data/`, `atlas-contributor-frontend/`, or
 * `website/`.
 */

import type { components, paths } from "./api-types";

/** Endpoint paths PostgREST exposes (e.g. `/coverage_gap_barnefattigdom`). */
export type EndpointPath = keyof paths;

/** Schema name → row type. e.g. `Schema<"coverage_gap_barnefattigdom">`. */
export type Schema<K extends keyof components["schemas"]> =
  components["schemas"][K];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://api-atlas.localhost";

/**
 * Build an absolute URL against the configured API base.
 * `path` may include a leading slash or not; query string is preserved.
 */
function buildUrl(path: string): string {
  const base = API_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Standardised error for non-2xx responses. Surfaces enough to debug
 * (URL, status, response body if any) without leaking secrets — the API
 * is anonymous-read so there are none to leak.
 */
export class ApiError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Atlas API ${status} on ${url}${body ? `: ${body}` : ""}`);
  }
}

/**
 * Fetch a list of rows from a curated PostgREST endpoint with full type
 * inference. Pass any PostgREST query string in `path` (filters, order,
 * limit, select, etc.).
 *
 * @example
 *   const rows = await fetchRows("coverage_gap_barnefattigdom",
 *     "?order=value_pct.desc&limit=10");
 */
export async function fetchRows<K extends keyof components["schemas"]>(
  endpoint: K,
  query: string = "",
): Promise<Schema<K>[]> {
  const url = buildUrl(`/${String(endpoint)}${query}`);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Server components: cache at request time but allow ISR to revalidate.
    // Override at the call site if a route needs harder freshness guarantees.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new ApiError(url, res.status, await res.text().catch(() => ""));
  }
  return (await res.json()) as Schema<K>[];
}

/**
 * Get the row count for an endpoint without fetching the rows themselves.
 * Uses PostgREST's `Prefer: count=exact` header — the count comes back in
 * the `Content-Range` response header; we don't read the body.
 *
 * Pass an optional `query` to count rows matching a filter (e.g.
 * `"?or=(name.ilike.*oslo*,fylke_name.ilike.*oslo*)"`). The function adds
 * `limit=0` so no rows are returned.
 *
 * @example
 *   const total = await fetchCount("indicator_summary");  // → 163
 *   const filtered = await fetchCount("kommune_local_chapters",
 *     "?or=(kommune_name.ilike.*oslo*)");                 // → 4
 */
export async function fetchCount(
  endpoint: string,
  query: string = "",
): Promise<number> {
  const sep = query.includes("?") ? "&" : "?";
  const url = buildUrl(`/${endpoint}${query}${sep}limit=0`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Prefer: "count=exact",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new ApiError(url, res.status, await res.text().catch(() => ""));
  }
  // Content-Range looks like "0-9/123" or "*/123" when limit=0.
  const range = res.headers.get("content-range");
  const match = range?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Fetch the full OpenAPI/Swagger spec served at `GET /`. Used by the
 * data-catalog page (`app/data/page.tsx`) for introspection — listing
 * every available endpoint with its column types and descriptions, with
 * no hardcoded endpoint names.
 *
 * Returns the spec as `unknown` because PostgREST 14.x emits Swagger 2.0
 * which has a slightly different shape from OpenAPI 3.x. The catalog page
 * narrows it where needed.
 */
export async function fetchSpec(): Promise<unknown> {
  const url = buildUrl("/");
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new ApiError(url, res.status, await res.text().catch(() => ""));
  }
  return await res.json();
}
