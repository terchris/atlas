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
 * Options for fetch helpers that need to reach a non-default schema.
 *
 * PostgREST routes header-less requests to the FIRST schema in
 * `--schemas` (Atlas's default = api_v1). To reach `marts.*` or `raw.*`,
 * pass the matching schema name; the helper sends `Accept-Profile: <schema>`.
 * Header-omission against a non-default schema returns 404 — that's correct
 * routing, not a bug. Atlas hit this on 2026-05-07; see
 * `docs/ai-developer/plans/active/PLAN-007-...md` Phase 1 outcome.
 */
export type FetchOptions = {
  /** Routes the request to a non-default PostgREST schema. */
  acceptProfile?: string;
};

function buildHeaders(
  options: FetchOptions = {},
  extra: Record<string, string> = {},
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  if (options.acceptProfile && options.acceptProfile !== "api_v1") {
    headers["Accept-Profile"] = options.acceptProfile;
  }
  return headers;
}

/**
 * Fetch a list of rows from a PostgREST endpoint. Pass any PostgREST query
 * string in `query` (filters, order, limit, select, etc.).
 *
 * For curated `api_v1.*` endpoints, the typed overload gives row-shape
 * inference from `api-types.ts`. For `marts.*` / `raw.*` endpoints
 * (catalogue pages where the endpoint is dynamic), pass `acceptProfile`
 * and accept that rows come back as `unknown`.
 *
 * @example
 *   // typed (api_v1 default schema)
 *   const rows = await fetchRows("coverage_gap_barnefattigdom",
 *     "?order=value_pct.desc&limit=10");
 *
 *   // dynamic (marts schema)
 *   const rows = await fetchRows("dim_kommune",
 *     "?limit=50", { acceptProfile: "marts" });
 */
export async function fetchRows<K extends keyof components["schemas"]>(
  endpoint: K,
  query?: string,
  options?: FetchOptions,
): Promise<Schema<K>[]>;
export async function fetchRows(
  endpoint: string,
  query?: string,
  options?: FetchOptions,
): Promise<unknown[]>;
export async function fetchRows(
  endpoint: string,
  query: string = "",
  options: FetchOptions = {},
): Promise<unknown[]> {
  const url = buildUrl(`/${endpoint}${query}`);
  const res = await fetch(url, {
    headers: buildHeaders(options),
    // Server components: cache at request time but allow ISR to revalidate.
    // Override at the call site if a route needs harder freshness guarantees.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new ApiError(url, res.status, await res.text().catch(() => ""));
  }
  return (await res.json()) as unknown[];
}

/**
 * Get the row count for an endpoint without fetching the rows themselves.
 * Uses PostgREST's `Prefer: count=exact` header — the count comes back in
 * the `Content-Range` response header; we don't read the body.
 *
 * Pass an optional `query` to count rows matching a filter (e.g.
 * `"?or=(name.ilike.*oslo*,fylke_name.ilike.*oslo*)"`). The function adds
 * `limit=0` so no rows are returned. Pass `acceptProfile` to count rows
 * in a non-default schema.
 *
 * @example
 *   const total = await fetchCount("indicator_summary");  // → 163
 *   const filtered = await fetchCount("kommune_local_chapters",
 *     "?or=(kommune_name.ilike.*oslo*)");                 // → 4
 *   const martCount = await fetchCount("dim_kommune", "",
 *     { acceptProfile: "marts" });                        // → 357
 */
export async function fetchCount(
  endpoint: string,
  query: string = "",
  options: FetchOptions = {},
): Promise<number> {
  const sep = query.includes("?") ? "&" : "?";
  const url = buildUrl(`/${endpoint}${query}${sep}limit=0`);
  const res = await fetch(url, {
    headers: buildHeaders(options, { Prefer: "count=exact" }),
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
 * Fetch the OpenAPI/Swagger spec served at `GET /`. PostgREST returns one
 * spec per schema — the default schema unless `acceptProfile` is set, in
 * which case the spec for that schema. Used by the catalog + table-viewer
 * pages for introspection (column types, descriptions, filterable params).
 *
 * Returns the spec as `unknown` because PostgREST 14.x emits Swagger 2.0
 * which has a slightly different shape from OpenAPI 3.x. Callers narrow it
 * where needed.
 */
export async function fetchSpec(options: FetchOptions = {}): Promise<unknown> {
  const url = buildUrl("/");
  const res = await fetch(url, {
    headers: buildHeaders(options),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new ApiError(url, res.status, await res.text().catch(() => ""));
  }
  return await res.json();
}
