/**
 * file: ingest/src/sources/brreg-chapters.ts
 * description: Build the chapter layer for the Tier A NGOs from the national registry.
 * output: data/<org>/chapters.json (or chapters.registry.json when the canonical file is
 *         already reconciled)  and  data/_all-kommune-coverage.csv
 *
 * Needs no NGO website and no organisation CRM — only the registry, read through Atlas.
 * Measured precision for Røde Kors: 93.6% (recall 95.4%) against the organisation's own
 * public chapter directory, after excluding organisation-owned companies and one region
 * where the directory publishes no chapters at all.
 *
 *   npm run chapters -- --fetch     # pull ~72,800 voluntary organisations (cached)
 *   npm run chapters                # match from cache and write output
 *   npm run chapters -- --coverage  # also write the municipality matrix
 */

import * as fs from 'fs';
import * as path from 'path';
import { getJson } from '../lib/http';
import Logger from '../lib/logger';
import { normaliseName } from '../lib/text';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, NGO_ROOT, nowIso, readCollection, writeCollection } from '../lib/io';
import type { Chapter, ChapterLevel, Collection, Confidence } from '../lib/types';

const ATLAS = 'https://api-atlas.urbalurba.com';
const CACHE = path.join(NGO_ROOT, 'ingest', '.cache');
const EXTRACTOR_VERSION = '0.4.0';

interface RegistryRow {
  organisasjonsnummer: string;
  navn: string;
  kommune_nr?: string;
  icnpo_nummer?: string;
  naeringskode1_kode?: string;
  antall_ansatte?: number;
  is_active?: boolean;
  organisasjonsform_kode?: string;
  hjemmeside?: string;
  aktivitet?: string;
  _name?: string;
  _site?: string;
  _activity?: string;
}

interface NgoRule {
  slug: string;
  name: string;
  orgnr: string;
  /**
   * UNITARY organisations do not register chapters as separate legal entities, so searching
   * `enheter` by name finds only the parent. Their chapters are Brreg SUB-UNITS and belong
   * to brreg-subunits.ts, which owns their chapters.registry.json. Skipped here entirely:
   * writing the 1-row `enheter` result to that same filename silently replaced the 175
   * sub-units it holds, which is worse than not running at all.
   */
  structure?: 'UNITARY';
  host: string;
  brand: string;
  include: RegExp;
  exclude?: RegExp;
  strong: RegExp;
  chapterType: string;
}

/** Historical and current county names, used to spot a regional unit by its name. */
const COUNTIES = new Set([
  'Østfold', 'Akershus', 'Oslo', 'Hedmark', 'Oppland', 'Buskerud', 'Vestfold',
  'Telemark', 'Aust-Agder', 'Vest-Agder', 'Rogaland', 'Hordaland', 'Bergen',
  'Sogn og Fjordane', 'Møre og Romsdal', 'Sør-Trøndelag', 'Nord-Trøndelag',
  'Nordland', 'Troms', 'Finnmark', 'Viken', 'Innlandet', 'Vestfold og Telemark',
  'Agder', 'Vestland', 'Trøndelag', 'Troms og Finnmark',
].map(normaliseName));

/** Organisations whose canonical file was left alone because it is already reconciled. */
const reconciledSkipped: string[] = [];
/** Organisations whose chapters live in the sub-unit register, not this one. */
const unitarySkipped: string[] = [];

const REGION_WORD = /\b(DISTRIKT|FYLKESLAG|FYLKESSTYRET|FYLKESFORENING|FYLKE|KRETS|REGION)\b/;

/**
 * The organisation's own word for a unit depends on its TIER, and a single constant per
 * organisation put 'Lokallag' on 9 national offices and 116 regional bodies.
 *
 * Where the registered name states the tier ('… AKERSHUS FYLKESLAG', 'AGDER KRETS AV …')
 * that word is the organisation's own and is used. Where it does not, chapterType is
 * OMITTED rather than guessed: an absent value means the organisation's word is unknown,
 * which is true, whereas inventing a generic one asserts something no source says.
 */
function tierType(name: string, level: ChapterLevel, localWord: string): string | undefined {
  if (level === 'LOCAL') return localWord;
  const m = /\b(FYLKESLAG|FYLKESSTYRET|FYLKESFORENING|DISTRIKT|KRETS|REGION|FYLKE)\b/i.exec(name);
  if (m) {
    const w = m[1].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return undefined;
}
/** Support bodies that carry the brand but are not chapters. */
const SUPPORT = /\b(FORELDREFORENING|VENNEFORENING|VENNER AV|STOTTEFORENING|STOTTEGRUPPE|BORETTSLAG|EIENDOM|HUS AS|SAMEIE)\b/;

const NGOS: NgoRule[] = [
  { slug: 'redcross', name: 'NORGES RØDE KORS', orgnr: '864139442', host: 'rodekors.no',
    brand: 'RODE KORS', include: /\bRODE KORS\b/, strong: /\bRODE KORS\b/,
    chapterType: 'Lokalforening' },
  { slug: 'folkehjelp', name: 'NORSK FOLKEHJELP', orgnr: '871033552', host: 'folkehjelp.no',
    brand: 'FOLKEHJELP', include: /\bNORSK FOLKEHJELP\b/, strong: /^NORSK FOLKEHJELP\b/,
    chapterType: 'Lokallag' },
  { slug: 'diabetesforbundet', name: 'DIABETESFORBUNDET', orgnr: '970169113',
    host: 'diabetes.no', brand: 'DIABETESFORBUNDET', include: /\bDIABETESFORBUNDET\b/,
    strong: /^DIABETESFORBUNDET\b/, chapterType: 'Lokallag' },
  { slug: 'mental-helse', name: 'MENTAL HELSE', orgnr: '971322926', host: 'mentalhelse.no',
    brand: 'MENTAL HELSE', include: /\bMENTAL HELSE\b/, exclude: /\bMENTAL HELSE UNGDOM\b/,
    strong: /\bMENTAL HELSE\b/, chapterType: 'Lokallag' },
  { slug: 'lhl', name: 'LANDSFORENINGEN FOR HJERTE- OG LUNGESYKE', orgnr: '940190738',
    host: 'lhl.no', brand: 'LHL', include: /\bLHL\b/, strong: /^LHL\b/,
    chapterType: 'Lokallag' },
  { slug: 'fire-h', name: '4H NORGE', orgnr: '943838240', host: '4h.no', brand: '4H',
    include: /\b4H\b/, strong: /\b4H$/, chapterType: 'Klubb' },
  // KFUK-KFUM-speiderne is a DIFFERENT national organisation. A plain SPEIDER match
  // returns 565 units of which 169 are theirs — nearly a third of the result would be
  // another organisation's chapters.
  { slug: 'speiderforbundet', name: 'NORGES SPEIDERFORBUND', orgnr: '954877841',
    host: 'speiding.no', brand: 'SPEIDER', include: /SPEIDER/, exclude: /\b(KFUK|KFUM)\b/,
    strong: /\b(SPEIDERGRUPPE|SPEIDERGRUPPA)\b|\bNSF\b/, chapterType: 'Speidergruppe' },
  { slug: 'sanitetskvinnene', name: 'NORSKE KVINNERS SANITETSFORENING', orgnr: '970168001',
    host: 'sanitetskvinnene.no', brand: 'SANITET',
    include: /SANITETSFORENING|SANITETSKVINNER/, strong: /\bN K S\b|SANITETSFORENING/,
    chapterType: 'Sanitetsforening' },
  // Many of this organisation's local units are named simply '<place> HELSELAG' with no
  // national brand token — those land as LOW confidence by design, not by accident.
  { slug: 'nasjonalforeningen', name: 'NASJONALFORENINGEN FOR FOLKEHELSEN',
    orgnr: '938429863', host: 'nasjonalforeningen.no', brand: 'NASJONALFORENINGEN',
    include: /\bHELSELAG\b|\bNASJONALFORENINGEN\b|\bDEMENSFORENING\b/,
    strong: /\bNASJONALFORENINGEN\b/, chapterType: 'Helselag' },
  // UNITARY organisations: local units are internal, not legal entities. Expect 1–3 rows.
  { slug: 'frelsesarmeen', name: 'FRELSESARMEEN', orgnr: '938498318', structure: 'UNITARY',
    host: 'frelsesarmeen.no', brand: 'FRELSESARMEEN', include: /\bFRELSESARMEEN\b/,
    strong: /\bFRELSESARMEEN\b/, chapterType: 'Korps' },
  { slug: 'kirkens-bymisjon', name: 'STIFTELSEN KIRKENS BYMISJON', orgnr: '944384448',
    structure: 'UNITARY',
    host: 'kirkensbymisjon.no', brand: 'BYMISJON', include: /\bBYMISJON\b/,
    strong: /\bKIRKENS BYMISJON\b/, chapterType: 'Virksomhet' },
];

/** Røde Kors names its specialist units; keep the distinction where it exists. */
const RK_TYPES: [string, RegExp][] = [
  ['Hjelpekorps', /HJELPEKORPS/], ['Omsorg', /\bOMSORG\b/], ['Ungdom', /\bUNGDOM\b/],
  ['Barnehjelp', /BARNEHJELP/], ['Besøkstjeneste', /BESOKSTJENESTE/],
];

async function fetchRegistry(): Promise<RegistryRow[]> {
  fs.mkdirSync(CACHE, { recursive: true });
  const select = [
    'organisasjonsnummer', 'navn', 'kommune_nr', 'icnpo_nummer', 'naeringskode1_kode',
    'antall_ansatte', 'is_active', 'organisasjonsform_kode',
    'hjemmeside:doc->>hjemmeside', 'aktivitet:doc->>aktivitet',
  ].join(',');
  const rows: RegistryRow[] = [];
  for (let offset = 0; offset < 80_000; offset += 10_000) {
    const url = `${ATLAS}/brreg_enhet?registrert_i_frivillighetsregisteret=is.true`
      + `&select=${select}&limit=10000&offset=${offset}&order=organisasjonsnummer`;
    const block = await getJson<RegistryRow[]>(url, { timeoutMs: 180_000 });
    if (!block.length) break;
    rows.push(...block);
    Logger.info(`    fetched ${rows.length.toLocaleString()}`);
  }
  fs.writeFileSync(path.join(CACHE, 'frivillige.json'), JSON.stringify(rows));
  return rows;
}

function loadRegistry(): RegistryRow[] {
  const p = path.join(CACHE, 'frivillige.json');
  if (!fs.existsSync(p)) {
    Logger.error('no cache — run with --fetch first');
    process.exit(1);
  }
  const rows: RegistryRow[] = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of rows) {
    r._name = normaliseName(r.navn);
    r._site = (r.hjemmeside ?? '').toLowerCase();
    r._activity = normaliseName(r.aktivitet ?? '');
  }
  return rows;
}

function match(rows: RegistryRow[]): Map<string, Chapter[]> {
  const byOrg = new Map<string, Chapter[]>();
  const claimed = new Map<string, { slug: string; chapter: Chapter; strong: boolean }>();

  for (const ngo of NGOS) {
    if (ngo.structure === 'UNITARY') {
      unitarySkipped.push(ngo.slug);
      continue;
    }
    for (const r of rows) {
      const n = r._name!;
      if (!ngo.include.test(n)) continue;
      if (ngo.exclude?.test(n)) continue;
      if (SUPPORT.test(n)) continue;

      const strongName = ngo.strong.test(n);
      const signals = [strongName ? 'nameStrong' : 'nameWeak'];
      if (r._site!.includes(ngo.host)) signals.push('website');
      if (r._activity!.includes(ngo.brand)) signals.push('activity');

      const isNational = r.organisasjonsnummer === ngo.orgnr;
      const rest = n.replace(ngo.include, ' ').trim();
      let level: ChapterLevel = isNational ? 'NATIONAL'
        : (REGION_WORD.test(n) || COUNTIES.has(rest)) ? 'REGIONAL' : 'LOCAL';

      const corroborated = signals.includes('website') || signals.includes('activity');
      let confidence: Confidence = isNational || (strongName && corroborated) ? 'HIGH'
        : (strongName || corroborated) ? 'MEDIUM' : 'LOW';

      // An organisation-owned company or foundation is a real entity but NOT a chapter.
      const form = r.organisasjonsform_kode ?? '';
      if ((form === 'AS' || form === 'STI') && !isNational) {
        level = 'RELATED_ENTITY';
        confidence = 'MEDIUM';
      }

      let chapterType = tierType(n, level, ngo.chapterType);
      if (ngo.slug === 'redcross' && level === 'LOCAL') {
        chapterType = RK_TYPES.find(([, re]) => re.test(n))?.[0] ?? 'Lokalforening';
      }

      const website = normaliseUrl(r.hjemmeside).url;
      const chapter: Chapter = {
        id: `${ngo.slug}:${r.organisasjonsnummer}`,
        name: r.navn,
        organizationNumber: r.organisasjonsnummer,
        organization: { id: ngo.slug, name: ngo.name },
        chapterType,
        level,
        isActive: r.is_active,
        municipality: undefined,
        municipalityNumber: r.kommune_nr || undefined,
        addressKind: 'REGISTERED',
        website,
        provenance: {
          sourceUrl: `https://data.brreg.no/enhetsregisteret/api/enheter/${r.organisasjonsnummer}`,
          confidence,
          reconciliation: 'REGISTRY_ONLY',
          idOrigin: 'DERIVED',
          parentOrigin: isNational ? undefined : 'INFERRED',
          municipalityMethod: r.kommune_nr ? 'REGISTRY' : 'NONE',
          matchMethod: signals.join('+'),
          containsPersonalData: false,
        },
        freshness: {
          fetchedAt: nowIso(),
          blocks: {
            identity: { volatility: 'STRUCTURAL', source: 'registry' },
            // The registry has no 'last confirmed' field, so assertedAt stays absent —
            // which is the truthful answer, and must never be backfilled with fetchedAt.
            classification: { volatility: 'SLOW', freshness: 'UNKNOWN', source: 'registry' },
          },
        },
      };
      if (!isNational) chapter.parent = { id: `${ngo.slug}:${ngo.orgnr}`, name: ngo.name, level: 'NATIONAL' };

      // One organisation number can satisfy two rules (a sanitetsforening whose name also
      // contains HELSELAG). Keep the stronger claim rather than emitting both.
      const prior = claimed.get(r.organisasjonsnummer);
      if (prior) {
        const better = strongName && !prior.strong;
        if (!better) continue;
        const list = byOrg.get(prior.slug)!;
        byOrg.set(prior.slug, list.filter((c) => c !== prior.chapter));
      }
      claimed.set(r.organisasjonsnummer, { slug: ngo.slug, chapter, strong: strongName });
      if (!byOrg.has(ngo.slug)) byOrg.set(ngo.slug, []);
      byOrg.get(ngo.slug)!.push(chapter);
    }
  }
  return byOrg;
}

async function writeCoverage(byOrg: Map<string, Chapter[]>): Promise<void> {
  const municipalities = await getJson<any[]>(
    `${ATLAS}/dim_kommune?select=kommune_nr,kommune_name,fylke_name,is_active&limit=1200`);
  const active = municipalities.filter((m) => m.is_active);
  const slugs = [...byOrg.keys()].sort();
  const counts = new Map<string, Map<string, number>>();
  for (const [slug, chapters] of byOrg) {
    for (const c of chapters) {
      if (c.level !== 'LOCAL' && c.level !== 'REGIONAL') continue;
      if (!c.municipalityNumber) continue;
      if (!counts.has(c.municipalityNumber)) counts.set(c.municipalityNumber, new Map());
      const m = counts.get(c.municipalityNumber)!;
      m.set(slug, (m.get(slug) ?? 0) + 1);
    }
  }
  const lines = [['municipalityNumber', 'municipality', 'county', 'ngoCount',
                  'chapterCount', ...slugs].join(',')];
  let covered = 0;
  for (const m of active.sort((a, b) => a.kommune_nr.localeCompare(b.kommune_nr))) {
    const row = counts.get(m.kommune_nr) ?? new Map<string, number>();
    if (row.size) covered += 1;
    const total = [...row.values()].reduce((a, b) => a + b, 0);
    lines.push([m.kommune_nr, `"${m.kommune_name}"`, `"${m.fylke_name}"`,
                row.size, total, ...slugs.map((s) => row.get(s) ?? 0)].join(','));
  }
  const out = path.join(DATA_DIR, '_all-municipality-coverage.csv');
  fs.writeFileSync(out, `${lines.join('\n')}\n`);
  Logger.info(`  coverage: ${covered}/${active.length} municipalities -> ${path.relative(NGO_ROOT, out)}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rows = args.includes('--fetch') ? await fetchRegistry() : loadRegistry();
  Logger.info(`registry rows: ${rows.length.toLocaleString()}\n`);

  const byOrg = match(rows);
  const fetchedAt = nowIso();
  let total = 0;
  const byLevel: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};

  for (const slug of [...byOrg.keys()].sort()) {
    const items = byOrg.get(slug)!.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
    total += items.length;
    for (const c of items) {
      byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;
      const k = c.provenance!.confidence;
      byConfidence[k] = (byConfidence[k] ?? 0) + 1;
    }
    const collection: Collection<Chapter> = {
      items,
      extract: {
        sourceId: 'brreg-frivillige-chaptermatch',
        method: 'MANUAL',
        baseUrl: ATLAS,
        indexUrl: `${ATLAS}/brreg_enhet`,
        fetchedAt,
        extractorVersion: EXTRACTOR_VERSION,
        pagesAttempted: rows.length,
        pagesParsed: rows.length,
        isRobotsAllowed: true,
        license: 'NLOD',
      },
    };
    // A RECONCILED chapters.json is the join of this registry pull with a website crawl,
    // and it holds everything a registry cannot: coordinates, activities, contacts, member
    // counts. Overwriting it here would throw all of that away and quietly replace a
    // 302-chapter dataset with a 1-chapter one — the same failure the --limit guard exists
    // to prevent, one directory up. Write the registry layer to its own file instead and
    // let `npm run reconcile` rebuild the canonical one.
    const canonical = path.join(DATA_DIR, slug, 'chapters.json');
    const existing = readCollection<Chapter>(canonical);
    const isReconciled = existing?.extract?.sourceId?.endsWith('-reconciled') ?? false;
    const target = isReconciled ? path.join(DATA_DIR, slug, 'chapters.registry.json') : canonical;
    writeCollection(target, collection);
    Logger.info(`  ${slug.padEnd(20)}${String(items.length).padStart(5)} chapters`
      + (isReconciled ? '   -> chapters.registry.json (canonical file is reconciled; '
        + 'run `npm run reconcile -- ' + slug + '` to rebuild it)' : ''));
    if (isReconciled) reconciledSkipped.push(slug);
  }

  if (unitarySkipped.length) {
    Logger.info(`\n  skipped ${unitarySkipped.join(', ')}: unitary organisations whose `
      + 'chapters are Brreg sub-units — run `npm run subunits`');
  }
  if (reconciledSkipped.length) {
    Logger.warn(`${reconciledSkipped.length} organisation(s) already have a RECONCILED `
      + `chapters.json and were not overwritten: ${reconciledSkipped.join(', ')}. `
      + 'Their registry layer went to chapters.registry.json; re-run reconcile to merge.');
  }
  Logger.info(`\n  total: ${total}`);
  Logger.info(`  level:      ${JSON.stringify(byLevel)}`);
  Logger.info(`  confidence: ${JSON.stringify(byConfidence)}`);

  if (args.includes('--coverage')) await writeCoverage(byOrg);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
