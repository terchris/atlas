/**
 * file: ingest/src/sources/nks-chapters.ts
 * description: Crawl sanitetskvinnene.no for local chapters and the activities they run.
 * output: data/sanitetskvinnene/chapters.json, change-log.csv, and catalogue stubs
 *
 * The organisation publishes no dataset: no JSON:API, no GraphQL, and a content route that
 * answers `?_format=json` with 406 "Supported formats: html". Enumeration is therefore the
 * sitemap, which is one request and authoritative, rather than the paginated HTML listing.
 *
 *   npm run nks -- --limit 12      # smoke test
 *   npm run nks                    # full run, 552 pages, ~17 min at 1 req/s
 *   npm run nks -- --no-contacts   # omit the contact block entirely
 *   npm run nks -- --force         # write even if the batch guard flags the run
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { detectLanguage, slugify, stripHtml } from '../lib/text';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, readCollection, today, writeCollection } from '../lib/io';
import type {
  Activity, ActivityDefinition, Chapter, Collection, Contact,
} from '../lib/types';

const BASE = 'https://sanitetskvinnene.no';
const SITEMAP = `${BASE}/sitemap.xml`;
const ORG = { id: 'sanitetskvinnene', name: 'Norske Kvinners Sanitetsforening' };
const ORG_NUMBER = '970168001';
const EXTRACTOR_VERSION = '0.4.0';
const OUT_DIR = path.join(DATA_DIR, ORG.id);

/**
 * Chapter pages abbreviate: a page says 'Omsorgsber.' where the national catalogue says
 * 'Omsorgsberedskap'. Aliases are resolved against the catalogue FIRST, then against this
 * seed for abbreviations the catalogue has not yet learned. Every resolution is written
 * back as an alias, so the mapping accumulates on the thing it maps rather than here.
 */
const ALIAS_SEED: Record<string, string> = {
  'omsorgsber': 'omsorgsberedskap',
  'omsorgsberedskapsgruppe': 'omsorgsberedskap',
};

function resolveDefinitionId(raw: string, catalogue: ActivityDefinition[]): string {
  const slug = slugify(raw);
  const direct = catalogue.find((e) => e.id === `${ORG.id}:${slug}`);
  if (direct) return direct.id;
  const byAlias = catalogue.find((e) =>
    (e.aliases ?? []).some((a) => slugify(a) === slug));
  if (byAlias) return byAlias.id;
  const seeded = ALIAS_SEED[slug];
  if (seeded && catalogue.some((e) => e.id === `${ORG.id}:${seeded}`)) {
    return `${ORG.id}:${seeded}`;
  }
  return `${ORG.id}:${slug}`;
}

/** Blocks are hashed separately so a phone-number edit does not report as 'activities
 *  changed'. Only EXTRACTED, NORMALISED values are hashed — hashing the page would flag a
 *  change on every cookie banner, token or rotated image URL. */
const BLOCKS: Record<string, (c: Chapter) => unknown> = {
  identity: (c) => [c.name, c.chapterType],
  location: (c) => [c.municipalityNumber, c.address?.postalCode, c.address?.line1,
                    c.coordinates?.latitude, c.coordinates?.longitude],
  contacts: (c) => (c.contacts ?? [])
    .map((k) => `${k.role}|${k.givenName}|${k.familyName}|${k.email}|${k.phone}`).sort(),
  // Sorted: the order activities appear on a page is not semantic.
  activities: (c) => (c.activities ?? []).map((a) => a.name).sort(),
  communication: (c) => [c.website, c.facebookUrl],
};

const VOLATILITY: Record<string, 'STRUCTURAL' | 'SLOW' | 'ANNUAL' | 'VOLATILE'> = {
  identity: 'STRUCTURAL', location: 'SLOW', communication: 'SLOW',
  contacts: 'ANNUAL', activities: 'VOLATILE',
};

function normaliseForHash(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim().toLowerCase();
  if (Array.isArray(v)) return v.map(normaliseForHash);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normaliseForHash(x)]));
  }
  return v;
}

const blockHash = (chapter: Chapter, block: string): string =>
  crypto.createHash('sha256')
    .update(JSON.stringify(normaliseForHash(BLOCKS[block](chapter))))
    .digest('hex').slice(0, 16);

async function chapterUrls(): Promise<string[]> {
  const xml = await getText(SITEMAP, { timeoutMs: 60_000 });
  const re = new RegExp(`<loc>(${BASE}/lokalforening/[^<]+)</loc>`, 'g');
  return [...new Set([...xml.matchAll(re)].map((m) => m[1].replace(/\/$/, '')))]
    // ⚠️ 'velg-forening-meg' is the site's chapter PICKER, not a chapter. It sits in the
    // sitemap at chapter depth with a test leader, and passed every check as a SOURCE_ONLY
    // chapter until a hand audit on 3 Oct 2026.
    .filter((u) => !/\/velg-forening/.test(u))
    .sort();
}

/** The leader block is one run of text: 'Navn Navnesen 91 23 45 67 navn@example.org'. */
function parseContact(html: string, url: string): Contact | undefined {
  // ⚠️ Capture from the END of the opening tag. Matching on the class name alone started
  // the capture mid-attribute, so stripHtml saw a half tag and all 543 contacts came out
  // with givenName 'field--type-string' and the real name buried in raw HTML in familyName.
  // Every schema check passed: both are valid strings.
  const m = /field--name-field-leader-full-name[^>]*>([\s\S]{0,600})/.exec(html);
  if (!m) return undefined;
  let blob = stripHtml(m[1]);

  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(blob)?.[0];
  if (email) blob = blob.replace(email, ' ');

  const phoneMatch = /(?:\+47[\s ]*)?(?:\d{2}[\s ]?){4}\d?|\b\d{8}\b/.exec(blob);
  let phone: string | undefined;
  if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8) {
    const digits = phoneMatch[0].replace(/\D/g, '');
    phone = digits.startsWith('47') ? `+${digits}` : `+47 ${digits}`;
    blob = blob.replace(phoneMatch[0], ' ');
  }

  const name = blob.split(/\b(Adresse|Sosiale medier|Bli medlem|Nyhetsbrev)\b/)[0]
    .replace(/\s{2,}/g, ' ').trim();
  if (!name && !phone && !email) return undefined;

  const parts = name.split(/\s+/).filter(Boolean);
  return {
    role: 'Leder',
    givenName: parts[0],
    familyName: parts.slice(1).join(' ') || undefined,
    email, phone, isMasked: false, sourceUrl: url,
  };
}

function parseChapter(html: string, url: string, withContacts: boolean,
                     catalogue: ActivityDefinition[]): Chapter {
  const slug = url.split('/').pop()!;

  let name = '';
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (ld) {
    try {
      const parsed = JSON.parse(ld[1]);
      if (parsed['@type'] === 'BreadcrumbList') {
        name = parsed.itemListElement.at(-1)?.name ?? '';
      }
    } catch { /* fall through to <title> */ }
  }
  if (!name) name = stripHtml(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? slug)
    .split(' - ')[0];

  // Coordinates come from the map config as lat then lon. Our shape is named, so the
  // GeoJSON [lon, lat] transposition trap cannot occur.
  let coordinates: Chapter['coordinates'];
  const c = /"lat":\s*(-?\d+\.\d+)[\s\S]{0,80}?"lon":\s*(-?\d+\.\d+)/.exec(html);
  if (c) coordinates = { latitude: Number(c[1]), longitude: Number(c[2]) };

  let address: Chapter['address'];
  // Start capturing AFTER the opening tag closes: matching on the class name alone
  // leaves the rest of the attribute (and the tag's own markup) inside the capture.
  const a = /field--name-field-address[^>]*>([\s\S]*?)(?:<\/section>|field--name-field-social|<h2)/
    .exec(html);
  if (a) {
    let blob = stripHtml(a[1]).split(/\bSosiale medier\b|\bBli medlem\b/)[0]
      .replace(/^Bes[øo]ksadresse[^:]*:\s*/, '').replace(/ Norge/g, ' ').trim();
    const p = /(.*?)\s*(\d{4})\s+([A-ZÆØÅ][A-ZÆØÅa-zæøå\- ]+?)\s*$/.exec(blob);
    if (p) {
      address = { line1: p[1].trim() || undefined, postalCode: p[2],
                  postalPlace: p[3].trim() };
    } else if (blob) {
      address = { line1: blob.slice(0, 120) };
    }
  }

  const activities: Activity[] = [];
  const section = /<h2[^>]*>\s*Aktiviteter\s*<\/h2>([\s\S]*?)(?:<h2|<\/footer>)/.exec(html);
  if (section) {
    for (const h3 of section[1].matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
      const raw = stripHtml(h3[1]);
      if (raw) activities.push({ name: raw,
        definition: { id: resolveDefinitionId(raw, catalogue) } });
    }
  }

  const fb = /href="(https:\/\/(?:www\.)?facebook\.com\/[^"]+)"/.exec(html)?.[1];
  const contact = withContacts ? parseContact(html, url) : undefined;

  return {
    id: `${ORG.id}:${slug}`,
    name,
    organization: ORG,
    chapterType: /unge sanitet/i.test(name) ? 'Unge Sanitet'
      : /sanitetslag/i.test(name) ? 'Sanitetslag' : 'Sanitetsforening',
    level: 'LOCAL',
    address,
    // The organisation publishes a meeting venue, NOT the registered address a registry
    // holds. Conflating the two is the main way this dataset goes wrong.
    addressKind: address ? 'MEETING_VENUE' : undefined,
    coordinates,
    website: normaliseUrl(url).url,
    facebookUrl: normaliseUrl(fb).url,
    contacts: contact ? [contact] : undefined,
    activities: activities.length ? activities : undefined,
    provenance: {
      sourceUrl: url,
      confidence: 'MEDIUM',
      reconciliation: 'UNRECONCILED',
      idOrigin: 'DERIVED',
      parentOrigin: 'UNSTATED',
      municipalityMethod: 'NONE',
      matchMethod: 'sourceAuthoritative',
      containsPersonalData: Boolean(contact),
    },
  };
}

interface ChangeRow {
  changedAt: string; chapterId: string; chapterName: string; block: string;
  changeCount: number; isParseSuspect: boolean; sourceUrl: string;
}

function applyChangeDetection(chapters: Chapter[], previous: Chapter[], date: string) {
  const prior = new Map(previous.map((c) => [c.id, c.freshness?.blocks ?? {}]));
  const changes: ChangeRow[] = [];

  for (const chapter of chapters) {
    const old = prior.get(chapter.id) ?? {};
    const blocks: NonNullable<Chapter['freshness']>['blocks'] = {};
    for (const block of Object.keys(BLOCKS)) {
      const hash = blockHash(chapter, block);
      const before = (old as any)[block] ?? {};
      const moved = Boolean(before.contentHash) && before.contentHash !== hash;
      const emptyNow = !(BLOCKS[block](chapter) as any[])?.length;
      // A parse that suddenly yields nothing where it previously yielded something is far
      // more likely a broken selector than a chapter deleting everything. Flag it; never
      // record it as a removal.
      const suspect = moved && emptyNow;
      (blocks as any)[block] = {
        // N.K.S. pages carry no modified date, so nothing ASSERTS this block - the crawl
        // date is when we saw it (firstSeenAt/changedAt), never when it was true.
        volatility: VOLATILITY[block],
        freshness: 'UNKNOWN',
        source: BASE,
        contentHash: hash,
        firstSeenAt: before.firstSeenAt ?? date,
        changedAt: moved ? date : before.changedAt,
        changeCount: moved ? (before.changeCount ?? 0) + 1 : (before.changeCount ?? 0),
        isParseSuspect: suspect,
      };
      if (moved) {
        changes.push({
          changedAt: date, chapterId: chapter.id, chapterName: chapter.name, block,
          changeCount: (blocks as any)[block].changeCount, isParseSuspect: suspect,
          sourceUrl: chapter.provenance!.sourceUrl,
        });
      }
    }
    chapter.freshness = { fetchedAt: nowIso(), blocks };
  }
  return { changes, previousCount: prior.size };
}

/** Local-only activities become first-class catalogue stubs, so no reference dangles. */
function localOnlyDefinitions(chapters: Chapter[], date: string): ActivityDefinition[] {
  const catalogue = readCollection<ActivityDefinition>(
    path.join(OUT_DIR, 'activities.json'));
  const known = new Set((catalogue?.items ?? []).map((e) => e.id));
  const seen = new Map<string, { name: string; count: number }>();

  for (const c of chapters) {
    for (const a of c.activities ?? []) {
      const id = a.definition?.id;
      if (!id || known.has(id)) continue;
      const e = seen.get(id) ?? { name: a.name, count: 0 };
      e.count += 1;
      seen.set(id, e);
    }
  }
  const threshold = Math.max(3, Math.floor(0.05 * chapters.length));
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, v]) => ({
      id,
      organization: ORG,
      name: v.name,
      origin: 'LOCAL' as const,
      originEvidence: `not in the national catalogue (${known.size} entries checked)`,
      chapterCount: v.count,
      isPromotionCandidate: v.count >= threshold,
      descriptionLanguage: 'UNKNOWN' as const,
      descriptionWordCount: 0,
      serviceCategory: { assignmentMethod: 'UNMAPPED' as const, confidence: 'LOW' as const },
      freshness: { fetchedAt: nowIso() },
    }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = Number(arg('--limit') ?? 0);
  const delay = Number(arg('--delay') ?? 1000);
  const withContacts = !args.includes('--no-contacts');
  const force = args.includes('--force');
  // A --limit run produces a PARTIAL dataset. Writing it over the canonical file would
  // silently discard the rest, so send it elsewhere unless explicitly overridden.
  const partial = limit > 0 && !args.includes('--write-partial');
  const out = partial
    ? path.join(OUT_DIR, 'chapters.partial.json')
    : path.join(OUT_DIR, 'chapters.json');

  const catalogue = readCollection<ActivityDefinition>(
    path.join(OUT_DIR, 'activities.json'))?.items ?? [];
  Logger.info(`catalogue: ${catalogue.length} national definitions loaded`);

  let urls = await chapterUrls();
  Logger.info(`sitemap: ${urls.length} chapter URLs`);
  if (limit) {
    const step = Math.max(1, Math.floor(urls.length / limit));
    urls = urls.filter((_, i) => i % step === 0).slice(0, limit);
  }

  const { results: chapters, failures } = await paced(urls, delay, async (url) =>
    parseChapter(await getText(url), url, withContacts, catalogue));

  const rate = (chapters.length / urls.length) * 100;
  Logger.info(`\n  parsed ${chapters.length}/${urls.length} (${rate.toFixed(1)}%)`);
  if (rate < 95) Logger.warn('parse rate under 95% — the source markup probably changed');
  failures.slice(0, 5).forEach((f) => Logger.error(`${f.item}: ${f.error}`));

  const date = today();
  // compare against the canonical file even on a partial run
  const previous = readCollection<Chapter>(
    path.join(OUT_DIR, 'chapters.json'))?.items ?? [];
  const { changes, previousCount } = applyChangeDetection(chapters, previous, date);

  // BATCH GUARD: a large share changing in one run is a source redesign or a broken
  // selector, not real churn. Publishing it would flood the change log and blank real data.
  const changedIds = new Set(changes.map((c) => c.chapterId));
  const share = changedIds.size / Math.max(chapters.length, 1);
  const suspect = previousCount > 0 && share > 0.3;

  const collection: Collection<Chapter> = {
    items: chapters,
    extract: {
      sourceId: 'nks-lokalforeninger',
      method: 'SITEMAP_CRAWL',
      baseUrl: BASE,
      indexUrl: SITEMAP,
      fetchedAt: nowIso(),
      extractorVersion: EXTRACTOR_VERSION,
      pagesAttempted: urls.length,
      pagesParsed: chapters.length,
      isRobotsAllowed: true,
      license: 'none-stated',
      changeSummary: {
        isComparedAgainstPreviousRun: previousCount > 0,
        previouslyKnownCount: previousCount,
        changedCount: changedIds.size,
        changedBlockCount: changes.length,
        changedShare: Number(share.toFixed(4)),
        isRunSuspect: suspect,
      },
    },
  };

  if (suspect && !force) {
    Logger.error(`REFUSING TO WRITE: ${(share * 100).toFixed(0)}% of chapters changed `
      + `(${changedIds.size}/${chapters.length}).`);
    Logger.error('That is a source change or a broken parser, not real churn.');
    Logger.error('Inspect, then re-run with --force if it is genuine.');
    process.exit(2);
  }

  writeCollection(out, collection);
  Logger.info(`  wrote ${path.relative(DATA_DIR, out)}`
    + (partial ? '  (PARTIAL — canonical file untouched)' : ''));

  if (changes.length) {
    const log = path.join(OUT_DIR, 'change-log.csv');
    const header = 'changedAt,chapterId,chapterName,block,changeCount,isParseSuspect,sourceUrl';
    const rows = changes
      .sort((a, b) => a.block.localeCompare(b.block) || a.chapterName.localeCompare(b.chapterName))
      .map((c) => [c.changedAt, c.chapterId, `"${c.chapterName}"`, c.block,
                   c.changeCount, c.isParseSuspect, c.sourceUrl].join(','));
    if (!fs.existsSync(log)) fs.writeFileSync(log, `${header}\n`);
    fs.appendFileSync(log, `${rows.join('\n')}\n`);
    Logger.info(`  ${changes.length} block changes across ${changedIds.size} chapters`);
  } else if (previousCount) {
    Logger.info(`  no changes vs previous run (${previousCount} compared)`);
  }

  const stubs = partial ? [] : localOnlyDefinitions(chapters, date);
  if (stubs.length) {
    Logger.info(`  ${stubs.length} LOCAL-ONLY activities not in the national catalogue:`);
    for (const s of stubs) {
      Logger.info(`     ${s.name.padEnd(22)}${String(s.chapterCount).padStart(4)} chapters`
        + (s.isPromotionCandidate ? '  <- promotion candidate' : ''));
    }
    const cat = readCollection<ActivityDefinition>(path.join(OUT_DIR, 'activities.json'))
      ?? { items: [] };
    const byId = new Map(cat.items.map((e) => [e.id, e]));
    for (const s of stubs) if (!byId.has(s.id)) byId.set(s.id, s);
    writeCollection(path.join(OUT_DIR, 'activities.json'),
      { ...cat, items: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) });
  }

  const withActivities = chapters.filter((c) => c.activities?.length).length;
  const withContact = chapters.filter((c) => c.contacts?.length).length;
  Logger.info(`  with activities: ${withActivities}  with contact: ${withContact}`);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
