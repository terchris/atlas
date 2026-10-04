/**
 * file: ingest/src/sources/redact-descriptions.ts
 * description: A public version of every activity description, with people taken out.
 * output: `descriptionPublic`, `summaryPublic`, `descriptionNeedsReview` in data/<org>/activities.json
 *         data/_private/redactions.csv - what was taken out (holds names: never published)
 *
 * `description` stays verbatim - it is the research evidence and Atlas's private_raw. The public
 * text replaces phone numbers, e-mail addresses and names with [telefon], [e-post], [navn]
 * (lib/redact.ts) and is shown with a link to the organisation's page, `descriptionSourceUrl`,
 * for anyone who wants the original. A text where something still looks like a name gets
 * `descriptionNeedsReview: true` and is not for public use until a person has checked it.
 *
 * First names come from every contact the NGOs publish (chapters.json, all organisations),
 * so the list is Norwegian names as they actually occur in this sector.
 *
 *   npm run redact          (after npm run descriptions)
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection, writeCollection, omitEmpty } from '../lib/io';
import { redact, type Redaction } from '../lib/redact';
import type { ActivityDefinition } from '../lib/types';

interface ContactLike { givenName?: string; familyName?: string; }
interface ChapterLike { contacts?: ContactLike[]; }

const clean = (s?: string) => (s && !/[<>="]|field--/.test(s) ? s.trim() : undefined);   // N.K.S. names with markup are unusable

function main(): void {
  const orgs = fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_')).sort();
  const known = new Map<string, string[]>();
  const firstNames = new Set<string>();
  for (const org of orgs) {
    const chapters = readCollection<ChapterLike>(path.join(DATA_DIR, org, 'chapters.json'))?.items ?? [];
    const names: string[] = [];
    for (const c of chapters) for (const p of c.contacts ?? []) {
      const g = clean(p.givenName); const f = clean(p.familyName);
      if (g) for (const t of g.split(/\s+/)) if (/^[A-ZÆØÅÉ][a-zæøåéü-]{1,}$/.test(t)) firstNames.add(t);
      if (g && f) names.push(`${g} ${f}`);
    }
    known.set(org, names);
  }

  // Statistics Norway's list of first names (table 10501, NLOD), saved in data/_reference/.
  const ssb = path.join(DATA_DIR, '_reference', 'ssb-10501-first-names.csv');
  const fromContacts = firstNames.size;
  if (fs.existsSync(ssb)) for (const line of fs.readFileSync(ssb, 'utf8').split('\n').slice(1)) {
    const name = line.split(',')[1]?.trim();
    if (name) for (const t of name.split('-')) firstNames.add(t);
  }
  Logger.info(`first names: ${fromContacts} from published contacts + SSB table 10501 = ${firstNames.size}`);
  // Surnames carried by 200 or more people (SSB table 12891, NLOD).
  const surnames = new Set<string>();
  const ssbSur = path.join(DATA_DIR, '_reference', 'ssb-12891-etternavn.csv');
  if (fs.existsSync(ssbSur)) for (const line of fs.readFileSync(ssbSur, 'utf8').split('\n').slice(1)) {
    const name = line.split(',')[1]?.trim();
    if (name) surnames.add(name);
  }
  Logger.info(`surnames: ${surnames.size} from SSB table 12891`);

  // Words that are not people: kommune names (Atlas's dim_kommune, as saved by the research) and every
  // word in the NGOs' own chapter and activity names.
  const notPeople = new Set<string>();
  const words = (v: unknown) => { if (typeof v === 'string') for (const w of v.match(/[A-ZÆØÅÉ][a-zæøåéü]+/g) ?? []) notPeople.add(w); };
  const kommuner = path.join(DATA_DIR, '_reference', 'kommuner.json');
  if (fs.existsSync(kommuner)) for (const k of JSON.parse(fs.readFileSync(kommuner, 'utf8'))) Object.values(k).forEach(words);
  for (const org of orgs) for (const f of ['chapters.json', 'activities.json']) {
    for (const it of readCollection<Record<string, unknown>>(path.join(DATA_DIR, org, f))?.items ?? []) words(it.name);
  }
  for (const n of firstNames) notPeople.delete(n);           // a first name is never "known not to be a person"

  const log: string[][] = [];
  const total = { texts: 0, review: 0, PHONE: 0, EMAIL: 0, NAME: 0 } as Record<string, number>;
  const byMethod: Record<string, number> = {};
  for (const org of orgs) {
    const file = path.join(DATA_DIR, org, 'activities.json');
    if (!fs.existsSync(file)) continue;
    const col = readCollection<ActivityDefinition>(file)!;
    let review = 0; let changed = 0;
    for (const a of col.items) {
      const out: Redaction[] = [];
      const run = (t?: string) => {
        if (!t) return { text: undefined, needsReview: false, suspects: [] as string[] };
        const r = redact(t, known.get(org) ?? [], firstNames, notPeople, surnames);
        out.push(...r.redactions);
        return r;
      };
      const d = run(a.description);
      const s = run(a.summary);
      a.descriptionPublic = d.text;
      a.summaryPublic = s.text && s.text !== d.text ? s.text : undefined;
      a.descriptionNeedsReview = a.description ? d.needsReview || s.needsReview : undefined;
      if (!a.description) continue;
      total.texts += 1;
      if (a.descriptionNeedsReview) { review += 1; total.review += 1; }
      if (out.length) changed += 1;
      for (const r of out) {
        total[r.kind] += 1;
        byMethod[`${r.kind}/${r.method}`] = (byMethod[`${r.kind}/${r.method}`] ?? 0) + 1;
        log.push([a.id, r.kind, r.method, r.original]);
      }
      for (const sus of [...d.suspects, ...s.suspects]) log.push([a.id, 'SUSPECT', 'REVIEW', sus]);
    }
    writeCollection(file, omitEmpty(col));

    // The texts a chapter wrote about its own provision (Røde Kors: every branch).
    const chFile = path.join(DATA_DIR, org, 'chapters.json');
    const chapters = readCollection<{ id: string; activities?: { name: string; description?: string; descriptionPublic?: string; descriptionNeedsReview?: boolean }[] }>(chFile);
    let local = 0; let localReview = 0;
    for (const c of chapters?.items ?? []) for (const a of c.activities ?? []) {
      if (!a.description) { delete a.descriptionPublic; delete a.descriptionNeedsReview; continue; }
      const r = redact(a.description, known.get(org) ?? [], firstNames, notPeople, surnames);
      a.descriptionPublic = r.text;
      a.descriptionNeedsReview = r.needsReview;
      local += 1; if (r.needsReview) localReview += 1;
      for (const x of r.redactions) {
        total[x.kind] += 1;
        byMethod[`${x.kind}/${x.method}`] = (byMethod[`${x.kind}/${x.method}`] ?? 0) + 1;
        log.push([`${c.id}#${a.name}`, x.kind, x.method, x.original]);
      }
      for (const sus of r.suspects) log.push([`${c.id}#${a.name}`, 'SUSPECT', 'REVIEW', sus]);
    }
    if (local && chapters) {
      writeCollection(chFile, omitEmpty(chapters));
      total.texts += local; total.review += localReview;
      Logger.info(`${org.padEnd(20)} + ${local} chapter-level texts, ${localReview} need review`);
    }
    Logger.info(`${org.padEnd(20)} ${col.items.filter((a) => a.description).length} texts, ${changed} with something taken out, ${review} need review`);
  }
  const out = path.join(DATA_DIR, '_private', 'redactions.csv');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  fs.writeFileSync(out, [['activity_id', 'kind', 'method', 'original'], ...log].map((r) => r.map(cell).join(',')).join('\n') + '\n');
  Logger.info(`\n${total.texts} texts: ${total.PHONE} phone numbers, ${total.EMAIL} e-mail addresses, ${total.NAME} names taken out; `
    + `${total.review} texts need review.`);
  Logger.info(`by method: ${Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  Logger.info(`private log -> ${path.relative(process.cwd(), out)} (holds names; never publish)`);
}

main();
