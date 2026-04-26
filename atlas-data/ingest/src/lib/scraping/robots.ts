/**
 * robots.txt fetch and URL-allowance verifier.
 *
 * Hand-rolled parser (per [P1S.Q2] — kept the dep list small; robots.txt
 * syntax is simple enough). Supports:
 *   - User-agent blocks (specific UA or `*` wildcard)
 *   - Disallow and Allow directives
 *   - Longest-match-wins semantics
 *   - `*` and `$` wildcards in paths
 *   - Crawl-Delay (parsed, returned alongside the rules)
 *
 * A scrape's discover stage should call `fetchRobots(host)` then
 * `isAllowed(rules, url, userAgent)` for each URL before fetching — per
 * INVESTIGATE-ngo-scraping-infrastructure §A.3 + §D.4 (re-check every run).
 *
 * A missing robots.txt (404) is treated as "everything allowed" — the
 * conventional interpretation per the robots.txt spec.
 */

export interface RobotsGroup {
  disallow: string[];
  allow: string[];
  crawlDelay?: number;
}

export interface RobotsRules {
  host: string;
  /** Keyed by lowercase user-agent token. `*` is the wildcard fallback. */
  userAgentRules: Map<string, RobotsGroup>;
}

/**
 * Fetch and parse `https://<host>/robots.txt`. Non-2xx responses are treated
 * as "no rules" (everything allowed). Network errors propagate.
 */
export async function fetchRobots(host: string): Promise<RobotsRules> {
  const url = `https://${host}/robots.txt`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    return { host, userAgentRules: new Map() };
  }
  const text = await res.text();
  return parseRobots(host, text);
}

export function parseRobots(host: string, text: string): RobotsRules {
  const userAgentRules = new Map<string, RobotsGroup>();
  let currentUAs: string[] = [];
  let expectingGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "user-agent") {
      if (!expectingGroup) {
        // Starting a new UA block — reset the accumulator.
        currentUAs = [];
      }
      currentUAs.push(value.toLowerCase());
      expectingGroup = true;
    } else if (
      field === "disallow" ||
      field === "allow" ||
      field === "crawl-delay"
    ) {
      expectingGroup = false;
      for (const ua of currentUAs) {
        const group = userAgentRules.get(ua) ?? { disallow: [], allow: [] };
        if (field === "disallow") {
          group.disallow.push(value);
        } else if (field === "allow") {
          group.allow.push(value);
        } else if (field === "crawl-delay") {
          const n = Number(value);
          if (!Number.isNaN(n)) group.crawlDelay = n;
        }
        userAgentRules.set(ua, group);
      }
    }
    // Sitemap, Host, and unknown fields are ignored here — sitemap discovery
    // is handled separately in discover.ts.
  }

  return { host, userAgentRules };
}

/**
 * Decide whether `url` is allowed for the given `userAgent` per `rules`.
 *
 * The UA token is the part of the UA string before the first `/` (e.g.
 * `"Atlas"` from `"Atlas/0.1 (...)"`), lowercased. If no specific rules
 * exist for that token, the `*` wildcard group is used. If neither exists,
 * the URL is allowed.
 *
 * Match semantics: longest matching pattern wins. Ties go to Allow (per the
 * de-facto robots.txt standard and Google's reference implementation).
 */
export function isAllowed(
  rules: RobotsRules,
  url: string,
  userAgent: string,
): boolean {
  const u = new URL(url);
  const path = u.pathname + (u.search || "");

  const uaToken = userAgent.split("/")[0]?.toLowerCase() ?? "";
  const specific = rules.userAgentRules.get(uaToken);
  const wildcard = rules.userAgentRules.get("*");
  const applicable = specific ?? wildcard;
  if (!applicable) return true;

  let bestLen = -1;
  let bestAllowed = true;

  for (const pattern of applicable.disallow) {
    if (pattern === "") continue; // `Disallow:` (empty) means allow all
    const m = matchLength(pattern, path);
    if (m !== null && (m > bestLen || (m === bestLen && !bestAllowed))) {
      bestLen = m;
      bestAllowed = false;
    }
  }
  for (const pattern of applicable.allow) {
    if (pattern === "") continue;
    const m = matchLength(pattern, path);
    if (m !== null && m >= bestLen) {
      bestLen = m;
      bestAllowed = true;
    }
  }

  return bestAllowed;
}

/**
 * If `pattern` matches `path`, return the pattern's effective length (for
 * longest-match wins). Otherwise return null. Supports `*` (any chars) and
 * trailing `$` (end-anchor).
 */
function matchLength(pattern: string, path: string): number | null {
  // Escape regex specials (but NOT `*` — it's a robots wildcard, handled below).
  // Then convert `*` to `.*`. A trailing `\$` (now escaped) becomes `$` end-anchor.
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const anchored = escaped.endsWith("\\$") ? escaped.slice(0, -2) + "$" : escaped;
  const regex = new RegExp("^" + anchored);
  return regex.test(path) ? pattern.length : null;
}
