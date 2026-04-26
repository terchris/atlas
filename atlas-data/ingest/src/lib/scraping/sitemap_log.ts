/**
 * raw.sitemap_log reader/writer. Implements the §C.2 discover-run procedure
 * from INVESTIGATE-ngo-scraping-infrastructure.md.
 *
 * Procedure for a discover run:
 *   1. Read current sitemap → {url, lastmod_now}.
 *   2. `readPriorState(sql, sourceSlug)` — snapshot log state BEFORE writes.
 *   3. `decideFetch(prior, discovered, urlsWithRawRow)` — pure skip/fetch
 *      decision. Must use the prior snapshot, not re-queried state.
 *   4. `upsertDiscovered(sql, sourceSlug, discovered)` — write current
 *      lastmod + last_seen_at for every discovered URL.
 *   5. `detectOrphans(sql, sourceSlug, runStartedAt)` — URLs whose last_seen_at
 *      is older than this run's started_at have dropped off the sitemap.
 */

import type postgres from "postgres";
import { upsert } from "../postgres.js";

export type DiscoveredUrl = {
  url: string;
  /** `<lastmod>` from the sitemap; null if absent or for HTML-index sources. */
  lastmod: Date | null;
};

export type PriorStateEntry = {
  stored_lastmod: Date | null;
  last_seen_at: Date;
};

export type PriorState = Map<string, PriorStateEntry>;

export type FetchAction = "fetch" | "skip";

export type FetchDecision = {
  url: string;
  action: FetchAction;
  reason: string;
};

/**
 * Read sitemap_log entries for a source. Returns an empty map for first runs.
 * Call this BEFORE any writes — step 3's skip decisions must compare against
 * pre-run state.
 */
export async function readPriorState(
  sql: postgres.Sql,
  sourceSlug: string,
): Promise<PriorState> {
  const rows = await sql<
    { url: string; lastmod: Date | null; last_seen_at: Date }[]
  >`
    select url, lastmod, last_seen_at
    from raw.sitemap_log
    where source_slug = ${sourceSlug}
  `;
  const map: PriorState = new Map();
  for (const r of rows) {
    map.set(r.url, { stored_lastmod: r.lastmod, last_seen_at: r.last_seen_at });
  }
  return map;
}

/**
 * Pure function. Skip only when all four hold:
 *   1. URL has a prior log row with non-null stored_lastmod.
 *   2. lastmod_now is non-null.
 *   3. lastmod_now <= stored_lastmod.
 *   4. A corresponding raw.<source>_* row exists (previous attempt succeeded).
 * Otherwise fetch.
 */
export function decideFetch(
  prior: PriorState,
  discovered: readonly DiscoveredUrl[],
  urlsWithRawRow: ReadonlySet<string>,
): FetchDecision[] {
  const out: FetchDecision[] = [];
  for (const d of discovered) {
    const p = prior.get(d.url);
    if (!p) {
      out.push({ url: d.url, action: "fetch", reason: "first-seen" });
      continue;
    }
    if (p.stored_lastmod === null) {
      out.push({ url: d.url, action: "fetch", reason: "prior-lastmod-null" });
      continue;
    }
    if (d.lastmod === null) {
      out.push({ url: d.url, action: "fetch", reason: "current-lastmod-null" });
      continue;
    }
    if (!urlsWithRawRow.has(d.url)) {
      out.push({ url: d.url, action: "fetch", reason: "no-prior-raw-row" });
      continue;
    }
    if (d.lastmod.getTime() > p.stored_lastmod.getTime()) {
      out.push({ url: d.url, action: "fetch", reason: "lastmod-advanced" });
      continue;
    }
    out.push({ url: d.url, action: "skip", reason: "unchanged" });
  }
  return out;
}

/**
 * Upsert discovered URLs into sitemap_log. Updates last_seen_at to now() for
 * existing rows, inserts new URLs with first_seen_at = last_seen_at = now().
 */
export async function upsertDiscovered(
  sql: postgres.Sql,
  sourceSlug: string,
  discovered: readonly DiscoveredUrl[],
): Promise<void> {
  if (discovered.length === 0) return;
  const now = new Date();
  const rows = discovered.map((d) => ({
    source_slug: sourceSlug,
    url: d.url,
    lastmod: d.lastmod,
    first_seen_at: now,
    last_seen_at: now,
  }));
  await upsert(sql, {
    table: "raw.sitemap_log",
    rows,
    columns: ["source_slug", "url", "lastmod", "first_seen_at", "last_seen_at"],
    conflictKeys: ["source_slug", "url"],
  });
}

/**
 * URLs that have dropped off the sitemap — rows whose last_seen_at is older
 * than the run's started_at. The caller is expected to propagate `is_active =
 * false` to the corresponding raw.<source>_* rows (§E.1).
 */
export async function detectOrphans(
  sql: postgres.Sql,
  sourceSlug: string,
  runStartedAt: Date,
): Promise<string[]> {
  const rows = await sql<{ url: string }[]>`
    select url
    from raw.sitemap_log
    where source_slug = ${sourceSlug}
      and last_seen_at < ${runStartedAt}
  `;
  return rows.map((r) => r.url);
}
