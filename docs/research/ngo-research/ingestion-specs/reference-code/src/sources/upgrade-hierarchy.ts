/**
 * file: ingest/src/sources/upgrade-hierarchy.ts
 * description: Fill in `registration`, and make `parent` the IMMEDIATE tier above.
 * output: rewrites data/<org>/chapters.json in place
 *
 * Two gaps this closes, both adopted from the Red Cross organizations API:
 *
 * 1. `parent` was a bare {id, name} pointing at the NATIONAL organisation for every
 *    chapter, because Enhetsregisteret publishes no relationship between two separately
 *    registered chapters. So a three-tier organisation - national, fylkeslag, lokallag -
 *    came out flat, and a consumer would read that flatness as fact. The Red Cross API
 *    models this properly: `branchParent` is a full `BranchBase` carrying the parent's
 *    TYPE, omitted for top-level units.
 *
 *    The middle tier is recoverable for four organisations because their websites put it
 *    in the URL (`/lokallag/<fylkeslag>/<lag>`), for Røde Kors because its sitemap does
 *    (`/lokalforeninger/<distrikt>/<lag>`), and - inferred, not stated - for Mental Helse
 *    and one N.K.S. county body from the chapter's municipality. Every relinked chapter
 *    records how in `provenance.parentMethod`. For Speiderforbundet, Frelsesarmeen and
 *    Folkehjelp the edge is in no public source and must come from the organisation.
 *
 * 2. An absent `organizationNumber` meant two different things - "no legal existence" and
 *    "we did not find it". `registration` now says which.
 *
 *   npm run hierarchy            # all organisations
 *   npm run hierarchy -- --dry-run
 */

import * as path from 'path';
import * as fs from 'fs';
import { getText } from '../lib/http';
import Logger from '../lib/logger';
import { foldNorwegian } from '../lib/text';
import { DATA_DIR, readCollection, writeCollection } from '../lib/io';
import type { Chapter, ChapterBase, Collection, ParentMethod, Registration } from '../lib/types';

/** Websites that encode the parent tier in the path, and which segment holds it. */
const PARENT_FROM_URL: Record<string, RegExp> = {
  lhl: /\/lokallag\/([^/]+)\/[^/]+\/?$/,
  nasjonalforeningen: /\/lokallag\/([^/]+)\/[^/]+\/?$/,
  diabetesforbundet: /\/fylkes-og-lokallag\/([^/]+)\/[^/]+\/?$/,
  'fire-h': /4h\.no\/([^/]+)\/klubber\/[^/]+\/?$/,
};

/** Current and pre-2020 county names, as they appear in a URL segment. */
const COUNTY = /(agder|akershus|buskerud|finnmark|innlandet|more-og-romsdal|nordland|oslo|rogaland|telemark|troms|trondelag|vestfold|vestland|ostfold|hedmark|oppland|hordaland|sogn|viken)/i;

const key = (s: string) => foldNorwegian(s).toUpperCase().replace(/[^A-Z0-9]+/g, '');

/**
 * Røde Kors: the chapters are registry rows with no page URL, but rodekors.no's sitemap
 * states every edge as `/lokalforeninger/<distrikt>/<lokalforening>`. 1 588 URLs, of which
 * the depth-three ones are branches. The chapter is matched by its name minus 'Røde Kors'.
 *
 * ⚠️ Seven branch slugs occur under two districts - 'nes' is in Akershus AND Hedmark, 'os'
 * in Hedmark AND Hordaland. The district is then chosen by the chapter's own municipality,
 * using the county codes each district covers; with no municipality it stays unlinked.
 * Section pages at the same depth ('om', 'om-oss', 'aktiviteter') simply match no chapter.
 */
interface SitemapEdges {
  base: string;
  districtOf: (c: Chapter) => string | undefined;
  resolve: (seg: string, items: Chapter[]) => Chapter | undefined;
}

const RK_DISTRICT_COUNTY: Record<string, string[]> = {
  agder: ['42'], akershus: ['32'], buskerud: ['33'], finnmark: ['56'], hedmark: ['34'],
  hordaland: ['46'], 'more-og-romsdal': ['15'], nordland: ['18'], oppland: ['34'],
  oslo: ['03'], ostfold: ['31'], rogaland: ['11'], 'sogn-og-fjordane': ['46'],
  trondelag: ['50'], telemark: ['40'], troms: ['55'], vestfold: ['39'],
};

async function redcrossSitemap(): Promise<SitemapEdges> {
  const base = 'https://www.rodekors.no/lokalforeninger';
  const xml = await getText('https://www.rodekors.no/sitemap.no.xml/', { timeoutMs: 60_000 });
  const edges = new Map<string, Set<string>>();
  for (const m of xml.matchAll(/<loc>https:\/\/www\.rodekors\.no\/lokalforeninger\/([^/<]+)\/([^/<]+)\/?<\/loc>/g)) {
    const k = key(decodeURIComponent(m[2]));
    if (!edges.has(k)) edges.set(k, new Set());
    edges.get(k)!.add(m[1]);
  }
  Logger.info(`    rodekors.no sitemap: ${edges.size} branch slugs`);
  return {
    base,
    districtOf(c) {
      const k = key(c.name.replace(/R(Ø|O)DE KORS/gi, ' ')
        .replace(/\b(LOKALFORENING|HJELPEKORPS)\b/gi, ' '));
      const districts = [...(edges.get(k) ?? [])];
      if (districts.length <= 1) return districts[0];
      const county = c.municipalityNumber?.slice(0, 2);
      const fit = districts.filter((d) => county && RK_DISTRICT_COUNTY[d]?.includes(county));
      return fit.length === 1 ? fit[0] : undefined;
    },
    // 'trondelag' must NOT match by substring: the register still holds NORD- and
    // SØR-TRØNDELAG RØDE KORS, and the site has merged them. Exact prefix only, any level -
    // Rogaland's district is registered as 'ROGALAND RØDE KORS MED FLEKKEFJORD BY' and
    // classified LOCAL until its children promote it.
    resolve: (seg, items) => items.find((r) => r.level !== 'NATIONAL'
      && key(r.name).startsWith(`${key(seg)}RODEKORS`)),
  };
}

const SITEMAP_EDGES: Record<string, () => Promise<SitemapEdges>> = { redcross: redcrossSitemap };

/**
 * Where no source states the edge, a federated organisation whose regional bodies follow
 * county lines lets the chapter's own municipality INFER it. Only these two qualify: Mental
 * Helse's fylkeslag follow the 2024 counties, and N.K.S. has one county body in the data.
 * Vestland (46) is left out for Mental Helse - three regional rows (Vestland, Bergen, Sogn
 * og Fjordane) claim it. Speiderforbundet's kretser ('Vestmarka', 'Ryvarden') and
 * Frelsesarmeen's divisjoner do NOT follow county lines, so geography would invent edges.
 */
const PARENT_FROM_COUNTY: Record<string, Record<string, RegExp>> = {
  'mental-helse': {
    '03': /\bOslo\b/i, 11: /Rogaland/i, 15: /Møre og Romsdal/i, 18: /Nordland/i,
    31: /Østfold/i, 32: /Akershus/i, 33: /Buskerud/i, 34: /Innlandet/i,
    39: /Vestfold og Telemark/i, 40: /Vestfold og Telemark/i, 42: /Agder/i,
    50: /Trøndelag/i, 55: /Troms og Finnmark/i, 56: /Troms og Finnmark/i,
  },
  sanitetskvinnene: { 11: /ROGALAND FYLKE/i },
};

function registrationOf(c: Chapter): Registration {
  if (!c.organizationNumber) {
    // Every chapter without a number in this dataset was found by crawling and confirmed
    // absent from the register (all 849 are SOURCE_ONLY). Anything else is genuinely
    // unknown rather than unregistered.
    return c.provenance?.reconciliation === 'SOURCE_ONLY' ? 'UNREGISTERED' : 'UNKNOWN';
  }
  return c.provenance?.matchMethod?.includes('overordnetEnhet') ? 'SUB_UNIT' : 'LEGAL_ENTITY';
}

const toBase = (c: Chapter): ChapterBase => ({
  id: c.id, name: c.name, chapterType: c.chapterType, level: c.level,
});

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dirs = slugs.length ? slugs : require('fs').readdirSync(DATA_DIR)
    .filter((d: string) => !d.startsWith('_'));

  let totalRelinked = 0;
  for (const slug of dirs) {
    const file = path.join(DATA_DIR, slug, 'chapters.json');
    const col = readCollection<Chapter>(file);
    if (!col) continue;
    const items = col.items;

    // Index the tiers this organisation actually has.
    const byId = new Map(items.map((c) => [c.id, c]));
    const national = items.find((c) => c.level === 'NATIONAL');
    const regional = items.filter((c) => c.level === 'REGIONAL');
    const regionalByKey = new Map<string, Chapter>();
    for (const r of regional) {
      regionalByKey.set(key(r.name), r);
      // Registry names repeat the organisation: 'NASJONALFORENINGEN AKERSHUS FYLKESLAG'.
      // Index the distinguishing words too, since a URL segment holds only those.
      const stripped = key(r.name.replace(new RegExp(slug.replace(/-/g, '.?'), 'gi'), ''));
      if (stripped) regionalByKey.set(stripped, r);
    }

    const urlPattern = PARENT_FROM_URL[slug];
    const sitemap = SITEMAP_EDGES[slug] ? await SITEMAP_EDGES[slug]() : undefined;
    const countyRule = PARENT_FROM_COUNTY[slug];
    let relinked = 0;
    let synthesised = 0;

    /**
     * Resolve a URL segment to the regional body it names.
     *
     * ⚠️ Prefer a row already classified REGIONAL, then one whose NAME carries a tier word.
     * Nasjonalforeningen has both 'FINNMARK' (a local helselag) and 'NASJONALFORENINGEN FOR
     * FOLKEHELSEN, FYLKESLAG I FINNMARK'; a first-match-wins substring test picks the
     * helselag and makes a lokallag the child of another lokallag.
     */
    const TIER = /\b(FYLKESLAG|FYLKESSTYRET|FYLKESFORENING|FYLKE|DISTRIKT|KRETS|REGION)\b/i;
    const resolve = (seg: string): Chapter | undefined => {
      const k = key(decodeURIComponent(seg));
      const bare = k.replace(key(slug), '');
      const cands = items.filter((r) => {
        if (r.level === 'LOCAL' && !TIER.test(r.name)) {
          // Only consider a LOCAL row if its name says it is a tier body.
          return false;
        }
        const rk = key(r.name);
        const rb = rk.replace(key(slug), '');
        return rk === k || rb === bare || (bare.length > 3 && (rb.endsWith(bare) || rb.includes(bare)));
      });
      if (!cands.length) return undefined;
      cands.sort((a, b) => {
        const s1 = (c: Chapter) => (c.level === 'REGIONAL' ? 2 : 0) + (TIER.test(c.name) ? 1 : 0);
        return s1(b) - s1(a);
      });
      return cands[0];
    };

    /**
     * Where the organisation's site states a tier the register does not hold, the tier is
     * still real - LHL publishes 16 fylkeslag and Enhetsregisteret has rows for 5. Create
     * it, marked UNREGISTERED and DERIVED, rather than pretending 11 counties' worth of
     * chapters hang directly off the national office.
     */
    const synthesise = (seg: string, childUrl: string): Chapter => {
      // Reuse a tier row that already exists under this id - after reconciliation it may carry
      // the site's own name ("Røde Kors i Trøndelag"), which the name-based resolve no longer finds.
      const existing = items.find((i) => i.id === `${slug}:tier-${seg.toLowerCase()}`);
      if (existing) return existing;
      const pretty = decodeURIComponent(seg).replace(/-/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      const c: Chapter = {
        id: `${slug}:tier-${seg.toLowerCase()}`,
        name: pretty,
        organization: items[0]?.organization,
        // Only call it a fylkeslag if the segment names a county. LHL groups some chapters
        // under '/lokallag/interessegrupper/' and '/lokallag/lhl-hjerneslag-ung/', which are
        // a diagnosis-based grouping and a youth body - typing those 'Fylkeslag' asserts a
        // geography they do not have. Omitted where unknown, as everywhere else.
        chapterType: COUNTY.test(seg) ? 'Fylkeslag' : undefined,
        level: 'REGIONAL',
        registration: 'UNREGISTERED',
        parent: national ? toBase(national) : undefined,
        provenance: {
          // The tier's own page: the child's URL truncated at the tier segment. Valid as a
          // URI and genuinely the page the organisation publishes for that tier.
          sourceUrl: childUrl.includes(`/${seg}/`)
            ? `${childUrl.slice(0, childUrl.indexOf(`/${seg}/`) + seg.length + 2)}`
            : childUrl,
          confidence: 'MEDIUM',
          reconciliation: 'SOURCE_ONLY',
          idOrigin: 'DERIVED',
          parentOrigin: 'INFERRED',
          municipalityMethod: 'NONE',
          matchMethod: 'urlHierarchy',
          containsPersonalData: false,
        },
      };
      items.push(c);
      synthesised += 1;
      return c;
    };
    const counts: Record<string, number> = {};
    const tierCache = new Map<string, Chapter>();
    /**
     * PAGE_LINK: the chapter's own page links to its parent ("Vi er en del av <krets>" on
     * blispeider.no). The crawler writes `parents.page.json` (chapter page -> parent page); the
     * parent is whichever row carries that page as its website - after reconciliation that may be
     * the registry's row for the krets, under its organisation-number id.
     */
    const pageLinks: Record<string, string> = (() => {
      const f = path.join(DATA_DIR, slug, 'parents.page.json');
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    })();
    const normUrl = (u?: string) => (u ?? '').replace(/\/?$/, '');
    const byWebsite = new Map(items.filter((i) => i.website).map((i) => [normUrl(i.website), i]));

    for (const c of items) {
      c.registration = registrationOf(c);
      counts[c.registration] = (counts[c.registration] ?? 0) + 1;

      if (c.level === 'NATIONAL') { delete c.parent; continue; }

      let parent: Chapter | undefined;
      let method: ParentMethod | undefined;
      const linked = c.level === 'LOCAL' ? pageLinks[normUrl(c.website)] : undefined;
      if (linked && byWebsite.get(normUrl(linked))) {
        parent = byWebsite.get(normUrl(linked));
        method = 'PAGE_LINK';
      }
      if (!parent && c.level === 'LOCAL' && urlPattern) {
        const seg = urlPattern.exec(c.provenance?.sourceUrl ?? '')?.[1];
        if (seg) {
          parent = resolve(seg) ?? tierCache.get(seg);
          if (!parent) {
            parent = synthesise(seg, c.provenance?.sourceUrl ?? '');
            tierCache.set(seg, parent);
          }
          method = 'URL_PATH';
        }
      }
      if (!parent && c.level === 'LOCAL' && sitemap) {
        const seg = sitemap.districtOf(c);
        if (seg) {
          parent = sitemap.resolve(seg, items) ?? tierCache.get(seg);
          if (!parent) {
            parent = synthesise(seg, `${sitemap.base}/${seg}/`);
            // Røde Kors calls the tier a distrikt, not a fylkeslag. The name must match what
            // `resolve` looks for, or the next run creates the same tier a second time.
            parent.chapterType = 'Distrikt';
            parent.name = `${parent.name.replace(/Trondelag/i, 'Trøndelag')} Røde Kors`;
            parent.provenance!.matchMethod = 'sitemapHierarchy';
            tierCache.set(seg, parent);
          }
          method = 'SITEMAP_PATH';
        }
      }
      if (!parent && c.level === 'LOCAL' && countyRule && c.municipalityNumber) {
        const pattern = countyRule[c.municipalityNumber.slice(0, 2)];
        parent = pattern ? regional.find((r) => pattern.test(r.name)) : undefined;
        if (parent) method = 'MUNICIPALITY_COUNTY';
      }
      if (parent && method) {
        relinked += 1;
        // The website or sitemap STATES the edge; a county match only infers it.
        c.provenance = {
          ...c.provenance!,
          parentOrigin: method === 'MUNICIPALITY_COUNTY' ? 'INFERRED' : 'SOURCE',
          parentMethod: method,
        };
      } else if (c.provenance) {
        delete c.provenance.parentMethod;
      }
      // Fall back to the national body, which for a two-tier organisation is correct.
      parent = parent ?? national;
      if (parent && parent.id !== c.id) c.parent = toBase(parent);
      else delete c.parent;
    }

    /**
     * A row that many LOCAL chapters name as their parent IS a tier body, whatever the
     * name pattern decided. 45 lokallag point at 'NASJONALFORENINGEN FOR FOLKEHELSEN
     * FYLKESSTYRET I HORDALAND', which `REGION_WORD` missed because it lists FYLKESLAG and
     * not FYLKESSTYRET. Promote on the evidence rather than extending the word list
     * forever - the children are the evidence.
     */
    let promoted = 0;
    const parentIds = new Set(items.filter((c) => c.level === 'LOCAL')
      .map((c) => c.parent?.id).filter(Boolean) as string[]);
    for (const c of items) {
      if (c.level === 'LOCAL' && parentIds.has(c.id)) {
        c.level = 'REGIONAL';
        promoted += 1;
      }
    }
    // Re-emit the parent blocks, so a promoted row's level is right where it is embedded.
    if (promoted) {
      const fresh = new Map(items.map((c) => [c.id, c]));
      for (const c of items) {
        const up = c.parent && fresh.get(c.parent.id);
        if (up) c.parent = toBase(up);
      }
    }
    if (promoted) Logger.info(`    promoted ${promoted} row(s) to REGIONAL: named as parent by LOCAL chapters`);

    totalRelinked += relinked;
    const pct = regional.length ? `${((relinked / Math.max(1, items.filter((c) => c.level === 'LOCAL').length)) * 100).toFixed(0)}%` : '-';
    Logger.info(`  ${slug.padEnd(20)} regional tier ${String(regional.length).padStart(3)}`
      + `   local linked to it ${String(relinked).padStart(4)} (${pct.padStart(4)})`
      + (synthesised ? `  +${synthesised} tier rows created` : '')
      + `   ${JSON.stringify(counts)}`);

    if (!dry) writeCollection(file, { ...col, items } as Collection<Chapter>);
  }
  Logger.info(`\n  ${totalRelinked} chapters now point at their immediate parent`
    + `${dry ? '  (--dry-run: nothing written)' : ''}`);
}

main().catch((e) => {
  Logger.error(String(e));
  process.exit(1);
});
