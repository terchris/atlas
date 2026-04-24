/**
 * Typed Brreg Enhetsregister client.
 *
 * Query-param types come from the official spec at https://github.com/brreg/openAPI
 * (see schema.ts — regenerate via `npm run refresh:brreg-schema` when Brreg
 * updates the spec). Brreg's OpenAPI spec types the response bodies as `string`
 * rather than describing the HAL envelope, so we apply a small local
 * `HalResponse<T>` type and cast at the boundary. The query-param side is
 * fully typed; that's where most of the value sits anyway.
 */

import createClient from "openapi-fetch";
import type { paths, components } from "./schema.js";

const BASE_URL = "https://data.brreg.no/enhetsregisteret/api";

export const brregClient = createClient<paths>({ baseUrl: BASE_URL });

/** Alias for the ubiquitous Enhet schema type. */
export type Enhet = components["schemas"]["Enhet"];

/**
 * Brreg HAL envelope — shared across `/enheter`, `/underenheter`, etc.
 * The OpenAPI spec doesn't describe this, so we define it locally.
 */
export interface HalResponse<T> {
  _embedded?: Record<string, T[]>;
  _links?: Record<string, { href?: string }>;
  page?: {
    size?: number;
    totalElements?: number;
    totalPages?: number;
    number?: number;
  };
}

/**
 * Walk a paginated HAL endpoint. `fetchPage(page)` must return the raw
 * envelope body (or undefined on error). Yields each page's items until the
 * response is empty or we've reached totalPages.
 *
 * Usage:
 *   for await (const batch of paginate(
 *     (p) => fetchEnheter({ navn: 'norsk folkehjelp', organisasjonsform: 'FLI', page: p, size: 100 }),
 *     'enheter',
 *   )) { ... }
 */
export async function* paginate<T>(
  fetchPage: (page: number) => Promise<HalResponse<T> | undefined>,
  embeddedKey: string,
): AsyncGenerator<T[]> {
  let page = 0;
  while (true) {
    const resp = await fetchPage(page);
    if (!resp) return;
    const items = resp._embedded?.[embeddedKey] ?? [];
    if (items.length === 0) return;
    yield items;
    const totalPages = resp.page?.totalPages ?? 0;
    if (page + 1 >= totalPages) return;
    page += 1;
  }
}

/**
 * Convenience: typed `GET /enheter` that returns the raw HAL body. The query
 * params are type-checked against the OpenAPI spec; the response is cast
 * because the spec doesn't describe the envelope. Non-2xx responses → undefined
 * (caller decides how to handle).
 */
export async function fetchEnheter(
  query: NonNullable<paths["/enheter"]["parameters"]["query"]>,
): Promise<HalResponse<Enhet> | undefined> {
  const { data, response } = await brregClient.GET("/enheter", { params: { query } });
  if (!response.ok) return undefined;
  // The spec types `data` as string; the actual body is a HAL JSON object.
  return data as unknown as HalResponse<Enhet>;
}
