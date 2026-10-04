/**
 * file: ingest/src/sources/site-chapters.ts
 * description: One sitemap-crawl driver, five organisations' worth of selectors.
 * output: data/<org>/chapters.crawl.json
 *
 * The first three crawlers in this folder are one file each, because each organisation's
 * site was a different shape and the differences were the interesting part. By the fourth
 * the shape had stabilised — enumerate from a sitemap, fetch, parse a contact block,
 * reconcile — and five more copies of that would be five places to fix the next bug in.
 * What actually differs per organisation is the URL filter and the selectors, so that is
 * all a SITE entry holds.
 *
 * ⚠️ TRAP, found in Norsk Folkehjelp's markup and almost certainly not unique to it:
 * every chapter page carries a schema.org `LocalBusiness` block, and it describes the
 * NATIONAL organisation — Stortorvet 10, Oslo. It is page furniture, not chapter data.
 * Reading structured data because it is structured would have stamped the head office's
 * address onto all 113 chapters, consistently and invisibly. None of these parsers use
 * ld+json; they read the visible contact block, which is the part that is actually about
 * the chapter.
 *
 *   npm run site -- folkehjelp --limit 10   # smoke test
 *   npm run site -- folkehjelp              # full crawl
 */

import * as path from 'path';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { decodeEntities, slugify, stripHtml } from '../lib/text';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, writeCollection } from '../lib/io';
import type { Chapter, ChapterLevel, Collection, Contact } from '../lib/types';

const EXTRACTOR_VERSION = '0.1.0';

interface Parsed {
  name?: string;
  isActive?: boolean;
  county?: string;
  email?: string;
  phone?: string;
  address?: Chapter['address'];
  contacts?: Contact[];
  level?: ChapterLevel;
  chapterType?: string;
  memberCount?: number;
  facebookUrl?: string;
  sourceUpdatedAt?: string;
}

interface Site {
  slug: string;
  org: { id: string; name: string };
  base: string;
  /** Sitemap(s) to enumerate, and the filter that picks chapter URLs out of them. */
  sitemaps: string[];
  isChapterUrl: (url: string) => boolean;
  /** Overrides `sitemaps` where the chapter list is not a sitemap at all. */
  urls?: () => Promise<string[]>;
  parse: (html: string, url: string) => Parsed;
  chapterType: string;
  /**
   * ⚠️ The national Facebook page, linked from the footer of EVERY chapter page. Without
   * this, 6 of 8 sampled Folkehjelp chapters and all 8 Diabetesforbundet chapters got
   * facebook.com/<theOrganisation> recorded as their own page — a value that is present,
   * plausible, and wrong for every chapter that has no page of its own.
   */
  nationalFacebook?: RegExp;
  /** The head-office switchboard, printed in the page header. Same trap as above. */
  nationalPhone?: RegExp;
}

/* ------------------------------------------------------------------ helpers */

/** Common section pages that sit at the same URL depth as a chapter. */
const SECTION_PAGE = /\/(kalender|aktiviteter|kontakt|om-oss|nyheter|arrangementer|styret|bli-medlem|artikler|sider)\/?$/i;

const text = (s?: string) => (s ? decodeEntities(stripHtml(s)).trim() : undefined);

/**
 * An id from the URL's DISTINGUISHING path, not just its last segment.
 *
 * ⚠️ Two different 4H klubber are both called 'Start 4H' - one in Møre og Romsdal, one in
 * Oppland - and `/more-og-romsdal/klubber/start-4h` and `/oppland/klubber/start-4h` both
 * end in `start-4h`. Keying on the last segment merged two real organisations under one id,
 * which every schema check passed: a duplicate id is valid JSON and a valid Chapter.
 *
 * Structural segments carry no identity and are dropped, so the id stays readable.
 */
const STRUCTURAL = /^(klubber|lokallag|lokalavdeling|fylkes-og-lokallag|tilbud|no|nb)$/i;

function idFromUrl(url: string, fallback: string): string {
  const parts = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')
    .split('/').filter(Boolean).filter((seg) => !STRUCTURAL.test(seg));
  return slugify(parts.join('-') || fallback);
}

/** Lines of a block, preserving the breaks that <br> and <p> imply. */
function lines(fragment: string): string[] {
  return decodeEntities(
    fragment.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|address)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
}

/** '1672 KRÅKERØY' at the end of a line. */
function splitPostal(line: string): { line1?: string; postalCode?: string; postalPlace?: string } {
  const m = /(\d{4})\s+([^\d,]{2,})$/.exec(line);
  if (!m) return { line1: line };
  return {
    line1: line.slice(0, m.index).replace(/[,\s]+$/, '').trim() || undefined,
    postalCode: m[1],
    postalPlace: m[2].trim(),
  };
}

const firstPhone = (html: string) => {
  const raw = /href="tel:([^"]+)"/.exec(html)?.[1];
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, '').replace(/^47(?=\d{8}$)/, '');
  return d ? `+47 ${d}` : undefined;
};

/** Reject the organisation's own national address, which every page repeats. */
const notNational = (v: string | undefined, national: RegExp) =>
  (v && !national.test(v) ? v : undefined);

function facebook(html: string, national?: RegExp): string | undefined {
  for (const m of html.matchAll(/href="(https:\/\/(?:www\.)?facebook\.com\/[^"?]+)"/g)) {
    if (national && national.test(m[1])) continue;
    const u = normaliseUrl(m[1]).url;
    if (u) return u;
  }
  return undefined;
}

/* -------------------------------------------------------------------- sites */

const SITES: Site[] = [
  {
    slug: 'folkehjelp',
    org: { id: 'folkehjelp', name: 'Norsk Folkehjelp' },
    base: 'https://folkehjelp.no',
    sitemaps: ['https://folkehjelp.no/sitemaps-1-section-localBranch-1-sitemap.xml'],
    isChapterUrl: (u) => /\/lokallag\/[^/]+$/.test(u),
    chapterType: 'Lokallag',
    nationalFacebook: /facebook\.com\/folkehjelp\/?$/i,
    parse(html, url) {
      const name = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]);
      // The aside holds titled boxes: 'Kontakt oss', 'Adresse'. Read them by title rather
      // than by position — chapters vary in which boxes they publish.
      const box = (title: string) => {
        const re = new RegExp(
          `<h4[^>]*c-info-box__title[^>]*>\\s*${title}\\s*</h4>\\s*`
          + '<div[^>]*c-info-box__content[^>]*>([\\s\\S]*?)</div>', 'i');
        return re.exec(html)?.[1];
      };
      const contactBox = box('Kontakt oss') ?? '';
      const addressBox = box('Adresse') ?? '';
      const addrLines = lines(addressBox).filter((l) => !/^Adresse$/i.test(l));
      // The organisation's name repeats as the first address line; drop it.
      const body = addrLines.filter((l) => l !== name);
      const postal = body.length ? splitPostal(body[body.length - 1]) : {};
      const line1 = [...body.slice(0, -1), postal.line1].filter(Boolean).join(', ');
      return {
        name,
        email: notNational(/href="mailto:([^"?]+)"/.exec(contactBox)?.[1],
          /npaid\.org|post@folkehjelp\.no/i),
        phone: firstPhone(contactBox),
        address: line1 || postal.postalCode
          ? { line1: line1 || undefined, postalCode: postal.postalCode, postalPlace: postal.postalPlace }
          : undefined,
        facebookUrl: facebook(html, /facebook\.com\/folkehjelp\/?$/i),
      };
    },
  },
  {
    slug: 'lhl',
    org: { id: 'lhl', name: 'Landsforeningen for hjerte- og lungesyke' },
    base: 'https://www.lhl.no',
    sitemaps: ['https://www.lhl.no/sitemaps/lhl/no/content.xml'],
    // /lokallag/<fylkeslag>/<lag>/ — depth three. Depth two is the fylkeslag itself.
    // ⚠️ The depth-three pattern also matches a fylkeslag's own sub-pages -
    // /lokallag/lhl-telemark/kalender/ arrived as a chapter named 'Aktiviteter'.
    isChapterUrl: (u) => /\/lokallag\/[^/]+\/[^/]+\/?$/.test(u) && !SECTION_PAGE.test(u),
    chapterType: 'Lokallag',
    nationalFacebook: /facebook\.com\/LHLorg\/?$/i,
    // 22 79 90 xx is the organisation's own exchange at head office.
    nationalPhone: /^\+47 2279/,
    parse(html, url) {
      const name = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]);
      // The board is a table of name / positions / phone, one row per person.
      const contacts: Contact[] = [];
      for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const person = text(/local-union-committee__name[^>]*>([\s\S]*?)<\//.exec(row[1])?.[1]);
        if (!person) continue;
        const role = text(/local-union-committee__position[^>]*>([\s\S]*?)<\//.exec(row[1])?.[1]);
        const parts = person.split(/\s+/);
        contacts.push({
          role: role ?? 'Styremedlem',
          givenName: parts[0],
          familyName: parts.slice(1).join(' ') || undefined,
          phone: firstPhone(row[1]),
          email: /href="mailto:([^"?]+)"/.exec(row[1])?.[1],
          isMasked: false,
          sourceUrl: url,
        });
      }
      return {
        name,
        // 22 79 90 xx is the organisation's exchange, printed in the header of every page.
        phone: notNational(firstPhone(html), /^\+47 2279/),
        contacts: contacts.length ? contacts : undefined,
        facebookUrl: facebook(html, /facebook\.com\/LHLorg\/?$/i),
      };
    },
  },
  {
    slug: 'diabetesforbundet',
    org: { id: 'diabetesforbundet', name: 'Diabetesforbundet' },
    base: 'https://www.diabetes.no',
    sitemaps: ['https://www.diabetes.no/sitemaps/diabetesforbundet/no/content.xml'],
    isChapterUrl: (u) => /\/fylkes-og-lokallag\/[^/]+\/[^/]+\/?$/.test(u)
      // Seven county sections publish an 'artikler' index at chapter depth.
      && !SECTION_PAGE.test(u),
    chapterType: 'Lokallag',
    nationalFacebook: /facebook\.com\/diabetesforbundet\/?$/i,
    nationalPhone: /^\+47 23051800/,
    parse(html, url) {
      // The h1 on these pages is 'Styret i <place>' — the board, not the chapter. The
      // chapter's own name is the last breadcrumb / the URL's final segment.
      const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]) ?? '';
      const fromUrl = decodeURIComponent(url.replace(/\/$/, '').split('/').pop() ?? '')
        .replace(/-/g, ' ').replace(/\d+$/, '').trim();
      const name = /^styret i\s+/i.test(h1)
        ? h1.replace(/^styret i\s+/i, '').trim()
        : (h1 || fromUrl);

      const contacts: Contact[] = [];
      for (const li of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        const person = text(/person-list__name[^>]*>([\s\S]*?)<\/p>/.exec(li[1])?.[1]);
        if (!person) continue;
        const role = text(/person-list__profession[^>]*>([\s\S]*?)<\/p>/.exec(li[1])?.[1]);
        const parts = person.split(/\s+/);
        contacts.push({
          role: role ? role.charAt(0) + role.slice(1).toLowerCase() : 'Styremedlem',
          givenName: parts[0],
          familyName: parts.slice(1).join(' ') || undefined,
          phone: firstPhone(li[1]),
          email: /href="mailto:([^"?]+)"/.exec(li[1])?.[1],
          isMasked: false,
          sourceUrl: url,
        });
      }
      // The organisation writes a chapter's status into its NAME — 'Flekkefjord og omegn
      // NEDLAGT', 'Iveland, Evje og Hornnes HVILENDE'. That is real lifecycle data and the
      // only place it appears; keep it as isActive rather than letting it sit in the name,
      // where it would also defeat matching against the registry.
      const status = /\s+(NEDLAGT|HVILENDE|OPPL\u00d8ST|SOVENDE)\s*$/i.exec(name ?? '');
      const clean = status ? name.slice(0, status.index).trim() : name;
      return {
        name: clean || undefined,
        isActive: status ? false : undefined,
        chapterType: status ? `Lokallag (${status[1].toLowerCase()})` : undefined,
        phone: notNational(firstPhone(html), /^\+47 23051800/),
        contacts: contacts.length ? contacts : undefined,
        facebookUrl: facebook(html, /facebook\.com\/diabetesforbundet\/?$/i),
      };
    },
  },
  {
    slug: 'fire-h',
    org: { id: 'fire-h', name: '4H Norge' },
    base: 'https://4h.no',
    sitemaps: ['https://4h.no/sitemap.xml'],
    isChapterUrl: (u) => /^https:\/\/4h\.no\/[a-z0-9-]+\/klubber\/[a-z0-9-]+\/?$/.test(u),
    chapterType: 'Klubb',
    /**
     * ⚠️ These pages are ALMOST EMPTY — 355 characters of visible text, and the only
     * address, e-mail and telephone on them belong to the national office footer. So this
     * crawl enriches nothing. It is worth running anyway as a VERIFICATION source: the
     * 495 registry rows for this organisation were matched by name pattern at LOW/MEDIUM
     * confidence, and a klubb appearing in the organisation's own directory is independent
     * evidence that the registry row is really theirs.
     */
    parse(html, url) {
      const name = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]);
      const county = url.split('/')[3]?.replace(/-/g, ' ');
      const modified = /og:article:modified_time" content="([^"]+)"/.exec(html)?.[1];
      return {
        name,
        county,
        // A real upstream timestamp, so freshness is the organisation's clock not ours.
        sourceUpdatedAt: modified ? `${modified.slice(0, 19)}Z` : undefined,
      };
    },
  },
  {
    slug: 'mental-helse',
    org: { id: 'mental-helse', name: 'Mental Helse' },
    base: 'https://mentalhelse.no',
    sitemaps: [],
    isChapterUrl: () => true,
    chapterType: 'Lokallag',
    /**
     * Every chapter is its own WordPress site, and the list of them is not in any sitemap:
     * it is the 99 `Sitemap:` lines in robots.txt, one per subsite.
     */
    async urls() {
      const robots = await getText('https://mentalhelse.no/robots.txt', { timeoutMs: 60_000 });
      const subs = new Set<string>();
      for (const m of robots.matchAll(/Sitemap:\s*https:\/\/mentalhelse\.no\/([^/\s]+)\/sitemap/gi)) {
        subs.add(m[1]);
      }
      return [...subs].map((s2) => `https://mentalhelse.no/${s2}/`);
    },
    parse(html, url) {
      const name = text(/property="og:title" content="([^"]*)"/.exec(html)?.[1]);
      const description = text(/name="description" content="([^"]*)"/.exec(html)?.[1]) ?? '';
      // The organisation states the tier in its own summary: 'Vi er Mental Helses
      // fylkeslag i Viken' against 'Vi er Mental Helses lokallag i Birkenes'. Nothing else
      // on the page distinguishes the 12 county bodies from the 87 local ones.
      const isCounty = /\bfylkeslag\b/i.test(description);
      // 'Vi har over 1800 medlemmer' — published by some chapters and by no registry.
      const members = /(?:over\s+)?([\d\u00a0 .]{3,7})\s*medlemmer/i.exec(description)?.[1];
      const memberCount = members ? Number(members.replace(/[^\d]/g, '')) : undefined;

      const slug2 = url.replace(/\/$/, '').split('/').pop() ?? '';
      // The chapter's own address is <slug>@mentalhelse.no or <slug>@lokallag.mentalhelse.no;
      // medlem@mentalhelse.no is the national membership desk, on every page.
      let email: string | undefined;
      const people: Contact[] = [];
      for (const m of html.matchAll(/mailto:([^"?&]+)/g)) {
        const addr = m[1].toLowerCase().trim();
        if (!addr.endsWith('mentalhelse.no') || addr.startsWith('medlem@')) continue;
        if (addr.startsWith(`${slug2}@`)) { email ??= addr; continue; }
        // firstname.lastname@ is an individual, not the chapter.
        const local = addr.split('@')[0];
        if (/^[a-zæøå]+\.[a-zæøå-]+$/.test(local)) {
          const [g, f] = local.split('.');
          const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
          if (!people.some((c) => c.email === addr)) {
            people.push({
              role: 'Kontakt',
              givenName: cap(g),
              familyName: cap(f.replace(/-/g, ' ')),
              email: addr,
              isMasked: false,
              sourceUrl: url,
            });
          }
        }
      }
      return {
        name: name ? `Mental Helse ${name}` : undefined,
        level: isCounty ? 'REGIONAL' : 'LOCAL',
        chapterType: isCounty ? 'Fylkeslag' : 'Lokallag',
        memberCount,
        email,
        contacts: people.length ? people : undefined,
        facebookUrl: facebook(html, /facebook\.com\/mentalhelse\/?$/i),
      };
    },
  },
];

/* --------------------------------------------------------------------- main */

async function sitemapUrls(site: Site): Promise<string[]> {
  if (site.urls) return (await site.urls()).sort();
  const out = new Set<string>();
  for (const sm of site.sitemaps) {
    const xml = await getText(sm, { timeoutMs: 60_000 });
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = m[1].trim();
      if (site.isChapterUrl(u)) out.add(u);
    }
  }
  return [...out].sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--') && Number.isNaN(Number(a)));
  const limit = Number(args[args.indexOf('--limit') + 1]) || 0;
  // Floor only: lib/http.ts enforces each site's robots.txt Crawl-delay on top (4h.no: 5 s).
  const delay = Number(args[args.indexOf('--delay') + 1]) || 900;
  const partial = limit > 0;

  const site = SITES.find((s) => s.slug === slug);
  if (!site) {
    Logger.error(`usage: npm run site -- <${SITES.map((s) => s.slug).join('|')}> [--limit N]`);
    process.exit(1);
  }

  const all = await sitemapUrls(site);
  const urls = partial ? all.slice(0, limit) : all;
  Logger.info(`${site.slug}: ${all.length} chapter URLs${partial ? `, taking ${urls.length}` : ''}`);

  const items: Chapter[] = [];
  let failed = 0;
  let noName = 0;

  await paced(urls, delay, async (url: string) => {
    let html: string;
    try {
      html = await getText(url, { timeoutMs: 60_000, attempts: 3 });
    } catch (e) {
      Logger.warn(`  skip ${url}: ${e}`);
      failed += 1;
      return;
    }
    const p = site.parse(html, url);
    if (!p.name) { noName += 1; return; }

    // Only the page's own modified time is an assertion date. With none, assertedAt stays
    // absent - stamping the fetch date turned known unknowns into confident claims.
    const asserted = p.sourceUpdatedAt?.slice(0, 10);
    items.push({
      id: `${site.org.id}:${idFromUrl(url, p.name)}`,
      name: p.name,
      organization: site.org,
      chapterType: p.chapterType ?? site.chapterType,
      level: p.level ?? 'LOCAL',
      memberCount: p.memberCount,
      isActive: p.isActive,
      county: p.county,
      address: p.address,
      addressKind: p.address ? 'POSTAL' : undefined,
      email: p.email,
      phone: p.phone,
      website: normaliseUrl(url).url,
      facebookUrl: p.facebookUrl,
      contacts: p.contacts,
      provenance: {
        sourceUrl: url,
        confidence: 'MEDIUM',
        reconciliation: 'UNRECONCILED',
        idOrigin: 'DERIVED',
        parentOrigin: 'SOURCE',
        municipalityMethod: 'NONE',
        matchMethod: 'sourceAuthoritative',
        // An address line like "c/o <a volunteer's name>" is a private individual's, even
        // though no contact block was parsed.
        containsPersonalData: Boolean(p.contacts?.length)
          || /\bc\/o\b/i.test(p.address?.line1 ?? ''),
      },
      freshness: {
        fetchedAt: nowIso(),
        sourceUpdatedAt: p.sourceUpdatedAt,
        blocks: {
          identity: { volatility: 'STRUCTURAL', source: site.base, assertedAt: asserted },
          contacts: { volatility: 'ANNUAL', source: site.base, assertedAt: asserted },
        },
      },
    });
  });

  items.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const collection: Collection<Chapter> = {
    items,
    extract: {
      sourceId: `${site.slug}-chapters`,
      method: 'SITEMAP_CRAWL',
      baseUrl: site.base,
      indexUrl: site.sitemaps[0],
      fetchedAt: nowIso(),
      extractorVersion: EXTRACTOR_VERSION,
      pagesAttempted: urls.length,
      pagesParsed: items.length,
      isRobotsAllowed: true,
      license: 'none-stated',
    },
  };

  const out = path.join(DATA_DIR, site.org.id,
    partial ? 'chapters.partial.json' : 'chapters.crawl.json');
  writeCollection(out, collection);

  const has = (f: keyof Chapter) => items.filter((c) => c[f] !== undefined).length;
  const people = items.reduce((n, c) => n + (c.contacts?.length ?? 0), 0);
  Logger.info(`\n  ${items.length}/${urls.length} parsed -> ${path.relative(DATA_DIR, out)}`
    + `${partial ? '  (PARTIAL)' : ''}`);
  Logger.info(`    address ${has('address')}   email ${has('email')}   phone ${has('phone')}`
    + `   facebook ${has('facebookUrl')}`);
  Logger.info(`    contacts ${has('contacts')} chapters, ${people} named people`);
  if (failed) Logger.warn(`${failed} page(s) could not be fetched`);
  if (noName) {
    Logger.error(`${noName} page(s) parsed but yielded NO NAME — the h1 selector is `
      + 'probably wrong for this site; those rows were dropped rather than written blank');
  }
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
