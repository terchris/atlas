/**
 * file: ingest/src/sources/chapter-activities.ts
 * description: R3 - the activities a chapter publishes, read from the chapter pages the research
 *              already holds (chapters.json `website`), added to chapters.json without re-reconciling.
 * output: rewrites `activities` on data/<org>/chapters.json; then `npm run catalogue -- <org> --force`
 *
 * Two patterns, measured 2026-10-04:
 *
 *   folkehjelp  a chapter page has <h3>Aktivitetsområder</h3> followed by <h4>area</h4><p>text</p>
 *               pairs. The text is the organisation's national text, the same on every chapter;
 *               a chapter with no areas has the heading and nothing under it (Alta).
 *   lhl         every activity has its own page one level below the chapter in the sitemap
 *               (/lokallag/<county>/<chapter>/<activity>/). The chapter page's calendar shows only
 *               the coming months (LHL Kongsberg: 2 of its 4 activities), so the SITEMAP is the list;
 *               each page's h1 is the name and its text the chapter's own description. One-off events
 *               (julebord, medlemsmøte, årsmøte …) are filtered by name.
 *
 * A chapter whose page lists nothing PUBLISHES nothing - never "runs nothing" (chapter.yaml).
 *
 *   npm run chapter-activities -- folkehjelp
 *   npm run chapter-activities -- lhl
 */

import * as path from 'path';
import * as cheerio from 'cheerio';
import { getText, paced } from '../lib/http';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection, writeCollection, omitEmpty } from '../lib/io';
import { blocks, joinBlocks, section } from '../lib/description';
import { slugify } from '../lib/text';
import type { Activity, Chapter } from '../lib/types';

type Parse = (html: string, url: string) => Activity[];

const folkehjelp: Parse = (html, url) => {
  const $ = cheerio.load(html);
  const bs = blocks($, $('main').first());
  const areas = section(bs, 'Aktivitetsområder') ?? [];
  const out: Activity[] = [];
  for (let i = 0; i < areas.length; i += 1) {
    if (areas[i].tag !== 'h4') continue;
    const text: string[] = [];
    for (let j = i + 1; j < areas.length && areas[j].tag !== 'h4'; j += 1) text.push(areas[j].text);
    out.push({ name: areas[i].text, definition: { id: `folkehjelp:${slugify(areas[i].text)}`, name: areas[i].text },
      description: text.join('\n\n') || undefined, sourceUrl: url });
  }
  return out;
};

export const PARSERS: Record<string, Parse> = { folkehjelp };

/**
 * Diabetesforbundet: a chapter page lists its board, not its activities. What a chapter RUNS shows in
 * its events: 1 301 event pages under /fylkes-og-lokallag/<county>/<chapter>/arrangement/<slug>/
 * (sitemap, 2026-10-04). The slug names the event; a rule names the activity type it belongs to.
 * Meetings about the chapter itself (årsmøte, styremøte, medlemsmøte, julebord …) are not
 * activities. Nothing is fetched beyond the sitemap: the evidence is that the chapter has an event
 * page of that type, which the activity's `sourceUrl` points to.
 */
const DIA_SITEMAP = 'https://www.diabetes.no/sitemaps/diabetesforbundet/no/content.xml';
const DIA_TYPES: [RegExp, string][] = [
  [/arsmote|styremote|medlemsmote|julebord|julemote|julelunsj|^lunsj|sommeravslutning|sommermote|innkalling|^test|kontortid|kontordag|kontoret|stand-pa|valg|basar|lotteri|juleverksted|julefest|ringe-runde|ringeriksdagen|^as$|^diabetesforbundet-|besok-oss/, ''],
  [/diakafe|diacafe|diaprat|diadros|diamote|kaffeprat|kaffekos|trivselskveld|medlemskveld|diabeteskveld|onsdagsmote|treff(?!-for-barn)|sosial|cafe|kafe|pub|middag|bingo|apen-dag|smalahove|midtlokken/, 'Diakafé og treff'],
  [/barn|unge|familie|pizza-og-lek|diadilt|ungdom|lekeland|trampoline|rush|fangene|klatre|bilbane|rbk/, 'Treff for barn, unge og familier'],
  [/ga-?grupp|ga-tur|gatur|10-pa-topp|topp|tur(?!kost)|vandring|stavgang/, 'Gågruppe og turer'],
  [/bowling|boccia|trening|trim|basseng|varmtvann|yoga|dans|svomm|aktivitet|golf|padel|minigolf|via-ferrata|jump/, 'Trening og fysisk aktivitet'],
  [/strikk|handarbeid|hobby/, 'Strikkekafé'],
  [/temamote|tema|foredrag|webinar|informasjonsmote|kurs|matlaging|kosthold|matvett|diabetesfaglig|verdens-diabetesdag|verdas-diabetesdag|helse|psykolog|medikament|insulin|blodsukker|type-[12]|sykepleier|fot|fagdag|mestring|info-om|ny-med|sovn|slitenhet|bilkjoring|forerkort|karbohydrat|overlege|synet/, 'Temamøter og kurs'],
  [/likeperson|samtalegruppe|motivasjonsgrupp/, 'Likepersoner og motivasjonsgrupper'],
  [/busstur|sverigetur|tur-til|reise|ferie/, 'Turer og reiser'],
];
/**
 * Mental Helse: each chapter is a WordPress site (mentalhelse.no/<chapter>/) with an `event` post type
 * in its REST API - every event the chapter has published, past ones too (Ålesund: 44, back to
 * 2025). One request per chapter. Titles are classified by rule like Diabetesforbundet's slugs.
 */
const MH_TYPES: [RegExp, string][] = [
  [/årsmøte|arsmote|medlemsmøte|styre|møte for frivillige|kurs for frivillige|frivilligmøte|frivillig-samling|landsmøte|samling|planlegge|valg|dugnad|webinar fra funkis/i, ''],
  [/likeperson|samtalegruppe|selvhjelp|støttegruppe|pårørende|erfaringsutveksling|bare menn|spekter gruppe|gruppe for/i, 'Likepersoner og samtalegrupper'],
  [/fakkeltog|verdensdag|overdosedag|pride|markering|stand\b|aksjon|demonstrasjon|appell|dagen\b/i, 'Markeringer for psykisk helse'],
  [/foredrag|kurs|tema|webinar|seminar|informasjon|om helse/i, 'Foredrag og kurs'],
  [/tur\b|tur |turer|turdag|fjellet|topp|gapahuk|vandring|gåtur|fisketur|sti\b|stien/i, 'Turgruppe og turer'],
  [/trening|yoga|bowling|bading|svømm|trim|aktivitetsdag|aktivpark|padel|klatr|dans/i, 'Fysisk aktivitet'],
  [/kino|teater|konsert|museum|utflukt|julebord|sommerfest|grill|fest|juleverksted|påske|fastelavn|avslutning|avsluttning|cruise|romjul/i, 'Utflukter og sosiale arrangementer'],
  [/kafé|kafe|cafe|kaffe|sosial|treff|brettspill|spill|bingo|matlaging|middag|lunsj|medlemskveld|åpent hus|apent hus|quiz|sitt med oss|klubb|damegrupp|for damer|kveld|lesehest|podcast/i, 'Sosialt treff og kafé'],
];
async function mentalHelseActivities(chapters: Chapter[], delay: number): Promise<number> {
  let n = 0; const unmatched = new Map<string, number>();
  for (const c of chapters) delete c.activities;
  await paced(chapters, delay, async (c: Chapter) => {
    const base = c.website!.replace(/\/?$/, '/');
    let events: { title: { rendered: string }; link: string }[] = [];
    try {
      for (let page = 1; page <= 10; page += 1) {
        const batch = JSON.parse(await getText(`${base}wp-json/wp/v2/event?per_page=100&page=${page}&_fields=title,link`,
          { timeoutMs: 60_000, attempts: 2, accept: 'application/json' }));
        if (!Array.isArray(batch) || !batch.length) break;
        events = events.concat(batch);
        if (batch.length < 100) break;
      }
    } catch { /* no event API on this site: publishes none */ }
    for (const e of events) {
      const title = cheerio.load(`<p>${e.title.rendered}</p>`)('p').text().trim();
      const type = MH_TYPES.find(([re]) => re.test(title));
      if (!type) { unmatched.set(title, (unmatched.get(title) ?? 0) + 1); continue; }
      if (!type[1]) continue;
      const acts = (c.activities ??= []);
      if (acts.some((a) => a.name === type[1])) continue;
      acts.push({ name: type[1], definition: { id: `mental-helse:${slugify(type[1])}`, name: type[1] }, sourceUrl: e.link });
      n += 1;
    }
  });
  Logger.info(`  event titles no rule names (${unmatched.size}): ${[...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  return n;
}

/**
 * 4H: a club page carries a name and links, nothing else (fire-h.md). What a club does is the
 * national 4H programme, which 4h.no describes per age group on one page. Three definitions, each
 * with 4H's own paragraph; only the 10-18 club programme is linked to the clubs ("Medlemmer i denne
 * aldersgruppa deltar i vanlig klubbaktivitet"). The link is a PROGRAMME activity (proposal P3): it
 * follows from the club being a 4H club, not from anything the club page states, and says so.
 */
const FIRE_H_PAGE = 'https://4h.no/blimed/medlemskap/aktivitetene-i-de-ulike-aldersgruppene';
const FIRE_H_DEFS: [string, string, RegExp][] = [
  ['fire-h:familieaktiviteter-0-9-ar', 'Familieaktiviteter (0–9 år)', /^Våre yngste medlemmer/],
  ['fire-h:4h-klubb-10-18-ar', '4H-klubb (10–18 år)', /^Aldersgruppa 10-18 år/],
  ['fire-h:4h-for-alumner-19-ar', '4H for alumner (19 år +)', /^Våre eldste medlemmer/],
];
async function fireHActivities(chapters: Chapter[]): Promise<number> {
  const $ = cheerio.load(await getText(FIRE_H_PAGE, { timeoutMs: 60_000, attempts: 3 }));
  const bs = blocks($, $('main').length ? $('main').first() : $('body'));
  const defs = FIRE_H_DEFS.map(([id, name, start]) => {
    const text = bs.find((b) => start.test(b.text))?.text;
    if (!text) throw new Error(`4h.no: no paragraph starting ${start} on ${FIRE_H_PAGE} - the page changed`);
    return { id, name, description: text };
  });
  const { nowIso } = await import('../lib/io');
  const { detectLanguage } = await import('../lib/text');
  const clubs = chapters.filter((c) => c.level === 'LOCAL');
  writeCollection(path.join(DATA_DIR, 'fire-h', 'activities.json'), {
    items: defs.map((d) => ({
      id: d.id, organization: { id: 'fire-h', name: '4H Norge' }, name: d.name,
      description: d.description, descriptionSourceUrl: FIRE_H_PAGE, descriptionLanguage: detectLanguage(d.description),
      descriptionWordCount: d.description.split(/\s+/).length, descriptionRetrievedAt: nowIso(), isService: true,
      origin: 'NATIONAL', originEvidence: 'the national 4H programme by age group (4h.no); club pages list no activities',
      chapterCount: d.id === 'fire-h:4h-klubb-10-18-ar' ? clubs.length : 0,
      serviceCategory: { assignmentMethod: 'UNMAPPED', confidence: 'LOW' },
      provenance: { sourceUrl: FIRE_H_PAGE, confidence: 'HIGH', reconciliation: 'SOURCE_ONLY', idOrigin: 'DERIVED',
        parentOrigin: 'UNSTATED', matchMethod: 'programmeActivity', containsPersonalData: false },
      freshness: { fetchedAt: nowIso() },
    })),
    extract: { sourceId: 'fire-h-programme', method: 'HTML_CRAWL', baseUrl: 'https://4h.no', indexUrl: FIRE_H_PAGE,
      fetchedAt: nowIso(), extractorVersion: '0.1.0', pagesAttempted: 1, pagesParsed: 1 },
  } as never);
  for (const c of chapters) delete c.activities;
  for (const c of clubs) {
    c.activities = [{ name: '4H-klubb (10–18 år)', definition: { id: 'fire-h:4h-klubb-10-18-ar', name: '4H-klubb (10–18 år)' }, sourceUrl: FIRE_H_PAGE }];
  }
  return clubs.length;
}

async function diabetesActivities(chapters: Chapter[]): Promise<number> {
  const xml = await getText(DIA_SITEMAP, { timeoutMs: 60_000 });
  const norm = (u: string) => u.replace(/\/?$/, '/');
  const byChapter = new Map(chapters.map((c) => [norm(c.website!), c]));
  for (const c of chapters) delete c.activities;
  let n = 0; const unmatched = new Map<string, number>();
  for (const m of xml.matchAll(/<loc>([^<]+\/arrangement\/([^/<]+)\/?)<\/loc>/g)) {
    const chapterUrl = norm(m[1]).replace(/arrangement\/[^/]+\/$/, '');
    const c = byChapter.get(chapterUrl);
    if (!c) continue;
    const slug = m[2].replace(/-?\d+$/, '');
    const type = DIA_TYPES.find(([re]) => re.test(slug));
    if (!type) { unmatched.set(slug, (unmatched.get(slug) ?? 0) + 1); continue; }
    if (!type[1]) continue;
    const acts = (c.activities ??= []);
    if (acts.some((a) => a.name === type[1])) continue;
    acts.push({ name: type[1], definition: { id: `diabetesforbundet:${slugify(type[1])}`, name: type[1] }, sourceUrl: norm(m[1]) });
    n += 1;
  }
  Logger.info(`  event slugs no rule names: ${[...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}(${v})`).join(' ')}`);
  return n;
}

const LHL_SITEMAP = 'https://www.lhl.no/sitemaps/lhl/no/content.xml';
/** One-off events and pages that are about the chapter, not an activity it runs. */
const LHL_NOT_ACTIVITY = /julebord|julemøte|julemote|lagsmøte|lagsmote|lagmøte|medlemsmøte|medlemsmote|medlemsinfo|årsmøte|arsmote|styre|vedtekter|kontakt|om-oss|nyhet|bladet|arkiv|jubileum|julemesse|juelavslutning|juleavslutning|basar|lotteri|åpent kontor|historie|minneord|hytta på|høstprogram|messe|messa|planlegging|ta vare på/i;

/**
 * LHL's activity types. A chapter names an activity with level, venue and weekday ("Trimgruppe nivå 3
 * Grünerløkka flerbrukshus mandager"); LHL's own programme has a few kinds, the trim levels 1-3
 * among them. First match wins; a name no rule matches stays a local activity.
 */
const LHL_TYPES: [RegExp, string][] = [
  [/basseng|vann|svøm|bading|terapibad|aquarama|aerobic i vann|vassgym|vasstrim/i, 'Bassengtrening og vanntrim'],
  [/nivå\s*1|niva-1|lungetrim|kols/i, 'Fysisk aktivitet nivå 1'],
  [/nivå\s*2|hjertetrim|hjerte.?trim|hjerte og lunge|hjerte-lunge/i, 'Fysisk aktivitet nivå 2'],
  [/nivå\s*3/i, 'Fysisk aktivitet nivå 3'],
  [/bowling|bowls|boccia|petanque|kulespill|golf|dekktrekking|carpet/i, 'Bowling, boccia og spill i bevegelse'],
  [/tur\b|turer|turar|gåtur|gå tur|gå[- ]?gruppe|gåtrim|rusle|stavgang|stavgruppa|kløvertur|helsesti|turgrupp|tur gruppe|turtrim|mandagstur|onsdagsturer|tirsdags tur/i, 'Turgruppe og gåturer'],
  [/dans|line dance|gla.dans/i, 'Dans'],
  [/yoga|tai chi|avspenning|balanse|pilates/i, 'Yoga, balanse og avspenning'],
  [/trim|trening|styrke|spinning|sirkel|mosjon|aktivitet|krafttak|sykkel|klatring/i, 'Trim og trening'],
  [/pratekaf|kafé|kafe|café|cafe|treff|hyggekveld|sosial|samvær|medlemskveld|lunsj|kaffe|mulighetskaf/i, 'Pratekafé og sosiale treff'],
  [/samtalegruppe|likeperson|selvhjelp/i, 'Samtalegrupper og likepersoner'],
  [/temamøte|foredrag|førstehjelp|kurs(?!.*strikk)/i, 'Temamøter og kurs'],
  [/bingo|bridge|biljard|bonko|skipbo|spill/i, 'Bingo og kortspill'],
  [/strikk|håndarbeid|handarbeid|hobby|treskj|trearbeid|knivmaking|male|kunst|serviett|håndverk/i, 'Hobby og håndarbeid'],
  [/sang|kor\b|allsang/i, 'Sanggruppe'],
  [/ferie|reise|kiel|costa|kroatia|charlottenberg|operatur|oslotur|dagstur|høsttur|sommertur|førjulstur|juletur|hyttetur|finnskogen/i, 'Ferieopphold og turer'],
];

/** LHL: the activity pages below each chapter, from the sitemap; name and text from each page. */
async function lhlActivities(chapters: Chapter[], delay: number): Promise<number> {
  const xml = await getText(LHL_SITEMAP, { timeoutMs: 60_000 });
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const norm = (u: string) => u.replace(/\/?$/, '/');
  let pages = 0;
  for (const c of chapters) delete c.activities;
  const byChapter = new Map(chapters.map((c) => [norm(c.website!), c]));
  const work: { c: Chapter; url: string }[] = [];
  for (const u of urls) {
    const parent = norm(u).replace(/[^/]+\/$/, '');
    const c = byChapter.get(parent);
    const slug = norm(u).split('/').slice(-2, -1)[0];
    // Interest groups (LHL Transplantert, Sepsis og meningitt …) publish articles below them, not activities.
    if (c && !c.website!.includes('/interessegrupper/') && !LHL_NOT_ACTIVITY.test(slug)) work.push({ c, url: norm(u) });
  }
  await paced(work, delay, async ({ c, url }: { c: Chapter; url: string }) => {
    try {
      const $ = cheerio.load(await getText(url, { timeoutMs: 60_000, attempts: 3 }));
      const main = $('main').first();
      const name = main.find('h1').first().text().replace(/\s+/g, ' ').trim();
      if (!name || LHL_NOT_ACTIVITY.test(name)) return;
      const description = joinBlocks(blocks($, main, ['.activity-calendar', 'nav', 'form', '.breadcrumb'])) || undefined;
      const type = LHL_TYPES.find(([re]) => re.test(name))?.[1];
      (c.activities ??= []).push({ name, description, sourceUrl: url,
        definition: type ? { id: `lhl:${slugify(type)}`, name: type } : { id: `lhl:local-${slugify(name)}`, name } });
      pages += 1;
    } catch (e) { Logger.warn(`  skip ${url}: ${e}`); }
  });
  return pages;
}

async function main(): Promise<void> {
  const org = process.argv[2];
  const parse = PARSERS[org];
  if (!parse && !['lhl', 'diabetesforbundet', 'mental-helse', 'fire-h'].includes(org)) { Logger.error(`usage: npm run chapter-activities -- <${Object.keys(PARSERS).join('|')}> [--pages]`); process.exit(1); }
  const file = path.join(DATA_DIR, org, 'chapters.json');
  const col = readCollection<Chapter>(file)!;
  const withPage = col.items.filter((c) => c.website && c.provenance?.reconciliation !== 'REGISTRY_ONLY');
  Logger.info(`${org}: ${withPage.length} chapter pages`);
  const delay = process.env.NGO_FROM_CACHE === '1' ? 0 : 1000;
  let failed = 0; let listing = 0; let total = 0;
  if (org === 'lhl' || org === 'diabetesforbundet' || org === 'mental-helse' || org === 'fire-h') {
    total = org === 'fire-h' ? await fireHActivities(withPage)
      : org === 'lhl' ? await lhlActivities(withPage, delay)
      : org === 'mental-helse' ? await mentalHelseActivities(withPage, delay) : await diabetesActivities(withPage);
    listing = withPage.filter((c) => c.activities?.length).length;
  } else await paced(withPage, delay, async (c: Chapter) => {
    let html: string;
    try { html = await getText(c.website!, { timeoutMs: 60_000, attempts: 3 }); } catch (e) { failed += 1; Logger.warn(`  skip ${c.website}: ${e}`); return; }
    const acts = parse!(html, c.website!);
    if (acts.length) { listing += 1; total += acts.length; c.activities = acts; } else delete c.activities;
  });
  // A definition per distinct activity name (the organisation's catalogue is derived from these).
  for (const c of withPage) for (const a of c.activities ?? []) {
    if (!a.definition) a.definition = { id: `${org}:${slugify(a.name.replace(/\s*\d+$/, ''))}`, name: a.name };
  }
  writeCollection(file, omitEmpty(col));
  Logger.info(`  ${listing} chapters publish activities (${total} provisions), ${withPage.length - listing - failed} publish none, ${failed} failed`);
}

if (require.main === module) main().catch((e) => { Logger.error(String(e)); process.exit(1); });
