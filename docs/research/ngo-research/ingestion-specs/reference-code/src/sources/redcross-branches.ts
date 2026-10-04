/**
 * file: ingest/src/sources/redcross-branches.ts
 * description: R8 - Røde Kors's districts and branches from rodekors.no, with the activities each
 *              branch publishes and the branch's own text about each one.
 * output: data/redcross/chapters.crawl.json  (then: npm run reconcile -- redcross)
 *
 * Owner decision 2026-10-04: Røde Kors is scraped like every other NGO, not read from its API.
 *
 * Discovery is the sitemap (`/sitemap.no.xml/`): `/lokalforeninger/<district>/` is a district,
 * `/lokalforeninger/<district>/<x>/` is a branch OR one of the district's own section pages
 * (`om-oss`, `aktiviteter`, `bli-frivillig` …). The page decides which: a branch page has a title
 * and the address block (`<dl>` with "Adresse"); a section page has not.
 *
 * A branch page (measured on Ankenes and Bergen, 2026-10-04):
 *   h1.page__title                     the branch's name
 *   "Tilbake til: <district>"          the parent, as the site states it
 *   dl dt/dd                           Adresse, Telefon ("-" = none), E-post
 *   .expander__outer h2.expander__title  the branch's own activity category ("Barn og unge")
 *   .expander .expander__item          one activity: button.expander__head span = its LOCAL name,
 *                                      .expander__body = the branch's text about it, verbatim
 * Page furniture, the same on every branch and not the branch's: the "Bli frivillig", "Bli medlem"
 * and "grasrotandel" buttons (a.cta-button) and the feedback form. None of it is read.
 *
 * An activity's text often names its coordinator and an e-mail or phone number; it is stored as
 * published (description) and taken out of the public text by `npm run redact`.
 *
 *   npm run redcross                 # every district and branch page (~400 pages, ~8 min)
 *   npm run redcross -- --limit 20   # a smoke test -> chapters.partial.json
 */

import * as path from 'path';
import * as cheerio from 'cheerio';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import { blocks, joinBlocks } from '../lib/description';
import { slugify } from '../lib/text';
import type { Activity, Chapter, Collection } from '../lib/types';

const BASE = 'https://www.rodekors.no';
const SITEMAP = `${BASE}/sitemap.no.xml/`;
const ORG = { id: 'redcross', name: 'NORGES RØDE KORS' };
const EXTRACTOR_VERSION = '0.2.0';
const SECTION_SLUGS = new Set(['om', 'om-oss', 'om-organisasjonen', 'kontakt', 'kontakt-oss', 'aktiviteter', 'aktivitetar',
  'aktiviteter-og-kurs', 'vare-aktiviteter', 'vare-stottespillere', 'bli-frivillig', 'blifrivillig', 'bli-medlem',
  'presse', 'aktuelt', 'naringsliv', 'jul-oslo-rode-kors', 'sommer-oslo-rode-kors']);

/**
 * Branches name their activities locally - "Besøkstjenesten i Bergen", "Besøksteneste", "BARK
 * Fyllingsdalen". These rules map a local name to the NATIONAL activity it is (the 51 names in
 * Røde Kors's own system, as Atlas's supply__redcross_branch_activities lists them). First match
 * wins, so the specific rule comes before the general one ("Besøksvenn med hund" before
 * "Besøksvenn"; prison visiting before visiting). A name no rule matches stays a LOCAL activity.
 */
const NATIONAL: [RegExp, string][] = [
  [/hjelpekorps/i, 'Hjelpekorps'],
  [/hund/i, 'Besøksvenn med hund'],
  [/fengsel|innsatte|visitor/i, 'Visitor'],
  [/soning/i, 'Nettverk etter soning'],
  [/v[åa]ke(tjenest|tenest)/i, 'Våketjenesten'],
  [/bes[øo]k|besøksvenn/i, 'Besøkstjeneste'],
  [/r[øo]ff|friluftsliv og førstehjelp/i, 'Røde Kors Friluftsliv og Førstehjelp (RØFF)'],
  [/beredskapsvakt|sanitetsvakt|beredskap|psykososial/i, 'Beredskap'],
  [/førstehjelp|kurs/i, 'Opplæring'],
  [/barnas (r[øo]de kors|raude kross)|\bbark\b/i, 'Barnas Røde Kors'],
  [/digital leksehjelp/i, 'Digital leksehjelp'],
  [/leksehjelp|studiekaf/i, 'Leksehjelp'],
  [/norsktrening/i, 'Norsktrening'],
  [/spr[åa]k/i, 'Språkgruppe'],
  [/flyktninge?guide/i, 'Flyktningguide'],
  [/asylmot+ak|\bmottak/i, 'Aktiviteter på asylmottak'],
  [/utlendingsinternat/i, 'Aktiviteter på utlendingsinternat'],
  [/treffpunkt/i, 'Treffpunkt - Røde Kors Ungdom'],
  [/fellesverk/i, 'Møteplass Fellesverkene'],
  [/r[øo]de kors ungdom|\brku\b/i, 'Øvrige aktiviteter -  Røde Kors Ungdom'],
  [/vitnest[øo]tte/i, 'Vitnestøtte'],
  [/ferie for alle/i, 'Ferie for alle'],
  [/bruktbutikk/i, 'Bruktbutikk'],
  [/gatemegl/i, 'Gatemegling'],
  [/familiesenter/i, 'Familiesenter'],
  [/vennefamilie/i, 'Vennefamilie'],
  [/mentorfamilie/i, 'Mentorfamilie'],
  [/akuttovernatting|n[øo]dovernatting/i, 'Akuttovernatting for bostedsløse tilreisende'],
  [/kors p[åa] halsen/i, 'Kors på Halsen'],
  [/humanit[æa]r rett/i, 'Internasjonal Humanitær Rett'],
  [/nattevandring/i, 'Nattevandring'],
  [/turgrupp|\btur\b/i, 'Turgruppe'],
  [/praktisk/i, 'Praktiske tjenester'],
  [/habil/i, 'Habil'],
  [/d[øo]r[åa]pner/i, 'Døråpner'],
  [/^eva\b/i, 'EVA'],
  [/m[øo]teplass|treff|kaf[ée]/i, 'Møteplasser'],
];
/** Expander items that are about the branch, not an activity it runs (counted, then dropped). */
const NOT_ACTIVITY = new RegExp(['styret', 'styrearbeid', 'årsmøte', 'arsmote', 'årsrapport', 'ansatte', 'administrasjon', 'organisasjon$',
  'utleie', 'utleige', 'leige', '\\bleie\\b', 'kontaktinformasjon', 'sosiale medier', 'støtt vårt', 'støtter du', 'bli medlem', 'bli frivillig', 'hvem sitter',
  'vedtekter', 'årsmelding', 'juleaksjon', '^om ', 'nyttig å vite', 'information in english', 'jubileum', '^boka? ', 'lokalforen',
  'nye aktiviteter vi ønsker', 'frivillig innsats i', 'frivilligsamling', 'praktikantstilling', 'aktivitetsledere', 'pantepatrulje'].join('|'), 'i');
export const isActivity = (local: string): boolean => !NOT_ACTIVITY.test(local);

export const nationalOf = (local: string): string | undefined => NATIONAL.find(([re]) => re.test(local))?.[1];

interface Parsed {
  name?: string; parentName?: string; intro?: string;
  address?: Chapter['address']; phone?: string; email?: string;
  activities: (Activity & { category?: string })[];
}

function parseAddress(s: string): Chapter['address'] | undefined {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || t === '-') return undefined;
  const m = t.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
  return m ? { line1: m[1].replace(/,$/, '').trim() || undefined, postalCode: m[2], postalPlace: m[3].trim() } : { line1: t };
}

export let dropped = 0;
export function parseBranch(html: string, url: string): Parsed {
  const $ = cheerio.load(html);
  const main = $('main').first();
  const name = main.find('h1.page__title').first().text().replace(/\s+/g, ' ').trim() || undefined;
  const back = main.find('a').filter((_, a) => /^Tilbake til:/.test($(a).text().trim())).first().text();
  const parentName = back.replace(/\s+/g, ' ').replace(/^Tilbake til:\s*/, '').trim() || undefined;
  const intro = main.find('h1.page__title').first().nextAll('p').first().text().replace(/\s+/g, ' ').trim() || undefined;

  const facts: Record<string, string> = {};
  main.find('dl dt').each((_, dt) => {
    facts[$(dt).text().trim().toLowerCase()] = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
  });
  const dash = (v?: string) => (v && v !== '-' ? v : undefined);

  const activities: Parsed['activities'] = [];
  main.find('.expander__item').each((_, item) => {
    const it = $(item);
    const local = it.find('.expander__head span').first().text().replace(/\s+/g, ' ').trim();
    if (!local) return;
    if (!isActivity(local)) { dropped += 1; return; }
    // The category is the nearest .expander__title before this item's .expander block.
    const block = it.closest('.expander');
    const category = block.prevAll('.expander__outer').first().find('.expander__title').text().replace(/\s+/g, ' ').trim()
      || undefined;
    const description = joinBlocks(blocks($, it.find('.expander__body').first())) || undefined;
    activities.push({ name: local, category, description, sourceUrl: url });
  });

  return {
    name, parentName, intro, activities,
    address: facts.adresse !== undefined ? parseAddress(facts.adresse) : undefined,
    phone: dash(facts.telefon), email: dash(facts['e-post']),
  };
}

async function discover(): Promise<{ url: string; depth: number; district: string }[]> {
  const xml = await getText(SITEMAP, { timeoutMs: 60_000 });
  const out: { url: string; depth: number; district: string }[] = [];
  for (const m of xml.matchAll(/<loc>(https:\/\/www\.rodekors\.no\/lokalforeninger\/([^<]*))<\/loc>/g)) {
    const parts = m[2].split('/').filter(Boolean);
    if (parts.length !== 1 && parts.length !== 2) continue;
    // A district's own section pages carry its address block too ("Om Agder Røde Kors",
    // "Kontakt Røde Kors i Trøndelag"); they are not branches.
    if (parts.length === 2 && SECTION_SLUGS.has(parts[1])) continue;
    out.push({ url: m[1], depth: parts.length, district: parts[0] });
  }
  // The sitemap lists some URLs twice (drammen, fet, levanger, the trondelag district).
  return [...new Map(out.map((p) => [p.url.replace(/\/?$/, '/'), p])).values()];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 0;
  const all = await discover();
  const pages = limit ? all.slice(0, limit) : all;
  Logger.info(`rodekors.no: ${all.filter((p) => p.depth === 1).length} district pages, `
    + `${all.filter((p) => p.depth === 2).length} branch-or-section pages${limit ? `, taking ${pages.length}` : ''}`);

  const items: Chapter[] = [];
  let sections = 0; let failed = 0;
  await paced(pages, process.env.NGO_FROM_CACHE === '1' ? 0 : 1000, async (p) => {
    let html: string;
    try { html = await getText(p.url, { timeoutMs: 60_000, attempts: 3 }); } catch (e) {
      Logger.warn(`  skip ${p.url}: ${e}`); failed += 1; return;
    }
    const b = parseBranch(html, p.url);
    // A branch or district page has a title and the address block; a section page has neither.
    if (!b.name || (b.address === undefined && b.email === undefined && b.phone === undefined && p.depth === 2)) {
      sections += 1; return;
    }
    const slug = p.url.replace(/\/$/, '').split('/').pop()!;
    items.push({
      id: p.depth === 1 ? `${ORG.id}:district-${slug}` : `${ORG.id}:${p.district}-${slug}`,
      name: b.name,
      organization: ORG,
      level: p.depth === 1 ? 'REGIONAL' : 'LOCAL',
      parent: p.depth === 2 && b.parentName ? { id: `${ORG.id}:district-${p.district}`, name: b.parentName, level: 'REGIONAL' } : undefined,
      address: b.address,
      addressKind: b.address ? 'VISITING' : undefined,
      email: b.email,
      phone: b.phone,
      website: p.url,
      activities: b.activities.map((a) => ({
        name: a.name,
        definition: ((n) => (n ? { id: `${ORG.id}:${slugify(n)}`, name: n } : { id: `${ORG.id}:local-${slugify(a.name)}`, name: a.name }))(nationalOf(a.name)),
        // The branch's category heading is mostly generic ("Våre aktiviteter", "Aktivitetar") - not stored.
        description: a.description,
        sourceUrl: a.sourceUrl,
      })),
      provenance: {
        sourceUrl: p.url,
        confidence: 'MEDIUM',
        reconciliation: 'UNRECONCILED',
        idOrigin: 'DERIVED',
        parentOrigin: 'SOURCE',
        municipalityMethod: 'NONE',
        matchMethod: 'sourceAuthoritative',
        containsPersonalData: b.activities.some((a) => /@|\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/.test(a.description ?? '')),
      },
      freshness: {
        fetchedAt: nowIso(),
        blocks: {
          identity: { volatility: 'STRUCTURAL', source: BASE },
          activities: { volatility: 'ANNUAL', source: BASE },
        },
      },
    });
  });

  items.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const collection: Collection<Chapter> = {
    items,
    extract: {
      sourceId: 'redcross-branches', method: 'SITEMAP_CRAWL', baseUrl: BASE, indexUrl: SITEMAP,
      fetchedAt: nowIso(), extractorVersion: EXTRACTOR_VERSION,
      pagesAttempted: pages.length, pagesParsed: items.length, isRobotsAllowed: true, license: 'none-stated',
    },
  };
  writeCollection(path.join(DATA_DIR, ORG.id, limit ? 'chapters.partial.json' : 'chapters.crawl.json'), collection);

  const acts = items.reduce((n, c) => n + (c.activities?.length ?? 0), 0);
  Logger.info(`  ${items.filter((c) => c.level === 'REGIONAL').length} districts, ${items.filter((c) => c.level === 'LOCAL').length} branches, `
    + `${sections} section pages skipped, ${failed} failed, ${dropped} branch-information items dropped (styret, utleie …)`);
  Logger.info(`  address ${items.filter((c) => c.address).length} · e-mail ${items.filter((c) => c.email).length} · `
    + `phone ${items.filter((c) => c.phone).length} · branches with activities ${items.filter((c) => c.activities?.length).length} · `
    + `activities ${acts} (${new Set(items.flatMap((c) => c.activities?.map((a) => a.name.toLowerCase()) ?? [])).size} distinct names)`);
}

if (require.main === module) main().catch((e) => { Logger.error(String(e)); process.exit(1); });
