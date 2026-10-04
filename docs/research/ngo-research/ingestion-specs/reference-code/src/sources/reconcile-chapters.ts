/**
 * file: ingest/src/sources/reconcile-chapters.ts
 * description: Join registry-derived chapters with crawled ones into one dataset.
 * output: data/<org>/chapters.json (reconciled), data/<org>/reconciliation.csv
 *
 * The two sources are complementary and neither is sufficient:
 *
 *   registry  organisationNumber, municipalityNumber, legal status  — no activities,
 *             no coordinates, no contacts, because a registry holds none of those
 *   crawl     coordinates, activities, contacts, the real address  — no organisation
 *             number, because a website does not publish one
 *
 * They also have disjoint identifier spaces (`<org>:<orgnr>` vs `<org>:<slug>`), so a
 * crawl run overwrites rather than updates. This matches them and merges, which is what
 * `reconciliation` on Provenance was designed for.
 *
 * Matching runs in two passes, strongest key first:
 *
 *   1. ORGANISATION NUMBER  exact, when the crawl found one on the page. The claim above
 *      that 'a website does not publish one' held for the first three organisations and
 *      is false in general: Frelsesarmeen prints 'Organisasjonsnr: 974 127 776' in every
 *      contact card. Where it exists it is decisive and no name heuristic can beat it.
 *   2. NORMALISED NAME      the fallback, for the pages that print no number.
 *
 *   npm run reconcile -- sanitetskvinnene
 *   npm run reconcile -- sanitetskvinnene --dry-run
 *   npm run reconcile -- lhl --leftovers [--dry-run]
 *
 * --leftovers re-runs the passes on an already reconciled chapters.json, between its REGISTRY_ONLY
 * and SOURCE_ONLY rows only; BOTH rows are kept exactly as they are. Use it after the match key
 * changes, when the crawl that produced the file is no longer on disk: the passes only got more
 * lenient, so earlier pairs stand and only leftovers can still join.
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';

import { DATA_DIR, nowIso, readCollection, writeCollection } from '../lib/io';
import type { Chapter, Collection, Reconciliation } from '../lib/types';

/**
 * Match key. Registries hold legal names, websites hold display names, and the two differ
 * in ways that are noise rather than signal: a legal-form suffix, a spelled-out 'og', a
 * unit qualifier. Strip those before comparing.
 *
 * 🔴 Ø, Æ and Å are NOT folded here, unlike everywhere else in this codebase. They are
 * distinguishing letters in Norwegian place names, and folding them merges different
 * municipalities: Hole (Buskerud) with Høle (Rogaland), Lardal (Vestfold) with Lårdal
 * (Telemark). Folding is right for slugs and for brand matching; it is wrong for deciding
 * that two chapters are the same chapter.
 */
const up = (s: string) => s.toUpperCase().replace(/[^A-ZÆØÅ]+/g, '');

function matchKey(name: string, orgTokens: string[] = []): string {
  let k = (name ?? '').toUpperCase()
    // An abbreviation in brackets is never part of the name a registry holds:
    // 'Home-Start (HS) Alna og Østensjø' against the registry's 'Home Start Alna og
    // Østensjø'. Drop the bracketed part before anything else.
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-ZÆØÅ0-9]+/g, ' ');
  // Registries often prefix or suffix the parent organisation's full name:
  // 'NASJONALFORENINGEN FOR FOLKEHELSEN VOSS DEMENSFORENING' against the site's
  // 'Voss demensforening'. Strip EVERY token of the organisation name, including short
  // ones - leaving a stray 'FOR' behind drops the match rate from 72% to 45%.
  //
  // Norwegian forms the possessive with a bare -s and the definite with -en/-ens, and a
  // website uses those forms where a registry uses the bare noun: 'Frelsesarmeens
  // migrasjonssenter' against 'FRELSESARMEEN AVD MIGRASJONSSENTER'. Matching \bTOKEN\b
  // alone leaves the possessive standing, so the two never meet.
  for (const t of orgTokens) k = k.replace(new RegExp(`\\b${t}(?:ENS|ENE|EN|S)?\\b`, 'g'), ' ');
  return k
    .replace(/\b(LOKALFORENING|LOKALFORENINGEN|LOKALLAG|LOKALAVDELING|FORENING)\b/g, '')
    .replace(/\b(HJELPEKORPS|HJELPKORPS|BESOKSTJENESTE|BESOKSTENESTE|OMSORG|UNGDOM|ADM)\b/g, '')
    .replace(/\b(OG OMEGN|OG OMLAND|I SOGN)\b/g, '')
    // 'AGDER KRETS AV NORGES SPEIDERFORBUND' / 'Agder krets': once the organisation's name is
    // stripped, the registry's connecting 'AV' (and its 'N S F' abbreviation) is left standing.
    .replace(/\bN S F\b/g, '')
    .replace(/\bAV\b/g, '')
    // A unit word the two sources use interchangeably: '1. KOLBOTN GRUPPE' / '1. Kolbotn speidergruppe'.
    .replace(/\b(SPEIDERGRUPPE|GRUPPE)\b/g, '')
    .replace(/\bOG\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pass 4 key: the same tokens in any order, without the preposition 'I' and without a
 * genitive -S. An audit on 4 Oct 2026 found seven units that survived the first three
 * passes as two rows each, one per source - e.g. 'LEVANGERS UNGE SANITETSFORENING' /
 * 'Levanger Unge Sanitetsforening', 'Gatehospitalet i Bergen' / 'Gatehospitalet Bergen'.
 * Added without the intermediate files to test against: check on the next run how many of
 * the seven it actually joins. Looser than the other keys, so it runs last and only when
 * it leaves exactly one candidate.
 */
function tokenSetKey(name: string, orgTokens: string[] = []): string {
  return matchKey(name, orgTokens).split(' ')
    .filter((t) => t && t !== 'I')
    .map((t) => (t.length > 4 && t.endsWith('S') ? t.slice(0, -1) : t))
    .sort()
    .join(' ');
}

/** Fields the registry owns; the crawl cannot know them. */
const FROM_REGISTRY = ['organizationNumber', 'municipalityNumber', 'municipality',
                       'county', 'legalName', 'isActive', 'establishedDate',
                       'terminatedDate', 'chapterType'] as const;
/** Fields the crawl owns; the registry does not hold them. */
const FROM_CRAWL = ['coordinates', 'address', 'addressKind', 'activities', 'contacts',
                    'facebookUrl', 'email', 'phone',
                    // memberCount is published by the organisation and held by no
                    // registry. Omitting it here silently dropped 287 of 366 counts.
                    'memberCount'] as const;

/**
 * Digits only, and only if there are exactly nine of them. A Norwegian organisation number
 * is nine digits; anything else on a page under that label is an editor's typo or a bank
 * account, and must not become a join key.
 */
function digits(v?: string): string | undefined {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 9 ? d : undefined;
}

function merge(registry: Chapter, crawl: Chapter, viaNumber = false): Chapter {
  const out: Chapter = { ...registry };
  for (const f of FROM_CRAWL) {
    const v = (crawl as any)[f];
    if (v !== undefined) (out as any)[f] = v;
  }
  // The crawl's name is the display name; keep the registry's as legalName.
  if (crawl.name && crawl.name !== registry.name) {
    out.legalName = registry.name;
    out.name = crawl.name;
  }
  // Prefer the organisation's own page over the registry's hjemmeside field.
  if (crawl.website) out.website = crawl.website;

  out.provenance = {
    ...registry.provenance!,
    sourceUrl: crawl.provenance?.sourceUrl ?? registry.provenance!.sourceUrl,
    // Two independent sources agreeing is the confidence rule this dataset runs on.
    confidence: 'HIGH',
    reconciliation: 'BOTH',
    matchMethod: `${registry.provenance?.matchMethod ?? 'registry'}`
      + (viaNumber ? '+crawlOrganizationNumber' : '+crawlName'),
    containsPersonalData: Boolean(crawl.contacts?.length),
  };
  // Keep both freshness trees: blocks come from whichever source supplied them.
  out.freshness = {
    fetchedAt: nowIso(),
    // The page's own modified time is the only source clock either side carries; dropping
    // it left 218 4H blocks with an assertedAt and nothing to show where it came from.
    sourceUpdatedAt: crawl.freshness?.sourceUpdatedAt ?? registry.freshness?.sourceUpdatedAt,
    blocks: { ...(registry.freshness?.blocks ?? {}), ...(crawl.freshness?.blocks ?? {}) },
  };
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!slug) {
    Logger.error('usage: npm run reconcile -- <organisation-slug> [--dry-run]');
    process.exit(1);
  }
  const dir = path.join(DATA_DIR, slug);
  const registryFile = path.join(dir, 'chapters.registry.json');
  const crawlFile = path.join(dir, 'chapters.crawl.json');

  const leftovers = args.includes('--leftovers');
  const current = leftovers ? readCollection<Chapter>(path.join(dir, 'chapters.json'))?.items ?? [] : [];
  // Everything that is not a leftover is kept as it is - BOTH rows, and rows outside the two
  // sources such as an UNRECONCILED national body.
  const kept = current.filter((c) => !['REGISTRY_ONLY', 'SOURCE_ONLY'].includes(c.provenance?.reconciliation ?? ''));
  const registry = leftovers ? current.filter((c) => c.provenance?.reconciliation === 'REGISTRY_ONLY')
    : readCollection<Chapter>(registryFile)?.items;
  const crawl = leftovers ? current.filter((c) => c.provenance?.reconciliation === 'SOURCE_ONLY')
    : readCollection<Chapter>(crawlFile)?.items;
  if (!registry || !crawl) {
    Logger.error(`need both ${path.basename(registryFile)} and ${path.basename(crawlFile)}`);
    Logger.error('run `npm run chapters` and `npm run nks` first, keeping each output');
    process.exit(1);
  }

  // Derive the organisation's own name tokens once, from the data rather than a constant.
  const orgName = registry.find((r) => r.organization?.name)?.organization?.name ?? '';
  const orgTokens = orgName.toUpperCase().replace(/[^A-ZÆØÅ]+/g, ' ')
    .split(' ').filter(Boolean);
  if (orgTokens.length) Logger.info(`  stripping organisation tokens: ${orgTokens.join(', ')}`);

  const byKey = new Map<string, Chapter[]>();
  const byOrgnr = new Map<string, Chapter[]>();
  const byBase = new Map<string, Chapter[]>();
  const byTokenSet = new Map<string, Chapter[]>();
  for (const c of crawl) {
    const ts = tokenSetKey(c.name, orgTokens);
    if (!byTokenSet.has(ts)) byTokenSet.set(ts, []);
    byTokenSet.get(ts)!.push(c);
    const k = matchKey(c.name, orgTokens);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
    const o = digits(c.organizationNumber);
    if (o) {
      if (!byOrgnr.has(o)) byOrgnr.set(o, []);
      byOrgnr.get(o)!.push(c);
    }
    // A place-qualified crawl name also gets indexed WITHOUT the place. The two sources
    // disagree about whether the town belongs in the name, and disagree inconsistently:
    // Brreg holds 'AKTIVITETSHUSET BJERKE' (no town) beside 'AKTIVITETSHUSET HAUGESUND'
    // (town), for units the site calls 'Aktivitetshuset Bjerke, Oslo' and
    // 'Aktivitetshuset, Haugesund'. One key cannot satisfy both.
    const base = c.municipality ? matchKey(c.name, [...orgTokens, up(c.municipality)]) : '';
    if (base && base !== k) {
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base)!.push(c);
    }
  }

  const out: Chapter[] = [...kept];
  const rows: string[] = ['reconciliation,chapterId,name,organizationNumber,sourceUrl'];
  const newPairs: string[] = [];
  const used = new Set<Chapter>();
  const counts: Record<Reconciliation, number> =
    { BOTH: 0, SOURCE_ONLY: 0, REGISTRY_ONLY: 0, UNRECONCILED: 0 };

  let byNumber = 0;
  let viaBase = 0;
  let viaTokenSet = 0;
  for (const r of registry) {
    // Pass 1: the organisation number, when both sides carry one.
    const rn = digits(r.organizationNumber);
    let hit = rn ? (byOrgnr.get(rn) ?? []).find((c) => !used.has(c)) : undefined;
    const viaNumber = Boolean(hit);
    // Pass 2: the normalised name.
    if (!hit) {
      const candidates = byKey.get(matchKey(r.name, orgTokens)) ?? [];
      hit = candidates.find((c) => !used.has(c));
    }
    // Pass 3: the crawl name with its town removed, and ONLY when that leaves exactly one
    // candidate. 'Aktivitetshuset, Haugesund' and 'Aktivitetshuset, Sola' both reduce to
    // 'AKTIVITETSHUSET', so an ambiguous base key would hand a registry row whichever unit
    // happened to be indexed first — a wrong town, silently.
    if (!hit) {
      const base = byBase.get(matchKey(r.name, orgTokens)) ?? [];
      const free = base.filter((c) => !used.has(c));
      if (base.length === 1 && free.length === 1) { hit = free[0]; viaBase += 1; }
    }
    // Pass 4: word order, 'i' and the genitive -s ignored - one candidate only.
    if (!hit) {
      const set = byTokenSet.get(tokenSetKey(r.name, orgTokens)) ?? [];
      const free = set.filter((c) => !used.has(c));
      if (set.length === 1 && free.length === 1) { hit = free[0]; viaTokenSet += 1; }
    }
    if (hit) {
      used.add(hit);
      if (viaNumber) byNumber += 1;
      const m = merge(r, hit, viaNumber);
      if (leftovers) newPairs.push(`${r.name}  <->  ${hit.name}`);
      out.push(m);
      counts.BOTH += 1;
      rows.push(['BOTH', m.id, `"${m.name}"`, m.organizationNumber ?? '',
                 m.provenance?.sourceUrl ?? ''].join(','));
    } else {
      // A registry entry with no page: a dormant registration, or a gap in the source.
      const m: Chapter = { ...r, provenance: { ...r.provenance!, reconciliation: 'REGISTRY_ONLY' } };
      out.push(m);
      counts.REGISTRY_ONLY += 1;
      rows.push(['REGISTRY_ONLY', m.id, `"${m.name}"`, m.organizationNumber ?? '', ''].join(','));
    }
  }
  for (const c of crawl) {
    if (used.has(c)) continue;
    // A page with no registry entry: a real unit that is not a separate legal entity.
    const m: Chapter = { ...c, provenance: { ...c.provenance!, reconciliation: 'SOURCE_ONLY' } };
    out.push(m);
    counts.SOURCE_ONLY += 1;
    rows.push(['SOURCE_ONLY', m.id, `"${m.name}"`, '', m.provenance?.sourceUrl ?? ''].join(','));
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const collection: Collection<Chapter> = {
    items: out,
    extract: {
      sourceId: `${slug}-reconciled`,
      method: 'MANUAL',
      fetchedAt: nowIso(),
      extractorVersion: '0.4.0',
      pagesAttempted: registry.length + crawl.length,
      pagesParsed: out.length,
    },
  };

  const total = out.length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  Logger.info(`\n  registry ${registry.length}  +  crawl ${crawl.length}  ->  ${total} chapters\n`);
  Logger.info(`    BOTH           ${String(counts.BOTH).padStart(4)}  ${pct(counts.BOTH).padStart(6)}   registry + page agree`);
  Logger.info(`                   ${String(byNumber).padStart(4)}          of those matched on organisation number`);
  if (viaTokenSet) Logger.info(`                   ${String(viaTokenSet).padStart(4)}          of those matched by token set (pass 4)`);
  if (viaBase) Logger.info(`                   ${String(viaBase).padStart(4)}          of those matched after removing the town`);
  Logger.info(`    REGISTRY_ONLY  ${String(counts.REGISTRY_ONLY).padStart(4)}  ${pct(counts.REGISTRY_ONLY).padStart(6)}   registered, no page`);
  Logger.info(`    SOURCE_ONLY    ${String(counts.SOURCE_ONLY).padStart(4)}  ${pct(counts.SOURCE_ONLY).padStart(6)}   page, no registration`);

  const has = (f: string) => out.filter((c) => (c as any)[f]).length;
  Logger.info(`\n    organizationNumber ${String(has('organizationNumber')).padStart(4)}`
    + `   coordinates ${String(has('coordinates')).padStart(4)}`
    + `   activities ${String(has('activities')).padStart(4)}`
    + `   contacts ${String(has('contacts')).padStart(4)}`);

  if (leftovers) {
    Logger.info(`\n  --leftovers: ${kept.length} rows kept as they were; ${newPairs.length} new pair(s):`);
    for (const p of newPairs) Logger.info(`    ${p}`);
  }
  if (dryRun) {
    Logger.info('\n  --dry-run: nothing written');
    return;
  }
  writeCollection(path.join(dir, 'chapters.json'), collection);
  fs.writeFileSync(path.join(dir, 'reconciliation.csv'), `${rows.join('\n')}\n`);
  Logger.info(`\n  wrote ${slug}/chapters.json and reconciliation.csv`);
}

main();
