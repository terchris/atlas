/**
 * file: ingest/src/sources/export-atlas.ts
 * description: Export the research dataset in Atlas's shape - dbt seed CSVs plus a private file.
 * output: <out>/public/research_chapters.csv              → Atlas dbt/seeds/ (public repo)
 *         <out>/private/research_contacts.json            → atlas-private-data-repo (never public)
 *
 * Atlas (terchris/atlas) takes curated research data the way it takes dim_ngo: a committed
 * CSV that dbt seeds into marts and a supply__research_* model reshapes into dim_chapter.
 * Column names, value vocabularies and id formats are Atlas's, not this research's:
 *
 *   chapter_id        '<ngo slug>-<key>'   ('redcross:992695994' → 'redcross-992695994'),
 *                     the form Atlas already uses ('redcross-' || branch_id)
 *   chapter_level     national / regional / local / related_entity (lower case, as Atlas)
 *
 * ⚠️ The Atlas repository is PUBLIC. Decision 3 Oct 2026 (owner): published contact persons
 * are collected and handed over, but through Atlas's private data path, not the public repo.
 * So anything that names a person is split out here, at the boundary:
 *   - every Contact (3 550)                         → private file
 *   - a chapter e-mail on a consumer mail domain    → private file; blank in the public CSV
 *     (12, all Folkehjelp - a volunteer's own gmail used as the chapter's address)
 *   - an address line 'c/o <name>'                  → private file; blank in the public CSV
 *   - a chapter phone that is a Norwegian MOBILE      → private file; blank in the public CSV
 *     (407 of 594: a lokallag's "phone" is in practice its leader's own mobile - LHL 244,
 *     Frelsesarmeen 85, Folkehjelp 77). Landlines stay: they belong to premises.
 * The public CSV states which fields were withheld, per row (`withheld_fields`), so a blank
 * is never mistaken for "not published".
 *
 * Refuses to write when: an id collides after mapping, a parent does not resolve, a name or
 * contact carries markup (the N.K.S. parser defect), or an organisation is unknown to Atlas.
 *
 *   npm run export:atlas -- <out-dir>        (default ../handover/atlas)
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, NGO_ROOT, readCollection } from '../lib/io';
import type { Chapter, Collection } from '../lib/types';

const CONSUMER_MAIL = /@(gmail\.com|googlemail\.com|hotmail\.(com|no|co\.uk)|online\.no|outlook\.(com|no)|icloud\.(com|no)|me\.com|live\.(no|com)|yahoo\.(no|com)|msn\.com|getmail\.no|frisurf\.no|broadpark\.no|lyse\.net|altibox\.no|c2i\.net|ebnett\.no|start\.no|mail\.com|sol\.no|tele2\.no|chello\.no|bluezone\.no|haugnett\.no|enivest\.net|tdcadsl\.no|kvamnet\.no|ntebb\.no)$/i;
const CARE_OF = /\bc\/o\b/i;
/** A Norwegian mobile: 8 digits starting with 4 or 9, after an optional +47. */
const isMobile = (p: string) => /^[49]\d{7}$/.test(p.replace(/\D/g, '').replace(/^47(?=\d{8}$)/, ''));
const MARKUP = /[<>]|class=|field--|field__/;

const COLUMNS = [
  'chapter_id', 'ngo_orgnr', 'chapter_level', 'parent_chapter_id', 'chapter_orgnr', 'name',
  'chapter_type', 'kommune_nr', 'is_active', 'postal_address_line1', 'postal_code', 'post_office',
  'phone', 'email', 'web', 'latitude', 'longitude', 'registration', 'unit_kind', 'reconciliation',
  'confidence', 'parent_method', 'source_url', 'research_id', 'fetched_at', 'withheld_fields',
] as const;
type Row = Record<(typeof COLUMNS)[number], string>;

/** 'redcross:992695994' → 'redcross-992695994'. The slug already prefixes every research id. */
const atlasId = (id: string) => id.replace(':', '-');
const lower = (v?: string) => (v ? v.toLowerCase() : '');

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function main(): void {
  const out = path.resolve(process.argv[2] ?? path.join(NGO_ROOT, 'handover', 'atlas'));
  const orgs = readCollection<{ id: string; organizationNumber: string }>(
    path.join(DATA_DIR, '_organizations', 'organizations.json'))?.items ?? [];
  const orgnrOf = new Map(orgs.map((o) => [o.id, o.organizationNumber]));

  const rows: Row[] = [];
  const contacts: unknown[] = [];
  const withheld: unknown[] = [];
  const problems: string[] = [];
  // Contact defects block only the private file: the public seed carries no person.
  const contactProblems = new Set<string>();

  for (const slug of fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_')).sort()) {
    const col = readCollection<Chapter>(path.join(DATA_DIR, slug, 'chapters.json')) as Collection<Chapter> | undefined;
    if (!col) continue;
    const ids = new Set(col.items.map((c) => c.id));
    const ngoOrgnr = orgnrOf.get(slug);
    if (!ngoOrgnr) { problems.push(`${slug}: organisation not in organizations.json`); continue; }

    for (const c of col.items) {
      if (c.parent && !ids.has(c.parent.id)) problems.push(`${c.id}: parent ${c.parent.id} does not resolve`);
      if (MARKUP.test(c.name)) problems.push(`${c.id}: markup in name`);

      const held: string[] = [];
      let email = c.email ?? '';
      if (CONSUMER_MAIL.test(email)) { held.push('email'); withheld.push({ chapter_id: atlasId(c.id), field: 'email', value: email }); email = ''; }
      let phone = c.phone ?? '';
      if (phone && isMobile(phone)) { held.push('phone'); withheld.push({ chapter_id: atlasId(c.id), field: 'phone', value: phone }); phone = ''; }
      let line1 = c.address?.line1 ?? '';
      if (CARE_OF.test(line1)) { held.push('postal_address_line1'); withheld.push({ chapter_id: atlasId(c.id), field: 'postal_address_line1', value: line1 }); line1 = ''; }

      for (const p of c.contacts ?? []) {
        const name = `${p.givenName ?? ''} ${p.familyName ?? ''}`;
        if (MARKUP.test(name)) { contactProblems.add(slug); continue; }
        contacts.push({ chapter_id: atlasId(c.id), ...p });
      }

      const prov = c.provenance;
      rows.push({
        chapter_id: atlasId(c.id),
        ngo_orgnr: ngoOrgnr,
        chapter_level: lower(c.level),
        parent_chapter_id: c.parent ? atlasId(c.parent.id) : '',
        chapter_orgnr: c.organizationNumber ?? '',
        name: c.name,
        chapter_type: c.chapterType ?? '',
        kommune_nr: c.municipalityNumber ?? '',
        is_active: c.isActive === false ? 'false' : 'true',
        postal_address_line1: line1,
        postal_code: c.address?.postalCode ?? '',
        post_office: c.address?.postalPlace ?? '',
        phone,
        email,
        web: c.website ?? '',
        latitude: c.coordinates ? String(c.coordinates.latitude) : '',
        longitude: c.coordinates ? String(c.coordinates.longitude) : '',
        registration: lower(c.registration),
        unit_kind: lower(c.unitKind),
        reconciliation: lower(prov?.reconciliation),
        confidence: lower(prov?.confidence),
        parent_method: lower(prov?.parentMethod),
        source_url: prov?.sourceUrl ?? '',
        research_id: c.id,
        fetched_at: c.freshness?.fetchedAt ?? '',
        withheld_fields: held.join(' '),
      });
    }
  }

  const dup = rows.map((r) => r.chapter_id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) problems.push(`duplicate chapter_id after mapping: ${[...new Set(dup)].slice(0, 5).join(', ')}`);

  if (problems.length) {
    Logger.error(`refusing to export - ${problems.length} problem(s):`);
    for (const p of [...new Set(problems)].slice(0, 15)) Logger.error(`  ${p}`);
    process.exit(1);
  }

  rows.sort((a, b) => a.chapter_id.localeCompare(b.chapter_id));
  fs.mkdirSync(path.join(out, 'public'), { recursive: true });
  fs.mkdirSync(path.join(out, 'private'), { recursive: true });
  fs.writeFileSync(path.join(out, 'public', 'research_chapters.csv'),
    `${[COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((k) => csvField(r[k])).join(','))].join('\n')}\n`);
  Logger.info(`  public  research_chapters.csv   ${rows.length} chapters`);
  if (contactProblems.size) {
    // Not written at all rather than written partially - a private file missing one NGO's
    // contacts would read as "that NGO publishes none".
    Logger.warn(`  private research_contacts.json  NOT written: contact names carry markup in `
      + `${[...contactProblems].join(', ')} - re-parse (NGO_FROM_CACHE=1) or re-crawl first`);
  } else {
    fs.writeFileSync(path.join(out, 'private', 'research_contacts.json'),
      `${JSON.stringify({ contacts, withheld }, null, 2)}\n`);
    Logger.info(`  private research_contacts.json  ${contacts.length} contacts, ${withheld.length} withheld chapter fields`);
  }
}

main();
