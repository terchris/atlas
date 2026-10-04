/**
 * file: ingest/src/sources/build-organizations.ts
 * description: The eleven NGOs as first-class Organization resources.
 * output: data/_organizations/organizations.json
 *
 * ⚠️ WHY THIS WAS MISSING. `OrganizationCollection` has been in the schema and
 * `listOrganizations` in the API since the beginning, but no organizations.json existed:
 * the organisations lived only as {id, name} references inside chapters. So the hierarchy
 * had no modelled ROOT - a chapter's ancestry ended at a national chapter row rather than
 * at the organisation itself, and the one field that classifies an organisation's whole
 * shape, `structure`, was declared and never populated.
 *
 * Identity and `structure` are stated here rather than derived, because they are the facts
 * the ingest pipeline is built ON: which endpoint to query, which extractor to run. Everything
 * else - name, website, founding date - comes from Enhetsregisteret, and the chapter counts
 * from the reconciled data.
 *
 *   npm run organizations
 */

import * as path from 'path';
import { getJson } from '../lib/http';
import Logger from '../lib/logger';
import { normaliseUrl } from '../lib/url';
import { DATA_DIR, nowIso, readCollection, writeCollection } from '../lib/io';
import type { Chapter, Collection } from '../lib/types';

const BRREG = 'https://data.brreg.no/enhetsregisteret/api';

interface Seed { slug: string; shortName: string; orgnr: string; structure: 'FEDERATED' | 'UNITARY'; }

const SEEDS: Seed[] = [
  { slug: 'redcross', shortName: 'Røde Kors', orgnr: '864139442', structure: 'FEDERATED' },
  { slug: 'sanitetskvinnene', shortName: 'Sanitetskvinnene', orgnr: '970168001', structure: 'FEDERATED' },
  { slug: 'nasjonalforeningen', shortName: 'Nasjonalforeningen', orgnr: '938429863', structure: 'FEDERATED' },
  { slug: 'fire-h', shortName: '4H Norge', orgnr: '943838240', structure: 'FEDERATED' },
  { slug: 'speiderforbundet', shortName: 'Speiderforbundet', orgnr: '954877841', structure: 'FEDERATED' },
  { slug: 'lhl', shortName: 'LHL', orgnr: '940190738', structure: 'FEDERATED' },
  { slug: 'mental-helse', shortName: 'Mental Helse', orgnr: '971322926', structure: 'FEDERATED' },
  { slug: 'diabetesforbundet', shortName: 'Diabetesforbundet', orgnr: '970169113', structure: 'FEDERATED' },
  { slug: 'folkehjelp', shortName: 'Norsk Folkehjelp', orgnr: '871033552', structure: 'FEDERATED' },
  { slug: 'frelsesarmeen', shortName: 'Frelsesarmeen', orgnr: '938498318', structure: 'UNITARY' },
  { slug: 'kirkens-bymisjon', shortName: 'Kirkens Bymisjon', orgnr: '944384448', structure: 'UNITARY' },
];

async function main(): Promise<void> {
  const items = [];
  for (const s of SEEDS) {
    let e: any = {};
    try {
      e = await getJson<any>(`${BRREG}/enheter/${s.orgnr}`, { timeoutMs: 60_000, accept: 'application/json' });
    } catch {
      Logger.warn(`  ${s.slug}: no registry record, using the seed only`);
    }
    const chapters = readCollection<Chapter>(path.join(DATA_DIR, s.slug, 'chapters.json'))?.items ?? [];
    // Active LOCAL and REGIONAL units; the national row is the organisation itself.
    // RELATED_ENTITY rows (foundations, companies, the youth wing) are never chapters - see
    // chapter-level.yaml. Counting them put Frelsesarmeen at 302 instead of 272.
    const active = chapters.filter((c) => c.level !== 'NATIONAL' && c.level !== 'RELATED_ENTITY'
      && c.isActive !== false).length;

    const addr = e?.forretningsadresse ?? e?.postadresse;
    const lines = (addr?.adresse ?? []).filter((x: any) => x && String(x).trim());

    items.push({
      id: s.slug,
      name: e?.navn ?? s.shortName,
      shortName: s.shortName,
      organizationNumber: s.orgnr,
      // The legal form EXPLAINS the structure. A stiftelse has no members in law, so it
      // cannot have member chapters - which is why Kirkens Bymisjon shows 3 governance
      // units where a comparable forening shows hundreds.
      legalForm: e?.organisasjonsform?.kode,
      structure: s.structure,
      isVoluntaryRegistered: e?.registrertIFrivillighetsregisteret,
      // True for the two organisations that run company groups.
      isGroupParent: e?.erIKonsern,
      foundedDate: e?.stiftelsesdato,
      employeeCount: e?.antallAnsatte,
      purpose: Array.isArray(e?.aktivitet) ? e.aktivitet.join(' ') : e?.aktivitet,
      address: lines.length || addr?.postnummer ? {
        line1: lines[0],
        line2: lines.slice(1).join(', ') || undefined,
        postalCode: addr?.postnummer,
        postalPlace: addr?.poststed,
      } : undefined,
      email: e?.epostadresse,
      phone: e?.telefon,
      isActive: !(e?.konkurs || e?.underAvvikling || e?.slettedato),
      website: normaliseUrl(e?.hjemmeside).url,
      chapterCount: active,
      provenance: {
        sourceUrl: `${BRREG}/enheter/${s.orgnr}`,
        confidence: 'HIGH' as const,
        reconciliation: 'BOTH' as const,
        idOrigin: 'DERIVED' as const,
        parentOrigin: 'UNSTATED' as const,
        matchMethod: 'organizationNumber',
        containsPersonalData: false,
      },
      freshness: {
        fetchedAt: nowIso(),
        blocks: {
          identity: { volatility: 'STRUCTURAL' as const, source: BRREG },
        },
      },
    });
    Logger.info(`  ${s.slug.padEnd(20)} ${String(active).padStart(4)} chapters`
      + `   ${String(e?.organisasjonsform?.kode ?? '?').padEnd(5)}`
      + `   ${s.structure.padEnd(9)}`
      + `   ansatte ${String(e?.antallAnsatte ?? '-').padStart(5)}`
      + `   ${e?.erIKonsern ? 'konsern' : '       '}`
      + `   ${(e?.navn ?? '').slice(0, 34)}`);
  }

  const out = path.join(DATA_DIR, '_organizations', 'organizations.json');
  writeCollection(out, {
    items,
    extract: {
      sourceId: 'ngo-organizations',
      method: 'REST_API',
      baseUrl: BRREG,
      fetchedAt: nowIso(),
      extractorVersion: '0.1.0',
      pagesAttempted: SEEDS.length,
      pagesParsed: items.length,
      isRobotsAllowed: true,
      license: 'NLOD',
    },
  } as Collection<any>);
  Logger.info(`\n  ${items.length} organisations -> _organizations/organizations.json`);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
