/**
 * Pure helpers for the /data catalogue's tag-filter sidebar.
 *
 * Tags carry a namespace prefix: `provider:ssb`, `topic:income`,
 * `geo:kommune`, `cadence:annual`, `eu_theme:SOCI`, `layer:marts`.
 * An endpoint can carry multiple values within the same namespace
 * (e.g. fact_kommune_indicators has many topic: tags via union-inheritance
 * from the indicator sources it joins).
 *
 * Filter semantics — standard faceted-search:
 *   - AND across namespaces (a card matches if it has ≥1 tag from EACH
 *     selected namespace)
 *   - OR within a namespace (a card matches if it has ANY of the selected
 *     values for that namespace)
 *
 * Sidebar count semantics — also faceted-search:
 *   - For each unselected tag, count = endpoints that match all OTHER
 *     active filters AND have this tag. Numbers update as the user clicks.
 */

export type Endpoint = {
  endpoint: string;
  schema_name: string;
  table_name: string;
  tags: string[];
};

/** A `tag` query value can be undefined, a single string, or an array. */
export function normalizeActiveTags(
  raw: string | string[] | undefined,
): string[] {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw ? [raw] : [];
}

/** Group `["topic:income", "geo:kommune"]` → `Map { topic: ["income"], geo: ["kommune"] }`. */
export function groupTagsByNamespace(tags: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tag of tags) {
    const idx = tag.indexOf(":");
    if (idx === -1) continue;
    const ns = tag.slice(0, idx);
    const value = tag.slice(idx + 1);
    const list = out.get(ns) ?? [];
    list.push(value);
    out.set(ns, list);
  }
  return out;
}

/**
 * Apply faceted-search filtering: AND across namespaces, OR within a
 * namespace. Returns the matching endpoints in the input's order.
 *
 * Edge case: if `activeTags` is empty, returns the input unchanged.
 */
export function filterEndpoints(
  endpoints: Endpoint[],
  activeTags: string[],
): Endpoint[] {
  if (activeTags.length === 0) return endpoints;
  const byNamespace = groupTagsByNamespace(activeTags);
  return endpoints.filter((ep) => {
    for (const [ns, values] of byNamespace) {
      const matchesNs = values.some((v) => ep.tags.includes(`${ns}:${v}`));
      if (!matchesNs) return false;
    }
    return true;
  });
}

/**
 * Compute the counts shown in the sidebar.
 *
 * For every (namespace, value) tag the dataset carries, returns the count
 * of endpoints that:
 *   - match every OTHER active namespace's filter (intersection of others), AND
 *   - carry this tag value
 *
 * This is the standard faceted-search count behaviour — clicking a tag
 * within a namespace shows you how the count would change without
 * collapsing the namespace down to one option.
 */
export function computeSidebarCounts(
  endpoints: Endpoint[],
  activeTags: string[],
): Map<string, Map<string, number>> {
  const active = groupTagsByNamespace(activeTags);
  const result = new Map<string, Map<string, number>>();

  // Discover every (namespace, value) pair that appears in the dataset.
  const universe = new Map<string, Set<string>>();
  for (const ep of endpoints) {
    for (const tag of ep.tags) {
      const idx = tag.indexOf(":");
      if (idx === -1) continue;
      const ns = tag.slice(0, idx);
      const value = tag.slice(idx + 1);
      const set = universe.get(ns) ?? new Set<string>();
      set.add(value);
      universe.set(ns, set);
    }
  }

  for (const [ns, values] of universe) {
    const inner = new Map<string, number>();
    for (const value of values) {
      // Build a "would-be-active" set: keep all OTHER namespaces' filters,
      // replace THIS namespace with just [value]. Then count matches.
      const probeTags: string[] = [];
      for (const [otherNs, otherValues] of active) {
        if (otherNs === ns) continue;
        for (const v of otherValues) probeTags.push(`${otherNs}:${v}`);
      }
      probeTags.push(`${ns}:${value}`);
      inner.set(value, filterEndpoints(endpoints, probeTags).length);
    }
    result.set(ns, inner);
  }

  return result;
}

/**
 * Build the href for toggling a single tag in the active set. Returns
 * `/data` plus a query string with the tag added (if absent) or removed
 * (if present). Tags are always rendered as separate `tag=` params.
 */
export function buildToggleHref(
  activeTags: string[],
  tag: string,
  searchTerm: string = "",
): string {
  const next = activeTags.includes(tag)
    ? activeTags.filter((t) => t !== tag)
    : [...activeTags, tag];
  const params = new URLSearchParams();
  for (const t of next.sort()) params.append("tag", t);
  if (searchTerm) params.set("q", searchTerm);
  const qs = params.toString();
  return `/data${qs ? `?${qs}` : ""}`;
}

/** Order namespaces deterministically for the sidebar. */
const NAMESPACE_ORDER = [
  "layer",
  "provider",
  "topic",
  "geo",
  "cadence",
  "eu_theme",
];

export function orderedNamespaces(namespaces: Iterable<string>): string[] {
  const set = new Set(namespaces);
  const known = NAMESPACE_ORDER.filter((n) => set.has(n));
  const rest = [...set].filter((n) => !NAMESPACE_ORDER.includes(n)).sort();
  return [...known, ...rest];
}

/** Free-text search across endpoint name + tags. Case-insensitive. */
export function applyTextSearch(
  endpoints: Endpoint[],
  q: string,
): Endpoint[] {
  if (!q) return endpoints;
  const needle = q.toLowerCase();
  return endpoints.filter(
    (ep) =>
      ep.endpoint.toLowerCase().includes(needle) ||
      ep.tags.some((t) => t.toLowerCase().includes(needle)),
  );
}
