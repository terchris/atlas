/**
 * file: ingest/src/sources/activity-descriptions.ts
 * description: R10 - every activity's FULL description, verbatim, from its own page.
 * output: rewrites description fields in data/<org>/activities.json
 *
 * The extractors store what the listing pages show: Frelsesarmeen's one-line card teaser,
 * the first sub-offer summary on a Kirkens Bymisjon page (which is often a CHILD page's text,
 * not the activity's - A-senteret's "description" was its residential unit's), and nothing
 * for Nasjonalforeningen. This step reads each activity's own page and stores:
 *
 *   description  the page's body text, verbatim (lib/description.ts)
 *   summary      the organisation's own one-line lead, where the page has one
 *
 * and sets provenance.containsPersonalData when the text carries a phone number or e-mail.
 * Run it after the activity extractors; `--org <id>` limits it to one organisation.
 *
 *   npm run descriptions
 *   NGO_FROM_CACHE=1 npm run descriptions     # re-parse the cached pages, fetch nothing
 */

import * as path from 'path';
import * as cheerio from 'cheerio';
import { getText, sleep } from '../lib/http';
import Logger from '../lib/logger';
import { detectLanguage } from '../lib/text';
import { DATA_DIR, nowIso, omitEmpty, readCollection, writeCollection } from '../lib/io';
import { blocks, carriesContact, joinBlocks, ogSummary, section, wordCount } from '../lib/description';
import type { ActivityDefinition, Collection } from '../lib/types';

interface Found { url: string; description?: string; summary?: string; }
type Finder = (a: ActivityDefinition) => Promise<Found | string>;   // a string is the reason for a gap

/**
 * One fetch per URL per run (a Frelsesarmeen unit page lists several activities), and at least
 * 1.5 s between fetches whatever robots.txt says: frelsesarmeen.no answers 429 at ~2.5 requests/s.
 */
const pages = new Map<string, Promise<cheerio.CheerioAPI>>();
const load = (url: string): Promise<cheerio.CheerioAPI> => {
  if (!pages.has(url)) {
    pages.set(url, (async () => {
      if (process.env.NGO_FROM_CACHE !== '1') await sleep(1500);
      return cheerio.load(await getText(url, { timeoutMs: 60_000, attempts: 3 }));
    })());
  }
  return pages.get(url)!;
};

/** Kirkens Bymisjon: the post body, minus the listing of its sub-pages (each its own service). */
const kirkensBymisjon: Finder = async (a) => {
  const url = a.provenance?.sourceUrl;
  if (!url) return 'no page URL on the record';
  const $ = await load(url);
  const body = $('.wp-block-post-content').first();
  const text = body.length ? joinBlocks(blocks($, body, ['.wp-block-kbm-link-list'])) : '';
  return { url, description: text || undefined, summary: ogSummary($) };
};

/**
 * Frelsesarmeen: the activity's own page is linked from its card on the unit page. The id is
 * the last path segment of that link, so the card is found by id, not by name.
 */
const frelsesarmeen: Finder = async (a) => {
  const unit = a.provenance?.sourceUrl ?? a.descriptionSourceUrl;
  if (!unit) return 'no unit page on the record';
  const slug = a.id.split(':')[1];
  const $u = await load(unit);
  const href = $u('a[href]').map((_, el) => $u(el).attr('href')).get()
    .find((h) => h.replace(/\/$/, '').split('/').pop() === slug);
  if (!href) return `no link to …/${slug} on ${unit}`;
  const url = new URL(href, unit).toString();
  const $ = await load(url);
  const summary = $('main h1').first().nextAll('p').first().text().trim() || undefined;
  const text = joinBlocks(blocks($, $('main .richText').first()));
  return { url, description: text || undefined, summary };
};

/** Nasjonalforeningen: all six "Med oss" activities are sections of one page, by heading. */
const NF_PAGE = 'https://nasjonalforeningen.no/folkehelse/lokale-aktiviteter/';
const nasjonalforeningen: Finder = async (a) => {
  const $ = await load(NF_PAGE);
  const sec = section(blocks($, $('main').first()), a.name);
  if (!sec) return `no heading "${a.name}" on ${NF_PAGE}`;
  return { url: NF_PAGE, description: joinBlocks(sec) || undefined };
};

/**
 * Sanitetskvinnene: the national catalogue (nks-activities.ts) already holds full text for the
 * activities that have a national page, and it is kept. Three have no public description of
 * their own: Dig In and Lesevenn have no national page (their text exists only on chapter
 * pages), and Sisterhood's pages (/sisterhood and the catalogue entry) are training material for
 * the chapters - the only text addressed to the girls themselves is a news article.
 */
const sanitetskvinnene: Finder = async (a) => (a.description
  ? 'kept: national catalogue text (nks-activities.ts)'
  : 'no national page on sanitetskvinnene.no');

const FINDERS: Record<string, Finder> = {
  'kirkens-bymisjon': kirkensBymisjon, frelsesarmeen, nasjonalforeningen, sanitetskvinnene,
};

/**
 * Site furniture: a block that appears verbatim on FURNITURE_MIN or more of one organisation's
 * activity pages is the site's, not the activity's - "Bli frivillig!" and its recruitment
 * paragraph (Kirkens Bymisjon, 17 pages), a section's mission statement, webshop promotions,
 * the privacy-statement link. The same rule as the national-boilerplate trap in the README:
 * count a value's occurrences across the crawl before trusting it.
 */
const FURNITURE_MIN = 4;
function siteFurniture(texts: (string | undefined)[]): Set<string> {
  const seen = new Map<string, number>();
  for (const t of texts) for (const b of new Set((t ?? '').split('\n\n'))) seen.set(b, (seen.get(b) ?? 0) + 1);
  return new Set([...seen].filter(([b, n]) => b && n >= FURNITURE_MIN).map(([b]) => b));
}

async function run(org: string): Promise<void> {
  const file = path.join(DATA_DIR, org, 'activities.json');
  const col = readCollection<ActivityDefinition>(file) as Collection<ActivityDefinition>;
  const stats = { full: 0, summaryOnly: 0, kept: 0, gap: 0, personal: 0, before: 0, after: 0 };
  const gaps: string[] = [];
  const results = new Map<string, Found | string>();
  for (const a of col.items) {
    stats.before += a.descriptionWordCount ?? 0;
    try {
      results.set(a.id, await FINDERS[org](a));
    } catch (e) {
      results.set(a.id, `fetch failed: ${(e as Error).message}`);
    }
  }
  const boilerplate = siteFurniture([...results.values()]
    .map((f) => (typeof f === 'string' ? undefined : f.description)));
  for (const a of col.items) {
    const found = results.get(a.id)!;
    if (typeof found === 'string') {
      if (found.startsWith('kept')) stats.kept += 1; else { stats.gap += 1; gaps.push(`${a.id}: ${found}`); }
      stats.after += a.descriptionWordCount ?? 0;
      continue;
    }
    const text = found.description?.split('\n\n').filter((b) => !boilerplate.has(b)).join('\n\n') || undefined;
    Object.assign(a, {
      description: text,
      summary: found.summary && found.summary !== text ? found.summary : undefined,
      descriptionSourceUrl: text || found.summary ? found.url : undefined,
      descriptionLanguage: text ? detectLanguage(text) : undefined,
      descriptionWordCount: text ? wordCount(text) : undefined,
      descriptionRetrievedAt: text || found.summary ? nowIso() : undefined,
    });
    if (text) stats.full += 1; else if (found.summary) stats.summaryOnly += 1;
    else { stats.gap += 1; gaps.push(`${a.id}: page has no body text (${found.url})`); }
    if (a.provenance && carriesContact(`${text ?? ''} ${found.summary ?? ''}`)) {
      a.provenance.containsPersonalData = true;
      stats.personal += 1;
    }
    stats.after += a.descriptionWordCount ?? 0;
  }
  if (boilerplate.size) Logger.info(`    removed ${boilerplate.size} site-furniture blocks (on ${FURNITURE_MIN}+ activities)`);
  writeCollection(file, omitEmpty(col));
  Logger.info(`${org.padEnd(20)} ${col.items.length} activities: ${stats.full} full text, `
    + `${stats.summaryOnly} summary only, ${stats.kept} kept, ${stats.gap} gaps; `
    + `${stats.personal} carry a phone/e-mail; words ${stats.before} -> ${stats.after}`);
  for (const g of gaps) Logger.info(`    gap  ${g}`);
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--org');
  const orgs = i > 0 ? [process.argv[i + 1]] : Object.keys(FINDERS);
  for (const org of orgs) await run(org);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
