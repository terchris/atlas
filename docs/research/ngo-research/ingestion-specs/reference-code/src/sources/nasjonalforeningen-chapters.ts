/**
 * file: ingest/src/sources/nasjonalforeningen-chapters.ts
 * description: Pull Nasjonalforeningen's local chapters from its WordPress REST API.
 * output: data/nasjonalforeningen/chapters.crawl.json
 *
 * NOT a scrape. The site exposes a `local_branch` custom post type at
 * /wp-json/wp/v2/local_branch, so 431 chapters arrive in 5 paginated calls rather than
 * 431 page fetches. The per-chapter detail still lives in `content.rendered`, which is
 * class-annotated WordPress block markup and parses deterministically.
 *
 * WHY THIS ORGANISATION NEXT: it holds 121 of the dataset's LOW-confidence registry
 * matches - 88% of all unverified matches across eleven organisations. Its local units are
 * named '<place> helselag' or '<place> demensforening' with no national brand token, so a
 * name-pattern match alone cannot tell a real chapter from an unrelated health association.
 * Reconciling this crawl against the registry converts each of those 121 guesses into
 * BOTH (confirmed) or REGISTRY_ONLY (still unverified).
 *
 *   npm run nasjonalforeningen -- --limit 20   # smoke test
 *   npm run nasjonalforeningen                 # full pull
 */

import * as path from 'path';
import { getJson } from '../lib/http';
import Logger from '../lib/logger';
import { slugify, stripHtml } from '../lib/text';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import type { Activity, Chapter, Collection, Contact } from '../lib/types';

const BASE = 'https://nasjonalforeningen.no';
const ENDPOINT = `${BASE}/wp-json/wp/v2/local_branch`;
const ORG = { id: 'nasjonalforeningen', name: 'Nasjonalforeningen for folkehelsen' };
const EXTRACTOR_VERSION = '0.1.0';
const PAGE = 100;

interface Branch {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

/** The organisation brands its local activities as the 'Med oss' family. */
const ACTIVITY_HEADING = /<h2[^>]*>\s*Med oss-aktiviteter\s*<\/h2>([\s\S]*?)(?:<h2|<\/section>|$)/;

const rejected: string[] = [];

function parseBranch(b: Branch): Chapter {
  const html = b.content.rendered;
  const name = stripHtml(b.title.rendered);

  // The county is the second path segment: /lokallag/<county>/<chapter>/
  const county = /\/lokallag\/([a-z0-9-]+)\//.exec(b.link)?.[1];

  // Member count is published here and held by no registry - the only membership figure
  // in the whole dataset.
  //
  // The value is NOT adjacent to its class: an icon <span><svg> sits between them, so a
  // regex anchored on the class and expecting digits next matches nothing. Capture the
  // whole element, strip markup, then read the number.
  const membersBlock = /class="[^"]*branch-members-count__value[^"]*"[^>]*>([\s\S]*?)<\/p>/
    .exec(html)?.[1];
  const membersDigits = membersBlock ? stripHtml(membersBlock).replace(/[^\d]/g, '') : '';
  const memberCount = membersDigits ? Number(membersDigits) : undefined;

  const leaderName = (() => {
    const m = /class="[^"]*leader-name[^"]*"[^>]*>([\s\S]*?)<\//.exec(html);
    return m ? stripHtml(m[1]) : undefined;
  })();
  const phoneRaw = /href="tel:([^"]+)"/.exec(html)?.[1];
  const phone = phoneRaw
    ? `+47 ${phoneRaw.replace(/\D/g, '')}`.replace('+47 47', '+47 ')
    : undefined;
  const email = /href="mailto:([^"]+)"/.exec(html)?.[1];

  let contacts: Contact[] | undefined;
  if (leaderName || phone || email) {
    const parts = (leaderName ?? '').split(/\s+/).filter(Boolean);
    contacts = [{
      role: 'Leder',
      givenName: parts[0],
      familyName: parts.slice(1).join(' ') || undefined,
      phone, email, isMasked: false, sourceUrl: b.link,
    }];
  }

  const activities: Activity[] = [];
  const section = ACTIVITY_HEADING.exec(html);
  if (section) {
    for (const li of section[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
      const raw = stripHtml(li[1]);
      // A list entry carrying a calendar year is a report label, not an activity: 32
      // chapters have 'MEDLEMMER RCS Sept 2026' pasted into this list by an editor.
      // A general rule rather than a blacklist - activity names do not carry years -
      // and rejects are logged so a future change surfaces instead of silently passing.
      if (raw && /\b(19|20)\d{2}\b/.test(raw)) {
        rejected.push(raw);
        continue;
      }
      if (raw) {
        activities.push({
          name: raw,
          definition: { id: `${ORG.id}:${slugify(raw)}` },
          sourceUrl: b.link,
        });
      }
    }
  }

  const facebookUrl = normaliseUrl(
    /href="(https:\/\/(?:www\.)?facebook\.com\/[^"]+)"/.exec(html)?.[1]).url;

  // The organisation runs two kinds of local unit under one brand.
  const chapterType = /demensforening/i.test(name) ? 'Demensforening'
    : /helselag/i.test(name) ? 'Helselag' : 'Lokallag';

  return {
    id: `${ORG.id}:${b.slug}`,
    name,
    organization: ORG,
    chapterType,
    level: 'LOCAL',
    memberCount,
    county: county ? county.replace(/-/g, ' ') : undefined,
    website: normaliseUrl(b.link).url,
    facebookUrl,
    contacts,
    activities: activities.length ? activities : undefined,
    provenance: {
      sourceUrl: b.link,
      confidence: 'MEDIUM',
      reconciliation: 'UNRECONCILED',
      idOrigin: 'SOURCE',
      parentOrigin: 'UNSTATED',
      municipalityMethod: 'NONE',
      matchMethod: 'sourceAuthoritative',
      containsPersonalData: Boolean(contacts?.length),
    },
    freshness: {
      fetchedAt: nowIso(),
      blocks: {
        identity: { volatility: 'STRUCTURAL', source: BASE },
        contacts: { volatility: 'ANNUAL', source: BASE },
        activities: { volatility: 'VOLATILE', source: BASE },
      },
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 0;
  const partial = limit > 0;

  const all: Branch[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${ENDPOINT}?per_page=${PAGE}&page=${page}`
      + '&_fields=id,slug,link,title,content';
    let batch: Branch[];
    try {
      batch = await getJson<Branch[]>(url, { timeoutMs: 60_000 });
    } catch {
      break;                       // the API 400s past the last page
    }
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    Logger.info(`    page ${page}: ${all.length} branches`);
    if (partial && all.length >= limit) break;
  }

  const branches = partial ? all.slice(0, limit) : all;
  const items = branches.map(parseBranch);

  const collection: Collection<Chapter> = {
    items,
    extract: {
      sourceId: 'nasjonalforeningen-local-branches',
      method: 'REST_API',
      baseUrl: BASE,
      indexUrl: ENDPOINT,
      fetchedAt: nowIso(),
      extractorVersion: EXTRACTOR_VERSION,
      pagesAttempted: branches.length,
      pagesParsed: items.length,
      isRobotsAllowed: true,
      license: 'none-stated',
    },
  };

  const out = path.join(DATA_DIR, ORG.id,
    partial ? 'chapters.partial.json' : 'chapters.crawl.json');
  writeCollection(out, collection);

  const has = (f: keyof Chapter) => items.filter((c) => c[f] !== undefined).length;
  const members = items.map((c) => c.memberCount).filter((n): n is number => Boolean(n));
  Logger.info(`\n  ${items.length} chapters -> ${path.relative(DATA_DIR, out)}`
    + (partial ? '  (PARTIAL)' : ''));
  Logger.info(`    with contacts   ${has('contacts')}`);
  Logger.info(`    with activities ${has('activities')}`);
  Logger.info(`    with facebook   ${has('facebookUrl')}`);
  Logger.info(`    with memberCount ${members.length}`
    + (members.length ? `  (total ${members.reduce((a, b) => a + b, 0).toLocaleString()} members)` : ''));
  const types = items.reduce<Record<string, number>>((m, c) => {
    m[c.chapterType!] = (m[c.chapterType!] ?? 0) + 1; return m;
  }, {});
  Logger.info(`    chapterType     ${JSON.stringify(types)}`);
  if (rejected.length) {
    const uniqueRejects = [...new Set(rejected)];
    Logger.warn(`rejected ${rejected.length} list entries as report labels, not activities: `
      + uniqueRejects.join(', '));
  }
  const acts = items.flatMap((c) => c.activities ?? []).map((a) => a.name);
  const uniq = [...new Set(acts)];
  Logger.info(`    activities      ${acts.length} provisions, ${uniq.length} distinct`);
  if (uniq.length) Logger.info(`                    ${uniq.slice(0, 8).join(', ')}`);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
