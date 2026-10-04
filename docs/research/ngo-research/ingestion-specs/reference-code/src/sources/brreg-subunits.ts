/**
 * file: ingest/src/sources/brreg-subunits.ts
 * description: Build the chapter layer for UNITARY organisations from Brreg sub-units.
 * output: data/<org>/chapters.json, or chapters.registry.json when the canonical file is
 *         already reconciled
 *
 * WHY THIS EXISTS. brreg-chapters.ts searches `enheter` — separate legal entities — and
 * matches them to an organisation by name. That works for a FEDERATED organisation, whose
 * chapters really are separate entities, and it is the reason Røde Kors yields 382 rows.
 * It returns almost nothing for a UNITARY organisation, because a unitary organisation is
 * ONE legal entity: Frelsesarmeen came back as 1 row and Kirkens Bymisjon as 3.
 *
 * That was read as 'unitary local units are invisible in the registry'. It is wrong. They
 * are registered as `underenheter` (organisasjonsform BEDR) hanging off the parent, in a
 * different endpoint that was never queried:
 *
 *   organisation        enheter   underenheter
 *   Frelsesarmeen             1            175
 *   Kirkens Bymisjon          3            151
 *   Røde Kors               382             20   <- federated: sub-units are back offices
 *   Sanitetskvinnene        577              6
 *
 * So the two structures are not 'visible' versus 'invisible'. They are two registration
 * shapes, and each needs the endpoint that matches its shape. For a federated organisation
 * this script would return only administrative offices, which is why it is driven by an
 * explicit list rather than run over every NGO.
 *
 * `overordnetEnhet` is a declared parent link, so unlike brreg-chapters.ts this involves NO
 * name matching and NO fuzzy threshold: precision is 100% by construction. Confidence is
 * HIGH for that reason.
 *
 *   npm run subunits                  # every unitary organisation
 *   npm run subunits -- frelsesarmeen # one
 */

import * as path from 'path';
import { getJson } from '../lib/http';
import Logger from '../lib/logger';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, readCollection, writeCollection } from '../lib/io';
import type { Chapter, ChapterLevel, Collection } from '../lib/types';

const BRREG = 'https://data.brreg.no/enhetsregisteret/api';
const EXTRACTOR_VERSION = '0.1.0';

interface UnitaryNgo {
  slug: string;
  name: string;
  orgnr: string;
  /** Leading brand words, removed before the name is split into area and unit. */
  brand: RegExp;
}

const NGOS: UnitaryNgo[] = [
  {
    slug: 'frelsesarmeen',
    name: 'Frelsesarmeen',
    orgnr: '938498318',
    // Possessive and plain, and some rows put two spaces after AVD.
    brand: /^FRELSESARMEENS?\s+/i,
  },
  {
    slug: 'kirkens-bymisjon',
    name: 'Stiftelsen Kirkens Bymisjon',
    orgnr: '944384448',
    brand: /^(STIFTELSEN\s+)?KIRKENS\s+BYMISJON\s+/i,
  },
];

interface SubUnit {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform: { kode: string };
  oppstartsdato?: string;
  nedleggelsesdato?: string;
  epostadresse?: string;
  telefon?: string;
  hjemmeside?: string;
  antallAnsatte?: number;
  naeringskode1?: { kode: string; beskrivelse: string };
  beliggenhetsadresse?: BrregAddress;
  postadresse?: BrregAddress;
}

interface BrregAddress {
  adresse?: (string | null)[];
  postnummer?: string;
  poststed?: string;
  kommune?: string;
  kommunenummer?: string;
}

/**
 * A unitary organisation's sub-units are not all chapters. Frelsesarmeen registers four
 * divisions (its regional tier) and a head office alongside 79 korps; Kirkens Bymisjon
 * registers administration offices alongside its service sites. Classify rather than drop,
 * so the distinction stays in the data and a consumer can filter on `level`.
 */
/**
 * Split a registry name into the service area and the unit, learning the areas from the
 * data rather than from a hard-coded list.
 *
 * Brreg writes a sub-unit as `<BRAND> <AREA> AVD <UNIT>`:
 *
 *   FRELSESARMEEN AVD ASKIM KORPS                 -> area none,      unit 'Askim korps'
 *   FRELSESARMEENS RUSOMSORG AVD BAKKEGATEN       -> area Rusomsorg, unit 'Bakkegaten'
 *
 * This matters far beyond presentation. The organisation's own website writes the SAME
 * split with a comma — 'Frelsesarmeens rusomsorg, Bakkegaten' — so parsing only the
 * `<BRAND> AVD <UNIT>` shape left 64 registry rows carrying names like 'Frelsesarmeens
 * Rusomsorg Avd Bakkegaten' that could never match the site's 'Bakkegaten'. Reconciliation
 * found 111 of 175 units instead of the 165 the same data supports.
 *
 * Some rows omit AVD: 'FRELSESARMEENS SEKSJON FOR OPPVEKST HOME START DRAMMEN'. The areas
 * are therefore collected from the rows that DO use AVD, then stripped from the rows that
 * do not — so the vocabulary comes from the registry itself and no list needs maintaining.
 */
function collectAreas(names: string[], brand: RegExp): string[] {
  const areas = new Set<string>();
  for (const raw of names) {
    const m = /^(.+?)\s+AVD\s+.+$/i.exec(raw.replace(brand, '').trim());
    if (m) areas.add(m[1].trim().toUpperCase());
  }
  // Longest first, so 'SEKSJON FOR OPPVEKST' is tried before any prefix of it.
  return [...areas].sort((a, b) => b.length - a.length);
}

function splitName(raw: string, brand: RegExp, areas: string[]): { name: string; area?: string } {
  const bare = raw.replace(brand, '').replace(/\s+/g, ' ').trim();
  const m = /^(?:(.+?)\s+)?AVD\s+(.+)$/i.exec(bare);
  if (m) return { name: m[2].trim(), area: m[1]?.trim() };
  const hit = areas.find((a) => bare.toUpperCase().startsWith(`${a} `));
  if (hit) return { name: bare.slice(hit.length).trim(), area: bare.slice(0, hit.length).trim() };
  return { name: bare || raw.trim() };
}

function classify(name: string): { level: ChapterLevel; chapterType: string } {
  const n = name.toUpperCase();
  if (/\b(DIVISJON|REGION|REGIONKONTOR)\b/.test(n)) return { level: 'REGIONAL', chapterType: 'Divisjon' };
  if (/\b(HOVEDKONTOR|ADMINISTRASJON|ADM|HOVEDKVARTER)\b/.test(n)) return { level: 'RELATED_ENTITY', chapterType: 'Administrasjon' };
  if (/\bKORPS\b/.test(n)) return { level: 'LOCAL', chapterType: 'Korps' };
  if (/\bFRIVILLIGSENTRAL\b/.test(n)) return { level: 'LOCAL', chapterType: 'Frivilligsentral' };
  if (/\b(BARNEHAGE|SKOLE)\b/.test(n)) return { level: 'LOCAL', chapterType: 'Utdanning' };
  if (/\b(SYKEHJEM|GATEHOSPITAL|INSTITUSJON|SENTER|SENTERET)\b/.test(n)) return { level: 'LOCAL', chapterType: 'Institusjon' };
  return { level: 'LOCAL', chapterType: 'Virksomhet' };
}

/** Brreg pads the address array with nulls; keep only real lines. */
function toAddress(a?: BrregAddress) {
  if (!a) return undefined;
  const lines = (a.adresse ?? []).filter((x): x is string => Boolean(x && x.trim()));
  if (!lines.length && !a.postnummer) return undefined;
  return {
    line1: lines[0],
    line2: lines.slice(1).join(', ') || undefined,
    postalCode: a.postnummer,
    postalPlace: a.poststed,
  };
}

/** Title-case a registry SHOUTED name, preserving the small words Norwegian keeps lower. */
function displayName(raw: string): string {
  const LOWER = new Set(['og', 'i', 'på', 'for', 'av', 'til']);
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function toChapter(u: SubUnit, ngo: UnitaryNgo, areas: string[]): Chapter {
  const { name: bare, area } = splitName(u.navn, ngo.brand, areas);
  const classified = classify(u.navn);
  const { level } = classified;
  // The registry's own service area beats anything inferred from the unit's name, and it
  // is the same vocabulary the website uses — which is what makes the two join.
  const chapterType = area
    ? area.charAt(0).toUpperCase() + area.slice(1).toLowerCase()
    : classified.chapterType;
  const loc = u.beliggenhetsadresse;

  return {
    id: `${ngo.slug}:${u.organisasjonsnummer}`,
    name: displayName(bare),
    legalName: u.navn,
    organizationNumber: u.organisasjonsnummer,
    organization: { id: ngo.slug, name: ngo.name },
    parent: { id: `${ngo.slug}:${ngo.orgnr}`, name: ngo.name, level: 'NATIONAL' },
    chapterType,
    level,
    // A sub-unit carries no termination date of its own; Brreg removes the row instead.
    isActive: !u.nedleggelsesdato,
    establishedDate: u.oppstartsdato,
    terminatedDate: u.nedleggelsesdato,
    address: toAddress(loc) ?? toAddress(u.postadresse),
    addressKind: toAddress(loc) ? 'VISITING' : 'POSTAL',
    municipality: loc?.kommune,
    municipalityNumber: loc?.kommunenummer,
    email: u.epostadresse,
    phone: u.telefon,
    website: normaliseUrl(u.hjemmeside).url,
    provenance: {
      sourceUrl: `${BRREG}/underenheter/${u.organisasjonsnummer}`,
      // No name matching is involved: the registry itself declares the parent link.
      confidence: 'HIGH',
      reconciliation: 'UNRECONCILED',
      idOrigin: 'SOURCE',
      parentOrigin: 'SOURCE',
      municipalityMethod: 'REGISTRY',
      matchMethod: 'overordnetEnhet',
      containsPersonalData: false,
    },
    freshness: {
      fetchedAt: nowIso(),
      blocks: {
        identity: { volatility: 'STRUCTURAL', source: BRREG },
        location: { volatility: 'SLOW', source: BRREG },
        classification: { volatility: 'SLOW', source: BRREG },
      },
    },
  };
}

/**
 * The parent entity itself, emitted as the NATIONAL row.
 *
 * ⚠️ Without it these organisations have no hierarchy AT ALL. Every sub-unit's parent
 * pointed at an id that did not exist, so the migration dropped the link and 723 chapters
 * - all of Frelsesarmeen and Kirkens Bymisjon - came out as orphans with no tier above
 * them. A federated organisation gets its national row from the name search in
 * brreg-chapters.ts; a unitary one has no such row unless this creates it.
 */
async function fetchParent(ngo: UnitaryNgo): Promise<Chapter> {
  const e = await getJson<any>(`${BRREG}/enheter/${ngo.orgnr}`,
    { timeoutMs: 60_000, accept: 'application/json' });
  return {
    id: `${ngo.slug}:${ngo.orgnr}`,
    name: e?.navn ?? ngo.name,
    legalName: e?.navn,
    organizationNumber: ngo.orgnr,
    organization: { id: ngo.slug, name: ngo.name },
    level: 'NATIONAL',
    isActive: !e?.slettedato,
    establishedDate: e?.stiftelsesdato ?? e?.registreringsdatoEnhetsregisteret,
    address: toAddress(e?.forretningsadresse),
    addressKind: 'REGISTERED',
    municipality: e?.forretningsadresse?.kommune,
    municipalityNumber: e?.forretningsadresse?.kommunenummer,
    email: e?.epostadresse,
    phone: e?.telefon,
    website: normaliseUrl(e?.hjemmeside).url,
    provenance: {
      sourceUrl: `${BRREG}/enheter/${ngo.orgnr}`,
      confidence: 'HIGH',
      reconciliation: 'UNRECONCILED',
      idOrigin: 'SOURCE',
      parentOrigin: 'UNSTATED',
      municipalityMethod: 'REGISTRY',
      matchMethod: 'organizationNumber',
      containsPersonalData: false,
    },
    freshness: {
      fetchedAt: nowIso(),
      blocks: { identity: { volatility: 'STRUCTURAL', source: BRREG } },
    },
  };
}

async function fetchSubUnits(orgnr: string): Promise<SubUnit[]> {
  const out: SubUnit[] = [];
  for (let page = 0; page < 20; page += 1) {
    const url = `${BRREG}/underenheter?overordnetEnhet=${orgnr}&size=100&page=${page}`;
    const res = await getJson<any>(url, { timeoutMs: 60_000, accept: 'application/json' });
    const batch: SubUnit[] = res?._embedded?.underenheter ?? [];
    out.push(...batch);
    const total = res?.page?.totalElements ?? out.length;
    if (out.length >= total || !batch.length) break;
  }
  return out;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const targets = NGOS.filter((n) => !only || n.slug === only);
  if (!targets.length) {
    Logger.error(`unknown organisation '${only}'. known: ${NGOS.map((n) => n.slug).join(', ')}`);
    process.exit(1);
  }

  for (const ngo of targets) {
    const units = await fetchSubUnits(ngo.orgnr);
    const areas = collectAreas(units.map((u) => u.navn), ngo.brand);
    const items = units.map((u) => toChapter(u, ngo, areas));
    // The national body first, so every sub-unit's parent resolves to a row in this file.
    items.unshift(await fetchParent(ngo));

    const collection: Collection<Chapter> = {
      items,
      extract: {
        sourceId: `brreg-underenheter-${ngo.slug}`,
        method: 'REST_API',
        baseUrl: BRREG,
        indexUrl: `${BRREG}/underenheter?overordnetEnhet=${ngo.orgnr}`,
        fetchedAt: nowIso(),
        extractorVersion: EXTRACTOR_VERSION,
        pagesAttempted: units.length,
        pagesParsed: items.length,
        isRobotsAllowed: true,
        license: 'NLOD',
      },
    };

    // Same rule as brreg-chapters.ts: never overwrite a canonical file that is the join of
    // registry and crawl. Where no crawl has happened yet, this pull IS the best available
    // dataset and becomes the canonical one, carrying reconciliation UNRECONCILED so the
    // gap stays visible rather than being implied by the filename.
    const canonical = path.join(DATA_DIR, ngo.slug, 'chapters.json');
    const existing = readCollection<Chapter>(canonical);
    const isReconciled = existing?.extract?.sourceId?.endsWith('-reconciled') ?? false;
    const out = isReconciled
      ? path.join(DATA_DIR, ngo.slug, 'chapters.registry.json')
      : canonical;
    writeCollection(out, collection);

    const levels = items.reduce<Record<string, number>>((m, c) => {
      m[c.level] = (m[c.level] ?? 0) + 1; return m;
    }, {});
    const has = (f: keyof Chapter) => items.filter((c) => c[f] !== undefined).length;
    Logger.info(`\n  ${ngo.slug}: ${items.length} sub-units -> ${ngo.slug}/${path.basename(out)}`
      + (isReconciled ? '   (canonical file is reconciled; run `npm run reconcile -- '
        + `${ngo.slug}\` to rebuild it)` : ''));
    Logger.info(`    level        ${JSON.stringify(levels)}`);
    Logger.info(`    municipality ${has('municipalityNumber')}   address ${has('address')}`
      + `   email ${has('email')}   phone ${has('phone')}`);
    if (areas.length) Logger.info(`    service areas learned from the registry: ${areas.length}`
      + `  (${areas.slice(0, 4).map((a) => a.toLowerCase()).join(', ')}${areas.length > 4 ? ', …' : ''})`);
  }
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
