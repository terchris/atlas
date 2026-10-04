/**
 * file: ingest/src/lib/robots.ts
 * description: robots.txt parsing and URL allowance - ported from Atlas.
 *
 * Taken from `atlas-data/ingest/src/lib/scraping/robots.ts` in terchris/atlas (same parser,
 * same longest-match-wins semantics) so the research and Atlas read a site's rules the same
 * way. This research crawled 11 sites without consulting robots.txt programmatically; a
 * manual audit on 3 Oct 2026 found 4h.no asks every crawler for a 5 s Crawl-delay and the
 * 26 Sep crawl ran at 0.9 s. Checked in code, it cannot be forgotten per site.
 */

export interface RobotsGroup { disallow: string[]; allow: string[]; crawlDelay?: number; }

export interface RobotsRules {
  host: string;
  /** Keyed by lowercase user-agent token. `*` is the wildcard fallback. */
  userAgentRules: Map<string, RobotsGroup>;
}

export function parseRobots(host: string, text: string): RobotsRules {
  const userAgentRules = new Map<string, RobotsGroup>();
  let currentUAs: string[] = [];
  let expectingGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!expectingGroup) currentUAs = [];
      currentUAs.push(value.toLowerCase());
      expectingGroup = true;
    } else if (field === 'disallow' || field === 'allow' || field === 'crawl-delay') {
      expectingGroup = false;
      for (const ua of currentUAs) {
        const group = userAgentRules.get(ua) ?? { disallow: [], allow: [] };
        if (field === 'disallow') group.disallow.push(value);
        else if (field === 'allow') group.allow.push(value);
        else if (!Number.isNaN(Number(value))) group.crawlDelay = Number(value);
        userAgentRules.set(ua, group);
      }
    }
  }
  return { host, userAgentRules };
}

/** The group that applies to this user agent: its own token's, else `*`'s. */
export function groupFor(rules: RobotsRules, userAgent: string): RobotsGroup | undefined {
  const token = userAgent.split('/')[0]?.toLowerCase() ?? '';
  return rules.userAgentRules.get(token) ?? rules.userAgentRules.get('*');
}

/** Longest matching pattern wins; ties go to Allow. */
export function isAllowed(rules: RobotsRules, url: string, userAgent: string): boolean {
  const u = new URL(url);
  const path = u.pathname + (u.search || '');
  const group = groupFor(rules, userAgent);
  if (!group) return true;

  let bestLen = -1;
  let allowed = true;
  for (const p of group.disallow) {
    if (p === '') continue;
    const m = matchLength(p, path);
    if (m !== null && (m > bestLen || (m === bestLen && !allowed))) { bestLen = m; allowed = false; }
  }
  for (const p of group.allow) {
    if (p === '') continue;
    const m = matchLength(p, path);
    if (m !== null && m >= bestLen) { bestLen = m; allowed = true; }
  }
  return allowed;
}

function matchLength(pattern: string, path: string): number | null {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const anchored = escaped.endsWith('\\$') ? `${escaped.slice(0, -2)}$` : escaped;
  return new RegExp(`^${anchored}`).test(path) ? pattern.length : null;
}
