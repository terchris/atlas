/**
 * file: ingest/src/sources/speiderforbundet-groups.ts
 * description: Speiderforbundet's groups and kretser from blispeider.no, with the age branches each
 *              group runs, its own text, its address and coordinates, and its krets.
 * output: data/speiderforbundet/chapters.crawl.json  (then: npm run reconcile -- speiderforbundet)
 *         data/speiderforbundet/parents.page.json    (group page -> krets page, for the hierarchy step)
 *
 * speiding.no is a single-page app with no sitemap; the group finder is on blispeider.no ("Bli
 * speider"), a server-rendered site (measured 2026-10-04):
 *
 *   /grupper                     every group as JSON in <script id="grupper-map-data">:
 *                                id, title, url, lat, lng, locality, korpsTitle - 332 groups
 *   /grupper/<slug>              h1 name; the next <p> is the address ("street / 4755 PLACE");
 *                                "Våre enheter": one h3 per age branch (Bever, Småspeider, Stifinner,
 *                                Vandrer, Rover) with its school years; "Om oss": the group's text;
 *                                "Vi er en del av": a link to /kretser/<slug> - the group's krets
 *   "Kontaktperson"              a named person: NOT read (personal data; private path if ever)
 *
 * The age branches are the group's activities, as the group itself publishes them.
 *
 *   npm run speiderforbundet
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import { blocks, section } from '../lib/description';
import { slugify } from '../lib/text';
import type { Activity, Chapter, Collection } from '../lib/types';

const BASE = 'https://blispeider.no';
const ORG = { id: 'speiderforbundet', name: 'NORGES SPEIDERFORBUND' };
const AGE_BRANCHES = ['Bever', 'Småspeider', 'Stifinner', 'Vandrer', 'Rover', 'Speider', 'Leder'];
/**
 * Groups name their units their own way ("Beverkolonien", "Roverlaget Snorkel", "Småspeiderflokk");
 * the unit is one of the national age branches. A leaders' unit is not a service for participants.
 */
const BRANCH: [RegExp, string | null][] = [
  [/^leder/i, null],
  [/^bever/i, 'Bever'], [/^småspeider/i, 'Småspeider'], [/^stifinner/i, 'Stifinner'],
  [/^vandrer/i, 'Vandrer'], [/^rover/i, 'Rover'], [/^speider/i, 'Speidertropp'],
];

interface MapGroup { id: number; title: string; url: string; lat?: number; lng?: number; locality?: string; korpsTitle?: string | null; }

export function parseGroup(html: string, url: string) {
  const $ = cheerio.load(html);
  const main = $('main').length ? $('main').first() : $('body');
  const name = main.find('h1').first().text().replace(/\s+/g, ' ').trim() || undefined;
  // The address sits in its own block by a map pin: the first paragraph with a postcode and a line break.
  const addrP = main.find('p').filter((_, el) => $(el).find('br').length > 0 && /\b\d{4}\s+[A-ZÆØÅ]/.test($(el).text())).first().clone();
  addrP.find('br').replaceWith(' / ');
  const addrText = addrP.text().replace(/\s+/g, ' ').trim();
  const m = addrText.match(/^(.*?)\s*\/\s*(\d{4})\s+(.+)$/) ?? addrText.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
  const address = m ? { line1: m[1].trim() || undefined, postalCode: m[2], postalPlace: m[3].trim() } : undefined;
  const bs = blocks($, main);
  const units = (section(bs, 'Våre enheter') ?? []).filter((b) => b.tag === 'h3' && AGE_BRANCHES.some((a) => b.text.startsWith(a)));
  const ages = new Map((section(bs, 'Våre enheter') ?? []).map((b, i, arr) => [b.text, arr[i + 1]?.tag === 'p' ? arr[i + 1].text : undefined]));
  const kretsA = main.find('a[href*="/kretser/"]').first();
  const krets = kretsA.length ? { url: new URL(kretsA.attr('href')!, url).toString().replace(/\/?$/, ''), name: kretsA.text().replace(/\s+/g, ' ').trim() } : undefined;
  const activities: Activity[] = [];
  for (const u of units) {
    const branch = BRANCH.find(([re]) => re.test(u.text));
    if (!branch || !branch[1]) continue;
    activities.push({ name: u.text, definition: { id: `${ORG.id}:${slugify(branch[1])}`, name: branch[1] },
      description: ages.get(u.text), sourceUrl: url });
  }
  return { name, address, krets, activities };
}

async function main(): Promise<void> {
  const index = await getText(`${BASE}/grupper`, { timeoutMs: 60_000 });
  const json = index.match(/<script type="application\/json" id="grupper-map-data">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('blispeider.no/grupper: no grupper-map-data - the page changed');
  const groups: MapGroup[] = JSON.parse(json);
  Logger.info(`blispeider.no: ${groups.length} groups`);

  const items: Chapter[] = [];
  const kretser = new Map<string, string>();
  const parents: Record<string, string> = {};
  let failed = 0;
  await paced(groups, process.env.NGO_FROM_CACHE === '1' ? 0 : 1000, async (g: MapGroup) => {
    let html: string;
    try { html = await getText(g.url, { timeoutMs: 60_000, attempts: 3 }); } catch (e) { failed += 1; Logger.warn(`  skip ${g.url}: ${e}`); return; }
    // Stored URLs are percent-encoded (format: uri): group slugs carry Norwegian letters (/grupper/åsane-…).
    const enc = new URL(g.url).toString();
    const p = parseGroup(html, enc);
    const website = enc.replace(/\/?$/, '');
    if (p.krets) { kretser.set(p.krets.url, p.krets.name); parents[website] = p.krets.url; }
    items.push({
      id: `${ORG.id}:${slugify(g.url.split('/').pop()!)}`,
      name: p.name ?? g.title,
      organization: ORG,
      chapterType: g.korpsTitle ? 'Speiderkorps' : 'Speidergruppe',
      level: 'LOCAL',
      address: p.address,
      addressKind: p.address ? 'MEETING_VENUE' : undefined,
      coordinates: g.lat && g.lng ? { latitude: g.lat, longitude: g.lng } : undefined,
      website,
      activities: p.activities.length ? p.activities : undefined,
      provenance: {
        sourceUrl: enc, confidence: 'MEDIUM', reconciliation: 'UNRECONCILED', idOrigin: 'DERIVED',
        parentOrigin: 'SOURCE', municipalityMethod: 'NONE', matchMethod: 'sourceAuthoritative', containsPersonalData: false,
      },
      freshness: { fetchedAt: nowIso(), blocks: { identity: { volatility: 'STRUCTURAL', source: BASE }, activities: { volatility: 'ANNUAL', source: BASE } } },
    });
  });
  // The kretser, as the groups name them: the regional tier the register partly holds.
  for (const [url, name] of kretser) {
    items.push({
      id: `${ORG.id}:krets-${slugify(url.split('/').pop()!)}`, name, organization: ORG, chapterType: 'Krets', level: 'REGIONAL',
      website: url,
      provenance: { sourceUrl: url, confidence: 'MEDIUM', reconciliation: 'UNRECONCILED', idOrigin: 'DERIVED',
        parentOrigin: 'UNSTATED', municipalityMethod: 'NONE', matchMethod: 'sourceAuthoritative', containsPersonalData: false },
      freshness: { fetchedAt: nowIso() },
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const collection: Collection<Chapter> = { items, extract: {
    sourceId: 'speiderforbundet-groups', method: 'HTML_CRAWL', baseUrl: BASE, indexUrl: `${BASE}/grupper`,
    fetchedAt: nowIso(), extractorVersion: '0.1.0', pagesAttempted: groups.length + 1, pagesParsed: items.length,
    isRobotsAllowed: true, license: 'none-stated' } };
  writeCollection(path.join(DATA_DIR, ORG.id, 'chapters.crawl.json'), collection);
  fs.writeFileSync(path.join(DATA_DIR, ORG.id, 'parents.page.json'), JSON.stringify(parents, null, 2) + '\n');
  const g = items.filter((c) => c.level === 'LOCAL');
  Logger.info(`  ${g.length} groups, ${kretser.size} kretser, ${failed} failed · address ${g.filter((c) => c.address).length} · `
    + `coordinates ${g.filter((c) => c.coordinates).length} · with krets ${Object.keys(parents).length} · `
    + `age branches ${g.reduce((n, c) => n + (c.activities?.length ?? 0), 0)} on ${g.filter((c) => c.activities).length} groups`);
}

if (require.main === module) main().catch((e) => { Logger.error(String(e)); process.exit(1); });
