/**
 * file: ingest/src/sources/frelsesarmeen-chapters.ts
 * description: Crawl Frelsesarmeen's local units from its Craft-built site.
 * output: data/frelsesarmeen/chapters.crawl.json
 *
 * THE UNIT OF EXTRACTION IS THE CONTACT CARD, NOT THE PAGE. The sitemap lists 139
 * /lokalavdeling/ URLs, and the obvious reading — one page, one chapter — is wrong. 83 of
 * those pages describe a single unit, but the rest are PLACE HUBS that list every unit in a
 * town: /lokalavdeling/oslo carries 49 cards, Trondheim 16, Bergen 13. Taking the page as
 * the unit would have reported 139 units and silently discarded 168 of them.
 *
 *   139 pages  ->  316 cards  ->  307 distinct units after deduplication
 *
 * Deduplication is needed because a hub's card for a unit that has its own page is a
 * POINTER: /lokalavdeling/mandal shows 'Frelsesarmeen, Mandal korps' as a link with no
 * details, and /lokalavdeling/mandal-korps then shows it in full. 47 cards are pointers of
 * that kind. Keyed on the organisation number where present, on the normalised name
 * otherwise, the fuller record wins.
 *
 * THE CARDS PUBLISH ORGANISATION NUMBERS. 116 distinct ones, and 104 of them are sub-units
 * of Frelsesarmeen in Brreg. That makes reconciliation exact rather than name-based for
 * those units — see reconcile-chapters.ts, which tries the number first.
 *
 * Against the 175 sub-units from brreg-subunits.ts this inventory covers 94%, and adds
 * roughly 140 units the registry does not hold at all: Fretex shops, Gatehospitalet,
 * Home-Start offices and similar services run directly under the national entity without a
 * registration of their own. Registry and crawl are complementary here exactly as designed.
 *
 *   npm run frelsesarmeen -- --limit 20   # smoke test, writes chapters.partial.json
 *   npm run frelsesarmeen                 # full crawl
 */

import * as path from 'path';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { decodeEntities, slugify, stripHtml } from '../lib/text';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import type { Activity, Chapter, Collection, Contact } from '../lib/types';

const BASE = 'https://frelsesarmeen.no';
const UNIT_SITEMAP = `${BASE}/sitemaps-1-categorygroup-departments-1-sitemap.xml`;
const ORG = { id: 'frelsesarmeen', name: 'Frelsesarmeen' };
/** The national legal entity. A card printing this is NOT identifying itself — see below. */
const NATIONAL_ORGNR = '938498318';
const EXTRACTOR_VERSION = '0.1.0';

/** A contact card: <li><div class="py-4 ..."> inside the KONTAKTINFO list. */
const CARD = /<li>\s*<div class="py-4[^"]*">([\s\S]*?)<\/li>/g;

interface Card {
  name: string;
  /** The service area the organisation files this unit under, when its name states one. */
  area?: string;
  orgnr?: string;
  addressLine?: string;
  postalCode?: string;
  postalPlace?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** Set when the card only points at the unit's own page, carrying no details. */
  pointerTo?: string;
  pageUrl: string;
  isSelfDescribed: boolean;
}

const stats = {
  pages: 0, parsed: 0, cards: 0, pointers: 0, nationalOrgnr: 0, ambiguousActivities: 0,
  // A block found but nothing parsed out of it is the signature of a dead selector. Counted
  // so that silence reports itself instead of looking like 'this organisation names nobody'.
  contactBlocks: 0, contactsFound: 0,
};

/**
 * A Norwegian organisation number is nine digits. Two cards print the NATIONAL number
 * instead of their own — Bodø korps is one — and accepting it would make those units
 * collide with the national entity and with each other under one identifier. Reject it and
 * fall back to the name, which is what an un-numbered card does anyway.
 */
function readOrgnr(card: string): string | undefined {
  const raw = /Organisasjonsnr:\s*([\d\s]{9,16})/.exec(card)?.[1];
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length !== 9) return undefined;
  if (d === NATIONAL_ORGNR) { stats.nationalOrgnr += 1; return undefined; }
  return d;
}

/**
 * The address is the first `font-light text-xs` div in the card that carries no label and
 * no link — the labelled ones are 'Mobil:', 'Organisasjonsnr:', 'Bankkonto:', 'Vippsnr:'.
 */
function readAddress(card: string): Pick<Card, 'addressLine' | 'postalCode' | 'postalPlace'> {
  for (const m of card.matchAll(/<div class="font-light text-xs">([\s\S]*?)<\/div>/g)) {
    const inner = m[1];
    if (/<a\b/.test(inner)) continue;
    const text = decodeEntities(stripHtml(inner)).trim();
    if (!text || /^(Mobil|Telefon|Organisasjonsnr|Bankkonto|Vippsnr|Faks)\b/i.test(text)) continue;
    const post = /(\d{4})\s+([^\d,]+)$/.exec(text);
    return {
      addressLine: post ? text.slice(0, post.index).replace(/,\s*$/, '').trim() : text,
      postalCode: post?.[1],
      postalPlace: post?.[2].trim(),
    };
  }
  return {};
}

/**
 * Card names are written in three shapes, and only one of them is a bare brand prefix:
 *
 *   'Frelsesarmeen, Grønland korps'                    brand + unit
 *   'Frelsesarmeens rusomsorg, Fyrlyset og Jobben'     brand + SERVICE AREA + unit
 *   'Frelsesarmeens arbeid mot menneskehandel'         brand possessive, no unit after it
 *
 * Stripping `Frelsesarmeens?` unconditionally turns the third shape into the fragment
 * 'arbeid mot menneskehandel' — a lowercase sentence fragment standing in as a name. Split
 * on the comma instead, and keep the service area: 'rusomsorg', 'seksjon for oppvekst',
 * 'barnehager' are the organisation's own words for what a unit does, which is better
 * `chapterType` material than anything inferred from the unit's own name.
 */
function splitName(raw: string): { name: string; area?: string } {
  const text = raw.replace(/\s+/g, ' ').trim();
  const m = /^Frelsesarmeens?\s*([^,]*?)\s*,\s*(.+)$/i.exec(text);
  if (!m) return { name: text };
  const area = m[1].trim();
  return { name: m[2].trim() || text, area: area || undefined };
}

function parseCard(raw: string, pageUrl: string): Card | undefined {
  const nameRaw = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(raw)?.[1];
  if (!nameRaw) return undefined;
  const { name, area } = splitName(decodeEntities(stripHtml(nameRaw)));
  if (!name) return undefined;

  const pointerTo = /<a[^>]+href="(https:\/\/frelsesarmeen\.no\/lokalavdeling\/[^"]+)"/
    .exec(raw)?.[1];
  const phoneRaw = /href="tel:([^"]+)"/.exec(raw)?.[1];
  const email = /href="mailto:([^"]+)"/.exec(raw)?.[1]?.trim();
  // The template always emits the website anchor, with href="http://" when unset.
  const siteRaw = /<a class="link" href="(https?:\/\/[^"]{8,})"/.exec(
    raw.replace(/href="mailto:[^"]*"/g, '').replace(/href="tel:[^"]*"/g, ''))?.[1];
  const website = siteRaw && !/frelsesarmeen\.no\/lokalavdeling\//.test(siteRaw)
    ? normaliseUrl(siteRaw).url : undefined;

  return {
    name,
    area,
    orgnr: readOrgnr(raw),
    ...readAddress(raw),
    phone: phoneRaw ? `+47 ${phoneRaw.replace(/\D/g, '')}` : undefined,
    email,
    website,
    pointerTo,
    pageUrl,
    // A card that is only a link to another page describes nothing itself.
    isSelfDescribed: !pointerTo || Boolean(email || phoneRaw),
  };
}

/**
 * Activities come from the 'VÅRE TILBUD I <NAME>' list. The enclosing element carries
 * id="tilbud", but so does a block of editorial articles further down the same page: a
 * window taken from the id alone harvests 'Prest falt for løs snipp i Arméen' and
 * '– Frisk seilas reddet livet mitt' as services. Anchor on the heading and stop at the
 * first </ul> — 21 pages carry a real list, not the 106 the id suggests.
 */
function parseActivities(html: string, pageUrl: string): Activity[] {
  const heading = /VÅRE TILBUD I ([^<]*)<\/h2>/.exec(html);
  if (!heading) return [];
  const start = html.indexOf('<ul', heading.index + heading[0].length);
  const end = html.indexOf('</ul>', start);
  if (start < 0 || end < 0) return [];

  const out: Activity[] = [];
  for (const li of html.slice(start, end).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const href = /href="(https:\/\/frelsesarmeen\.no\/korps\/[^"]+)"/.exec(li[1])?.[1];
    const name = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(li[1])?.[1];
    if (!href || !name) continue;
    const description = /<p[^>]*>([\s\S]*?)<\/p>/.exec(li[1])?.[1];
    out.push({
      name: decodeEntities(stripHtml(name)),
      // The /korps/<slug> page is the definition; the slug is its stable identifier.
      definition: { id: `${ORG.id}:${slugify(href.split('/korps/')[1])}` },
      description: description ? decodeEntities(stripHtml(description)) : undefined,
      sourceUrl: pageUrl,
    });
  }
  return out;
}

/**
 * The freetext 'Kontaktinformasjon' block names individuals: 'Major <given name> <family name>,
 * korpsleder'. Only 19 of 139 pages carry one. The role follows the name after a comma.
 */
function parseContacts(html: string, pageUrl: string): Contact[] {
  const h = /<h2 class="font-bold">\s*Kontaktinformasjon\s*<\/h2>([\s\S]{0,2500}?)(?:<h2|<\/section>)/
    .exec(html);
  if (!h) return [];
  stats.contactBlocks += 1;
  // NOT stripHtml: it collapses /\s+/ to a single space, which destroys the newlines this
  // parser depends on. Feeding it a <br>-to-\n substitution produces one long line, every
  // per-line match fails, and the run reports zero contacts with no error at all — which is
  // exactly what happened on the first full crawl. Strip tags here, keeping line breaks.
  const text = decodeEntities(
    h[1].replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ''),
  ).replace(/[ \t\u00a0]+/g, ' ');
  const out: Contact[] = [];
  const lines = text.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // 'Major <given name> <family name>, korpsleder' — a rank or given name, then a role after a comma.
    const m = /^([A-ZÆØÅ][^,@]{3,60}?),\s*([a-zæøå][a-zæøå\s/-]{2,40})$/.exec(line);
    if (!m) continue;
    // The person's own address is on the next line, under an 'Epost:' label. The block's
    // FIRST address is the unit's shared one and must not be attached to a named person.
    const personEmail = /^E-?post:\s*(\S+@\S+)$/i.exec(lines[i + 1] ?? '')?.[1];
    const words = m[1].trim().split(/\s+/);
    const RANKS = /^(Major|Kaptein|Kommandør|Oberst|Brigader|Løytnant|Sersjant)$/i;
    const jobTitle = RANKS.test(words[0]) ? words.shift() : undefined;
    if (words.length < 2) continue;
    stats.contactsFound += 1;
    out.push({
      role: m[2].trim(),
      givenName: words[0],
      familyName: words.slice(1).join(' '),
      jobTitle,
      email: personEmail,
      isMasked: false,
      sourceUrl: pageUrl,
    });
  }
  return out;
}

function toChapter(c: Card, activities: Activity[], contacts: Contact[]): Chapter {
  const id = c.orgnr ? `${ORG.id}:${c.orgnr}` : `${ORG.id}:${slugify(c.name)}`;
  const level = /\b(divisjon|region)\b/i.test(c.name) ? 'REGIONAL' : 'LOCAL';
  // The organisation's own service area wins; fall back to the unit's name only when the
  // card states none.
  const chapterType = c.area
    ? c.area.charAt(0).toUpperCase() + c.area.slice(1)
    : /\bkorps\b/i.test(c.name) ? 'Korps'
    : /\bfretex\b/i.test(c.name) ? 'Fretex'
    : 'Virksomhet';

  return {
    id,
    name: c.name,
    organizationNumber: c.orgnr,
    organization: ORG,
    parent: { id: `${ORG.id}:${NATIONAL_ORGNR}`, name: ORG.name, level: 'NATIONAL' },
    chapterType,
    level,
    address: c.addressLine || c.postalCode
      ? { line1: c.addressLine, postalCode: c.postalCode, postalPlace: c.postalPlace }
      : undefined,
    addressKind: c.addressLine ? 'VISITING' : undefined,
    email: c.email,
    phone: c.phone,
    website: c.website ?? normaliseUrl(c.pointerTo ?? c.pageUrl).url,
    contacts: contacts.length ? contacts : undefined,
    activities: activities.length ? activities : undefined,
    provenance: {
      sourceUrl: c.pointerTo ?? c.pageUrl,
      // The organisation publishing its own unit list, but with no second source yet.
      confidence: c.orgnr ? 'HIGH' : 'MEDIUM',
      reconciliation: 'UNRECONCILED',
      idOrigin: c.orgnr ? 'SOURCE' : 'DERIVED',
      parentOrigin: 'SOURCE',
      municipalityMethod: 'NONE',
      matchMethod: 'sourceAuthoritative',
      containsPersonalData: Boolean(contacts.length),
    },
    freshness: {
      fetchedAt: nowIso(),
      blocks: {
        identity: { volatility: 'STRUCTURAL', source: BASE },
        location: { volatility: 'SLOW', source: BASE },
        contacts: { volatility: 'ANNUAL', source: BASE },
        activities: { volatility: 'VOLATILE', source: BASE },
      },
    },
  };
}

/** Key a card for deduplication: the organisation number, else the normalised name. */
const dedupeKey = (c: Card) => c.orgnr ?? `n:${slugify(c.name)}`;
/** How much a card actually says — used to keep the fuller of two records for one unit. */
const richness = (c: Card) =>
  Number(Boolean(c.orgnr)) + Number(Boolean(c.addressLine)) + Number(Boolean(c.email))
  + Number(Boolean(c.phone)) + Number(Boolean(c.website));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 0;
  const delay = Number(args[args.indexOf('--delay') + 1]) || 700;
  const partial = limit > 0;

  const xml = await getText(UNIT_SITEMAP, { timeoutMs: 60_000 });
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => u.includes('/lokalavdeling/'));
  const urls = partial ? all.slice(0, limit) : all;
  Logger.info(`sitemap: ${all.length} unit pages${partial ? `, taking ${urls.length}` : ''}`);

  const best = new Map<string, { card: Card; activities: Activity[]; contacts: Contact[] }>();

  await paced(urls, delay, async (url: string, i: number) => {
    stats.pages += 1;
    let html: string;
    try {
      html = await getText(url, { timeoutMs: 60_000, attempts: 4 });
    } catch (e) {
      Logger.warn(`  skip ${url}: ${e}`);
      return;
    }
    stats.parsed += 1;

    const k = html.indexOf('KONTAKTINFO');
    const section = k >= 0 ? html.slice(k) : '';
    const cards: Card[] = [];
    for (const m of section.matchAll(CARD)) {
      const c = parseCard(m[1], url);
      if (c) cards.push(c);
    }
    stats.cards += cards.length;
    stats.pointers += cards.filter((c) => c.pointerTo && !c.isSelfDescribed).length;

    const activities = parseActivities(html, url);
    const contacts = parseContacts(html, url);

    // Page-level detail describes ONE unit, so attribute it only when the page leaves no
    // doubt which: a single self-describing card. On a hub listing several units the
    // activities belong to the town rather than to any one of them, and guessing would
    // attach a korps's services to the Fretex shop next door. Counted, not silently lost.
    const own = cards.filter((c) => !c.pointerTo);
    const attributable = own.length === 1;
    if (!attributable && activities.length) stats.ambiguousActivities += activities.length;

    for (const card of cards) {
      const key = dedupeKey(card);
      const mine = attributable && card === own[0];
      const entry = {
        card,
        activities: mine ? activities : [],
        contacts: mine ? contacts : [],
      };
      const prev = best.get(key);
      if (!prev || richness(card) > richness(prev.card)) {
        // Keep detail the weaker record happened to carry.
        best.set(key, {
          card,
          activities: entry.activities.length ? entry.activities : prev?.activities ?? [],
          contacts: entry.contacts.length ? entry.contacts : prev?.contacts ?? [],
        });
      } else if (entry.activities.length && !prev.activities.length) {
        prev.activities = entry.activities;
        prev.contacts = entry.contacts.length ? entry.contacts : prev.contacts;
      }
    }
  });

  // SECOND PASS. A hub's pointer card carries no organisation number, so it keys on the
  // name while the unit's own card keys on the number: 'Bergen sentrum korps' came out
  // twice, once as frelsesarmeen:bergen-sentrum-korps and once as frelsesarmeen:974294338.
  // One pass cannot catch this, because the number that would have merged them is only
  // known after the second card is read. Fold name-keyed entries into a numbered entry of
  // the same name, keeping whatever detail only the name-keyed one had.
  let folded = 0;
  const byName = new Map<string, string>();
  for (const [key, e] of best) if (e.card.orgnr) byName.set(slugify(e.card.name), key);
  for (const [key, e] of [...best]) {
    if (!key.startsWith('n:')) continue;
    const target = byName.get(slugify(e.card.name));
    if (!target || target === key) continue;
    const keep = best.get(target)!;
    if (!keep.activities.length && e.activities.length) keep.activities = e.activities;
    if (!keep.contacts.length && e.contacts.length) keep.contacts = e.contacts;
    best.delete(key);
    folded += 1;
  }

  const items = [...best.values()]
    .map((e) => toChapter(e.card, e.activities, e.contacts))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));

  const collection: Collection<Chapter> = {
    items,
    extract: {
      sourceId: 'frelsesarmeen-lokalavdelinger',
      method: 'SITEMAP_CRAWL',
      baseUrl: BASE,
      indexUrl: UNIT_SITEMAP,
      fetchedAt: nowIso(),
      extractorVersion: EXTRACTOR_VERSION,
      pagesAttempted: urls.length,
      pagesParsed: stats.parsed,
      isRobotsAllowed: true,
      license: 'none-stated',
    },
  };

  const out = path.join(DATA_DIR, ORG.id,
    partial ? 'chapters.partial.json' : 'chapters.crawl.json');
  writeCollection(out, collection);

  const has = (f: keyof Chapter) => items.filter((c) => c[f] !== undefined).length;
  const acts = items.flatMap((c) => c.activities ?? []);
  Logger.info(`\n  ${stats.parsed}/${urls.length} pages -> ${stats.cards} cards -> `
    + `${items.length} distinct units${partial ? '  (PARTIAL)' : ''}`);
  Logger.info(`    ${stats.pointers} pointer card(s), ${folded} folded into a numbered unit`);
  Logger.info(`    wrote ${path.relative(DATA_DIR, out)}`);
  Logger.info(`    organizationNumber ${has('organizationNumber')}   address ${has('address')}`
    + `   email ${has('email')}   phone ${has('phone')}`);
  Logger.info(`    contacts ${has('contacts')}   activities ${has('activities')}`
    + `   (${acts.length} provisions, ${new Set(acts.map((a) => a.definition?.id)).size} distinct)`);
  const types = items.reduce<Record<string, number>>((m, c) => {
    m[c.chapterType!] = (m[c.chapterType!] ?? 0) + 1; return m;
  }, {});
  Logger.info(`    chapterType ${JSON.stringify(types)}`);
  if (stats.nationalOrgnr) {
    Logger.warn(`${stats.nationalOrgnr} card(s) printed the NATIONAL organisation number `
      + `${NATIONAL_ORGNR} instead of their own; rejected, matched by name instead`);
  }
  if (stats.contactBlocks && !stats.contactsFound) {
    Logger.error(`${stats.contactBlocks} page(s) carry a 'Kontaktinformasjon' block but NOT ONE `
      + 'named contact parsed out of them — treat this as a broken selector, not as an '
      + 'organisation that names nobody');
  } else if (stats.contactBlocks) {
    Logger.info(`    contact blocks ${stats.contactBlocks} -> ${stats.contactsFound} named people`);
  }
  if (stats.ambiguousActivities) {
    Logger.warn(`${stats.ambiguousActivities} activity listing(s) sat on a multi-unit hub `
      + 'page and could not be attributed to one unit; not attached');
  }
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
