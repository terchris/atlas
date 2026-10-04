/**
 * file: ingest/src/sources/kirkens-bymisjon-tilbud.ts
 * description: Pull Kirkens Bymisjon's services and local presence from its WordPress API.
 * output: data/kirkens-bymisjon/activities.json, chapters.crawl.json
 *
 * THIS ORGANISATION PUBLISHES THE ACTIVITY LAYER, NOT THE CHAPTER LAYER. Frelsesarmeen's
 * site lists units and mentions their services in passing; this one lists 144 named
 * services (`tilbud`) and says where each runs. That is the layer this project has been
 * missing — `activity_catalog` has never had a row in it.
 *
 * The REST API exposes the post type plus TWO taxonomies, and both are load-bearing:
 *
 *   tilbud-location  59 places     where a service runs
 *   tilbud-type       9 categories what kind of service it is
 *
 * THE UNIT OF LOCAL PRESENCE IS (tilbud x location), NOT tilbud. 'I jobb' runs in 29
 * towns, 'Skattkammeret' in 25, 'Gatejuristen' in 6 — and the registry confirms these are
 * separate things, holding 'I Jobb Fredrikstad', 'I Jobb Gjøvik', 'I Jobb Moss' and
 * 'I Jobb Oslo' as four distinct sub-units. So 144 services expand to 349 local units,
 * named the way the registry names them, which is what makes the two reconcile:
 *
 *   tilbud 'Arbeid Ute' + location 'Kristiansand'  ~  'ARBEID UTE KRISTIANSAND'
 *
 * ⚠️ `tilbud-type` is the first SOURCE-PUBLISHED service taxonomy in this project. Every
 * activity so far has carried `serviceCategory.assignmentMethod = UNMAPPED` because no
 * organisation published one. These 144 get `SOURCE_TAXONOMY`, and the nine categories are
 * evidence for the still-open question of what the shared category set should be.
 *
 *   npm run kirkens-bymisjon -- --limit 20   # smoke test
 *   npm run kirkens-bymisjon                 # full pull
 */

import * as path from 'path';
import { getJson, getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { decodeEntities, detectLanguage, slugify, stripHtml } from '../lib/text';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import type {
  Activity, ActivityDefinition, Chapter, Collection,
} from '../lib/types';

const BASE = 'https://kirkensbymisjon.no';
const API = `${BASE}/wp-json/wp/v2`;
const ORG = { id: 'kirkens-bymisjon', name: 'Stiftelsen Kirkens Bymisjon' };
const NATIONAL_ORGNR = '944384448';
const EXTRACTOR_VERSION = '0.1.0';

interface Term { id: number; name: string; slug: string; count: number; }
interface Tilbud {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  modified: string;
  'tilbud-location'?: number[];
  'tilbud-type'?: number[];
}

const stats = { described: 0, viaOg: 0, noDescription: 0 };

async function terms(tax: string): Promise<Map<number, Term>> {
  const list = await getJson<Term[]>(`${API}/${tax}?per_page=100`, { timeoutMs: 60_000 });
  return new Map(list.map((t) => [t.id, t]));
}

/**
 * The organisation writes its own summary into `kbm-link-list-item__description` blocks —
 * 'Vi tilbyr arbeidstrening og aktivitet knyttet til praktisk arbeid…'. The REST record
 * cannot supply this: `content.rendered` and `excerpt.rendered` are both empty because the
 * pages are built from Gutenberg blocks the API does not render.
 *
 * `og:description` is the fallback, but only that — WordPress truncates it with an ellipsis
 * mid-sentence, so it is used when the block is absent and trimmed back to whole sentences.
 */
/** Weekday names plus clock times, and little else: a timetable, not a description. */
function isOpeningHours(text: string): boolean {
  const days = /\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|ukedager|hverdager)\b/i;
  const clock = /\b\d{1,2}[.:]\d{2}\b/;
  return days.test(text) && clock.test(text);
}

function parseDescription(html: string): string | undefined {
  const blocks = [...html.matchAll(
    /<p class="kbm-link-list-item__description">([\s\S]*?)<\/p>/g)]
    .map((m) => decodeEntities(stripHtml(m[1])).trim())
    // Measure AFTER decoding. 'Mandag til fredag, kl. 08.00&ndash;15.00.' is 41 raw
    // characters and 35 real ones, so a raw-length test let opening hours through as the
    // description of a service. Require real prose: a sentence's worth of words, and not
    // a line that is mostly a timetable.
    .filter((b) => b.length > 45
      && b.split(/\s+/).length >= 8
      && !isOpeningHours(b));
  if (blocks.length) { stats.described += 1; return blocks[0]; }

  const og = /property="og:description" content="([^"]*)"/.exec(html)?.[1];
  if (og) {
    const text = decodeEntities(og).replace(/\s*(…|\.\.\.)\s*$/, '').trim();
    if (text.length > 40) { stats.viaOg += 1; return text; }
  }
  stats.noDescription += 1;
  return undefined;
}

function toDefinition(
  t: Tilbud, name: string, types: Term[], locations: Term[],
  description: string | undefined,
): ActivityDefinition {
  const primary = types[0];
  return {
    id: `${ORG.id}:${t.slug}`,
    organization: ORG,
    name,
    group: primary ? { id: `${ORG.id}:type:${primary.slug}`, name: primary.name } : undefined,
    description,
    descriptionSourceUrl: description ? t.link : undefined,
    descriptionLanguage: description ? detectLanguage(description) : undefined,
    descriptionWordCount: description ? description.split(/\s+/).length : undefined,
    // Full timestamp, not a date: the schema declares format: date-time. Truncating to
    // 10 characters here produced 144 rows that failed validation.
    descriptionRetrievedAt: description ? nowIso() : undefined,
    isService: true,
    // A service offered in more than one town is run as a national programme; one town
    // means it is local to that town. Stated rather than assumed, with the count as
    // evidence, because this is an inference and not something the source declares.
    origin: locations.length > 1 ? 'NATIONAL' : 'LOCAL',
    originEvidence: `published in ${locations.length} location(s): `
      + locations.map((l) => l.name).join(', '),
    chapterCount: locations.length,
    serviceCategory: {
      code: primary?.slug,
      // The organisation's OWN taxonomy, not a mapping anyone here invented.
      assignmentMethod: primary ? 'SOURCE_TAXONOMY' : 'UNMAPPED',
      confidence: primary ? 'HIGH' : 'LOW',
    },
    provenance: {
      sourceUrl: t.link,
      confidence: 'HIGH',
      reconciliation: 'SOURCE_ONLY',
      idOrigin: 'SOURCE',
      parentOrigin: 'SOURCE',
      matchMethod: 'sourceAuthoritative',
      containsPersonalData: false,
    },
    freshness: {
      fetchedAt: nowIso(),
      // A REAL upstream timestamp. Every other source in this project leaves this empty and
      // falls back to fetchedAt, which says only when WE looked.
      sourceUpdatedAt: `${t.modified.slice(0, 19)}Z`,
      blocks: {
        identity: { volatility: 'STRUCTURAL', source: BASE, assertedAt: t.modified.slice(0, 10) },
        classification: { volatility: 'SLOW', source: BASE, assertedAt: t.modified.slice(0, 10) },
      },
    },
  };
}

/**
 * `<service>, <place>` — unless the service name already names that place.
 *
 * Compared as whole slug TOKENS, not as substrings. An `endsWith` test catches
 * 'Bybo, Oslo' but not 'Moss Frivilligsentral', where the place leads; a plain `includes`
 * would catch both and also fire on any name that merely contains the letters, merging
 * unrelated units whenever a short place name like 'Sem' or 'Voss' appears inside a word.
 */
function localName(name: string, loc: Term): string {
  const tokens = slugify(name).split('-').filter(Boolean);
  const place = slugify(loc.name).split('-').filter(Boolean);
  const present = place.length > 0 && place.every((t) => tokens.includes(t));
  return present ? name : `${name}, ${loc.name}`;
}

function toChapter(t: Tilbud, name: string, loc: Term, types: Term[]): Chapter {
  const asserted = t.modified.slice(0, 10);
  const activity: Activity = {
    name,
    definition: { id: `${ORG.id}:${t.slug}` },
    sourceUrl: t.link,
  };
  return {
    // Derived, not published: the source has no identifier for the pair.
    id: `${ORG.id}:${t.slug}-${loc.slug}`,
    // Named the way the registry names it — 'Arbeid Ute Kristiansand' — so the two join.
    // Many titles ALREADY carry the place ('Bybo, Oslo'), and appending it again produced
    // 'Bybo, Oslo, Oslo', which matches nothing on either side.
    name: localName(name, loc),
    organization: ORG,
    parent: { id: `${ORG.id}:${NATIONAL_ORGNR}`, name: ORG.name, level: 'NATIONAL' },
    chapterType: types[0]?.name ?? 'Tilbud',
    level: 'LOCAL',
    municipality: loc.name,
    website: t.link,
    activities: [activity],
    provenance: {
      sourceUrl: t.link,
      confidence: 'MEDIUM',
      reconciliation: 'UNRECONCILED',
      idOrigin: 'DERIVED',
      parentOrigin: 'SOURCE',
      // The place comes from the source's own taxonomy, not from a lookup or a guess.
      municipalityMethod: 'SOURCE',
      matchMethod: 'tilbudXlocation',
      containsPersonalData: false,
    },
    freshness: {
      fetchedAt: nowIso(),
      sourceUpdatedAt: `${t.modified.slice(0, 19)}Z`,
      blocks: {
        identity: { volatility: 'STRUCTURAL', source: BASE, assertedAt: asserted },
        activities: { volatility: 'VOLATILE', source: BASE, assertedAt: asserted },
      },
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 0;
  const delay = Number(args[args.indexOf('--delay') + 1]) || 700;
  const partial = limit > 0;

  const [locTerms, typeTerms] = await Promise.all([
    terms('tilbud-location'), terms('tilbud-type'),
  ]);
  Logger.info(`taxonomies: ${locTerms.size} locations, ${typeTerms.size} service types`);

  const all: Tilbud[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `${API}/tilbud?per_page=100&page=${page}`
      + '&_fields=id,slug,link,title,modified,tilbud-location,tilbud-type';
    let batch: Tilbud[];
    try {
      batch = await getJson<Tilbud[]>(url, { timeoutMs: 60_000 });
    } catch {
      break;                        // the API 400s past the last page
    }
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
  }
  const items = partial ? all.slice(0, limit) : all;
  Logger.info(`tilbud: ${all.length}${partial ? `, taking ${items.length}` : ''}`);

  const definitions: ActivityDefinition[] = [];
  const chapters: Chapter[] = [];

  await paced(items, delay, async (t: Tilbud, i: number) => {
    const name = decodeEntities(stripHtml(t.title.rendered));
    const locations = (t['tilbud-location'] ?? [])
      .map((id) => locTerms.get(id)).filter((x): x is Term => Boolean(x));
    const types = (t['tilbud-type'] ?? [])
      .map((id) => typeTerms.get(id)).filter((x): x is Term => Boolean(x));

    let description: string | undefined;
    try {
      description = parseDescription(await getText(t.link, { timeoutMs: 60_000, attempts: 3 }));
    } catch (e) {
      Logger.warn(`  no page for ${t.link}: ${e}`);
      stats.noDescription += 1;
    }

    definitions.push(toDefinition(t, name, types, locations, description));
    for (const loc of locations) chapters.push(toChapter(t, name, loc, types));
    if ((i + 1) % 40 === 0) Logger.info(`    ${i + 1}/${items.length}`);
  });

  definitions.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  chapters.sort((a, b) => a.name.localeCompare(b.name, 'nb'));

  const extract = (sourceId: string, n: number) => ({
    sourceId,
    method: 'REST_API' as const,
    baseUrl: BASE,
    indexUrl: `${API}/tilbud`,
    fetchedAt: nowIso(),
    extractorVersion: EXTRACTOR_VERSION,
    pagesAttempted: items.length,
    pagesParsed: n,
    isRobotsAllowed: true,
    license: 'none-stated',
  });

  const actOut = path.join(DATA_DIR, ORG.id,
    partial ? 'activities.partial.json' : 'activities.json');
  const chapOut = path.join(DATA_DIR, ORG.id,
    partial ? 'chapters.partial.json' : 'chapters.crawl.json');
  writeCollection(actOut, {
    items: definitions, extract: extract('kirkens-bymisjon-tilbud', definitions.length),
  } as Collection<ActivityDefinition>);
  writeCollection(chapOut, {
    items: chapters, extract: extract('kirkens-bymisjon-tilbud-locations', chapters.length),
  } as Collection<Chapter>);

  const byType = definitions.reduce<Record<string, number>>((m, d) => {
    const k = d.group?.name ?? '(none)'; m[k] = (m[k] ?? 0) + 1; return m;
  }, {});
  const origin = definitions.reduce<Record<string, number>>((m, d) => {
    m[d.origin] = (m[d.origin] ?? 0) + 1; return m;
  }, {});
  Logger.info(`\n  ${definitions.length} services -> ${path.relative(DATA_DIR, actOut)}`
    + `${partial ? '  (PARTIAL)' : ''}`);
  Logger.info(`  ${chapters.length} local units -> ${path.relative(DATA_DIR, chapOut)}`);
  Logger.info(`\n    descriptions   ${stats.described} from the page`
    + `, ${stats.viaOg} from og:description, ${stats.noDescription} missing`);
  Logger.info(`    origin         ${JSON.stringify(origin)}`);
  Logger.info(`    serviceCategory ${JSON.stringify(byType)}`);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
