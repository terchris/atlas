/**
 * file: ingest/src/sources/nks-activities.ts
 * description: Harvest the national activity catalogue WITH description text.
 * output: data/sanitetskvinnene/activities.json
 *
 * Separate from the chapter crawl because descriptions belong to the CANONICAL activity,
 * not the chapter: 14 definitions (12 national, 2 local) cover 575 chapters, and a 91-word
 * description is the same 91 words on every chapter running it. Harvesting once gives a
 * corpus a person can read instead of 649 duplicates, one per provision.
 *
 *   npm run nks:activities
 *   npm run nks:activities -- --print
 */

import * as path from 'path';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { detectLanguage, slugify, stripHtml } from '../lib/text';
import { DATA_DIR, nowIso, readCollection, writeCollection } from '../lib/io';
import type { ActivityDefinition, Collection } from '../lib/types';

const BASE = 'https://sanitetskvinnene.no';
const ORG = { id: 'sanitetskvinnene', name: 'Norske Kvinners Sanitetsforening' };
const EXTRACTOR_VERSION = '0.4.0';

/** The site's own information architecture: themes vs named programmes. That grouping is
 *  the organisation's and is preserved rather than flattened away. */
const THEMES = ['eldre', 'integrering', 'kvinnehelse', 'naeringsliv',
                'omsorgsberedskap', 'ressursvenn'];
const PROGRAMMES = ['asylmottak', 'kanskje-kommer-kongen', 'klovertur', 'motherhood',
                    'sprakvenn'];
const PARENT: Record<string, string> = {
  klovertur: 'eldre', 'kanskje-kommer-kongen': 'eldre',
  sprakvenn: 'integrering', motherhood: 'integrering', asylmottak: 'integrering',
};

/** Keyword lists, deliberately not a model: transparent, reproducible, reviewable, and
 *  they keep the organisation's own vocabulary rather than imposing ours. */
const TARGETS = ['eldre', 'innvandrerkvinner', 'innvandrede kvinner', 'innvandrere',
  'flyktninger', 'voldsutsatte', 'kvinner', 'barn', 'ungdom', 'unge', 'asylsøkere',
  'pårørende', 'enslige'];
const MODES = ['lavterskel', 'utendørs', 'en-til-en', 'gruppe', 'digitalt', 'kurs',
  'veiledning', 'nettverk', 'møteplass', 'turgruppe'];

/** A hardcoded path list is lossy: one activity looked local-only until its national page
 *  was requested directly and returned 200. Sweep the sitemap for strays. */
async function discoverExtra(): Promise<string[]> {
  try {
    const xml = await getText(`${BASE}/sitemap.xml`, { timeoutMs: 60_000 });
    const top = [...xml.matchAll(new RegExp(`<loc>${BASE}/([a-z0-9-]+)</loc>`, 'g'))]
      .map((m) => m[1]);
    return [...new Set(top)].filter((s) => s === 'sisterhood');
  } catch {
    return [];
  }
}

function parse(html: string, url: string, slug: string, parent?: string): ActivityDefinition {
  const title = stripHtml(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? slug)
    .split(' | ')[0].split(' - Sanitetskvinnene')[0];

  const body = html.replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/g, '');
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => stripHtml(m[1]))
    .filter((p) => p.length > 60 && !p.includes('Grasrotandelen')
      && !p.includes('.pdf') && !/^lengre ned/i.test(p));
  const description = paragraphs.slice(0, 3).join(' ').slice(0, 1200) || undefined;

  const low = (description ?? '').toLowerCase();
  return {
    id: `${ORG.id}:${slug}`,
    organization: ORG,
    name: title,
    description,
    descriptionSourceUrl: url,
    descriptionLanguage: detectLanguage(description ?? ''),
    descriptionWordCount: description ? description.split(/\s+/).length : 0,
    descriptionRetrievedAt: nowIso(),
    targetGroups: TARGETS.filter((t) => low.includes(t)),
    deliveryModes: MODES.filter((m) => low.includes(m)),
    origin: 'NATIONAL',
    originEvidence: `harvested from ${url}`,
    group: parent ? { id: `${ORG.id}:${parent}` } : undefined,
    serviceCategory: { assignmentMethod: 'UNMAPPED', confidence: 'LOW' },
    provenance: { sourceUrl: url, confidence: 'HIGH', matchMethod: 'sourceAuthoritative',
                  containsPersonalData: false },
    freshness: { fetchedAt: nowIso() },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const delay = Number(args[args.indexOf('--delay') + 1]) || 800;
  const out = path.join(DATA_DIR, ORG.id, 'activities.json');

  const targets = [
    ...THEMES.map((s) => ({ slug: s, path: `foreningsnett/aktiviteter/${s}`, parent: undefined as string | undefined })),
    ...PROGRAMMES.map((s) => ({ slug: s, path: `foreningsnett/aktiviteter-frivillige/${s}`, parent: PARENT[s] })),
    ...(await discoverExtra()).map((s) => ({ slug: s, path: s, parent: undefined })),
  ];

  const { results, failures } = await paced(targets, delay, async (t) => {
    const url = `${BASE}/${t.path}`;
    return parse(await getText(url), url, t.slug, t.parent);
  });

  // Local-origin stubs written by the chapter crawler must survive a re-harvest.
  const existing = readCollection<ActivityDefinition>(out)?.items ?? [];
  const locals = existing.filter((e) => e.origin === 'LOCAL');
  const items = [...results, ...locals].sort((a, b) => a.id.localeCompare(b.id));

  const collection: Collection<ActivityDefinition> = {
    items,
    extract: {
      sourceId: 'nks-aktiviteter', method: 'HTML_CRAWL', baseUrl: BASE,
      indexUrl: `${BASE}/foreningsnett/aktiviteter`, fetchedAt: nowIso(),
      extractorVersion: EXTRACTOR_VERSION, pagesAttempted: targets.length,
      pagesParsed: results.length, isRobotsAllowed: true, license: 'none-stated',
    },
  };
  writeCollection(out, collection);

  const words = results.map((r) => r.descriptionWordCount ?? 0).sort((a, b) => a - b);
  Logger.info(`\n  ${results.length}/${targets.length} national definitions`);
  Logger.info(`  kept ${locals.length} local-origin entries from the chapter crawl`);
  if (words.length) {
    Logger.info(`  description words: min ${words[0]} / median `
      + `${words[Math.floor(words.length / 2)]} / max ${words.at(-1)}`);
  }
  const thin = results.filter((r) => (r.descriptionWordCount ?? 0) < 25);
  if (thin.length) Logger.warn(`THIN (<25 words, too little signal): ${thin.map((t) => t.name).join(', ')}`);
  failures.forEach((f) => Logger.error(`${f.item.path}: ${f.error}`));

  if (args.includes('--print')) {
    for (const e of results) {
      Logger.info(`\n--- ${e.name} [${e.id}] ${e.descriptionWordCount}w ${e.descriptionLanguage}`);
      Logger.info(`    targets=${JSON.stringify(e.targetGroups)} modes=${JSON.stringify(e.deliveryModes)}`);
      Logger.info(`    ${(e.description ?? '').slice(0, 260)}`);
    }
  }
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
