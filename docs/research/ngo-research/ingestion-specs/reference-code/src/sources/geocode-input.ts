/**
 * file: ingest/src/sources/geocode-input.ts
 * description: R9 preparation - every place the research knows for every chapter and activity, in one
 *              file, ready for a geocoder. Nothing is geocoded here.
 * output: data/_geocoding/locations.csv  (+ a summary on stdout)
 *
 * One row per (entity, place we hold for it). The geocoder that comes later is general: it reads this
 * file, not the NGO-specific data, and writes a point and a precision per row. Each row says how
 * precise a point it may ever get (`max_precision`), whatever the geocoder could find:
 *
 *   exact        a visiting address, meeting venue or activity venue the NGO publishes
 *   postal_code  a postal address, or anything from the registry - a registered address is often a
 *                volunteer's home, so it is never placed more precisely than its postal-code area;
 *                a `c/o` line names a person and is capped the same way
 *   kommune      only the municipality is known (kommune centroid)
 *
 * Kinds of row, strongest first:
 *   SITE_ADDRESS     the address on the NGO's own chapter page (addressKind says which kind)
 *   ACTIVITY_VENUE   where an activity happens (LHL's "STED:" line on each activity page)
 *   EXISTING_POINT   coordinates the source already publishes (Sanitetskvinnene) - kept, not redone
 *   REGISTRY_JOIN    the chapter's organisation number, for the consumer to join its own Brreg address
 *                    (Atlas: dim_brreg_enhet); the research does not copy registry addresses
 *   KOMMUNE          the chapter's kommune - always, as the last fallback
 *
 *   npm run geocode-input
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection } from '../lib/io';
import type { Chapter } from '../lib/types';

const COLS = ['location_id', 'ngo', 'entity_type', 'entity_id', 'entity_name', 'location_kind', 'address_kind',
  'line1', 'line2', 'postal_code', 'postal_place', 'municipality_number', 'organization_number',
  'existing_latitude', 'existing_longitude', 'max_precision', 'contains_personal_data', 'source_url'] as const;
type Row = Partial<Record<(typeof COLS)[number], string>>;

const cell = (v?: string) => (v === undefined ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const id = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);

/** LHL's activity pages: the lines between "STED:" and the next blank line ("," lines dropped). */
function venueOf(text?: string): { line1?: string; line2?: string; postal_code?: string; postal_place?: string } | undefined {
  const i = text?.indexOf('STED:') ?? -1;
  if (!text || i < 0) return undefined;
  const lines: string[] = [];
  for (const l of text.slice(i + 5).split('\n').map((x) => x.trim())) {
    if (!l) { if (lines.length) break; continue; }
    if (l === ',') continue;
    lines.push(l.replace(/,$/, ''));
  }
  if (!lines.length) return undefined;
  const joined = lines.join(', ');
  const m = joined.match(/^(.*?),?\s*(\d{4})\s+([^,]+)$/);
  if (m) {
    const parts = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    return { line1: parts[0], line2: parts.slice(1).join(', ') || undefined, postal_code: m[2], postal_place: m[3].trim() };
  }
  return { line1: lines[0], line2: lines.slice(1).join(', ') || undefined };
}

function main(): void {
  const rows: Row[] = [];
  const orgs = fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_')).sort();
  for (const org of orgs) {
    const chapters = readCollection<Chapter>(path.join(DATA_DIR, org, 'chapters.json'))?.items ?? [];
    for (const c of chapters) {
      if (c.level === 'NATIONAL') continue;
      const base: Row = { ngo: org, entity_type: 'chapter', entity_id: c.id, entity_name: c.name,
        municipality_number: c.municipalityNumber, organization_number: c.organizationNumber,
        source_url: c.website ?? c.provenance?.sourceUrl };
      if (c.address && (c.address.line1 || c.address.postalCode)) {
        const co = /\bc\/o\b/i.test(`${c.address.line1 ?? ''} ${c.address.line2 ?? ''}`);
        const exactKind = c.addressKind === 'VISITING' || c.addressKind === 'MEETING_VENUE';
        rows.push({ ...base, location_kind: 'SITE_ADDRESS', address_kind: c.addressKind,
          line1: c.address.line1, line2: c.address.line2, postal_code: c.address.postalCode, postal_place: c.address.postalPlace,
          max_precision: exactKind && !co ? 'exact' : 'postal_code', contains_personal_data: co ? 'true' : 'false',
          location_id: id(c.id, 'SITE_ADDRESS') });
      }
      if (c.coordinates) {
        rows.push({ ...base, location_kind: 'EXISTING_POINT', existing_latitude: String(c.coordinates.latitude),
          existing_longitude: String(c.coordinates.longitude), max_precision: 'exact', contains_personal_data: 'false',
          location_id: id(c.id, 'EXISTING_POINT') });
      }
      if (c.organizationNumber) {
        rows.push({ ...base, location_kind: 'REGISTRY_JOIN', max_precision: 'postal_code', contains_personal_data: 'false',
          location_id: id(c.id, 'REGISTRY_JOIN') });
      }
      // Always kept as the last fallback - a registry record may lack a postal code.
      if (c.municipalityNumber) {
        rows.push({ ...base, location_kind: 'KOMMUNE', max_precision: 'kommune', contains_personal_data: 'false',
          location_id: id(c.id, 'KOMMUNE') });
      }
      for (const a of c.activities ?? []) {
        const v = venueOf(a.description);
        if (!v) continue;
        rows.push({ ngo: org, entity_type: 'activity', entity_id: `${c.id}#${a.name}`, entity_name: a.name,
          location_kind: 'ACTIVITY_VENUE', address_kind: 'MEETING_VENUE', ...v,
          municipality_number: c.municipalityNumber, max_precision: 'exact', contains_personal_data: 'false',
          source_url: a.sourceUrl, location_id: id(c.id, a.name, 'ACTIVITY_VENUE') });
      }
    }
  }
  // One row per place: LHL Andøy's six bingo date pages are one venue.
  const unique = [...new Map(rows.map((r) => [r.location_id, r])).values()];
  rows.length = 0; rows.push(...unique);
  const out = path.join(DATA_DIR, '_geocoding', 'locations.csv');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [COLS.join(','), ...rows.map((r) => COLS.map((k) => cell(r[k])).join(','))].join('\n') + '\n');

  const by = (k: keyof Row) => rows.reduce((m, r) => m.set(r[k] ?? '', (m.get(r[k] ?? '') ?? 0) + 1), new Map<string, number>());
  Logger.info(`${rows.length} location rows -> ${path.relative(process.cwd(), out)}`);
  Logger.info(`  by kind: ${[...by('location_kind')].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  Logger.info(`  by max precision: ${[...by('max_precision')].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const ents = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = `${r.entity_type}`;
    if (!ents.has(k)) ents.set(k, new Set());
    ents.get(k)!.add(r.entity_id!);
  }
  Logger.info(`  entities: ${[...ents].map(([k, v]) => `${k} ${v.size}`).join(' · ')}`);
}

main();
