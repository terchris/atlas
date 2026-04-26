/**
 * Thin wrapper around Crawlee's `KeyValueStore` for per-source HTML body +
 * metadata caching. Per INVESTIGATE §C.1: body stored as `<key>.html`,
 * metadata as `<key>.metadata.json`. Cache root controlled by the env var
 * `CRAWLEE_STORAGE_DIR` (read by Crawlee directly; not touched here).
 *
 * Intentionally minimal — per-source code uses `getCachedBody`/`setCached`
 * rather than poking at `KeyValueStore` directly so we can swap the backend
 * (see §C.1.2's Postgres-archive upgrade path) without touching every source.
 */

import { KeyValueStore } from "crawlee";

export type CacheMetadata = {
  url: string;
  fetchedAt: string; // ISO-8601
  status: number;
  etag?: string | undefined;
  contentType?: string | undefined;
};

/**
 * Open (or create) the KeyValueStore for a given source. One store per source
 * keeps keys scoped so different scrapers don't collide on URL-derived keys.
 */
export async function getSourceKv(sourceSlug: string): Promise<KeyValueStore> {
  // Crawlee's store names are safe for alphanumerics + hyphen + underscore.
  // Source slugs already follow that convention (kebab-case).
  return KeyValueStore.open(`source-${sourceSlug}`);
}

export async function setCached(
  kv: KeyValueStore,
  key: string,
  body: string,
  metadata: CacheMetadata,
): Promise<void> {
  await kv.setValue(key, body, {
    contentType: "text/html; charset=utf-8",
  });
  await kv.setValue(`${key}.metadata`, metadata);
}

export async function getCachedBody(
  kv: KeyValueStore,
  key: string,
): Promise<string | null> {
  const value = await kv.getValue<string>(key);
  return value ?? null;
}

export async function getCachedMetadata(
  kv: KeyValueStore,
  key: string,
): Promise<CacheMetadata | null> {
  const value = await kv.getValue<CacheMetadata>(`${key}.metadata`);
  return value ?? null;
}

export async function hasCached(
  kv: KeyValueStore,
  key: string,
): Promise<boolean> {
  return (await kv.getValue(key)) !== null;
}
