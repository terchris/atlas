/**
 * file: ingest/src/sources/build-activity-catalogue.ts
 * description: Derive data/<org>/activities.json from the activities already on chapters.
 * output: data/<org>/activities.json
 *
 * ⚠️ WHY THIS EXISTS. A chapter's `activities[]` carries `definition.id`, pointing at the
 * canonical description of that activity. Two organisations were writing those references
 * with nothing to resolve them to:
 *
 *   nasjonalforeningen  470 references -> 0 definitions
 *   frelsesarmeen        38 references -> 0 definitions
 *
 * 508 dangling references, and NOTHING caught them: each file validates on its own, because
 * JSON Schema cannot express "this id must exist in another document". Referential integrity
 * between collections has to be checked separately, which `npm run check:integrity` (in schemas/build) now does.
 *
 * The catalogue is DERIVED, not crawled - it is the distinct set of definitions the chapters
 * already reference, so it cannot invent an activity no chapter provides. Where a crawler
 * harvests real catalogue pages (nks-activities.ts, kirkens-bymisjon-tilbud.ts) that richer
 * file wins and this script leaves it alone.
 *
 *   npm run catalogue            # every organisation missing one
 *   npm run catalogue -- --force # rebuild even where a file exists
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { detectLanguage } from '../lib/text';
import { DATA_DIR, nowIso, readCollection, writeCollection } from '../lib/io';
import type { ActivityDefinition, Chapter, Collection } from '../lib/types';

function main(): void {
  const force = process.argv.includes('--force');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const slugs = (only.length ? only : fs.readdirSync(DATA_DIR)).filter((d) => !d.startsWith('_'));

  for (const slug of slugs) {
    const chapters = readCollection<Chapter>(path.join(DATA_DIR, slug, 'chapters.json'))?.items;
    if (!chapters) continue;
    const out = path.join(DATA_DIR, slug, 'activities.json');
    const existing = readCollection<ActivityDefinition>(out);

    // Group every provision by the definition it points at.
    const group = new Map<string, { name: string; chapters: number; texts: Map<string, { n: number; url?: string; on: Set<string> }>; description?: string; url?: string }>();
    for (const c of chapters) {
      for (const a of c.activities ?? []) {
        const id = a.definition?.id;
        if (!id) continue;
        const g = group.get(id) ?? { name: a.definition?.name ?? a.name, chapters: 0, texts: new Map<string, { n: number; url?: string; on: Set<string> }>() };
        g.chapters += 1;
        if (a.description) {
          // Counted per CHAPTER: one chapter with six date pages of the same text (LHL Andøy's
          // bingo) is one chapter's text, not the organisation's shared one.
          const t = g.texts.get(a.description) ?? { n: 0, url: a.sourceUrl, on: new Set<string>() };
          t.on.add(c.id); t.n = t.on.size;
          g.texts.set(a.description, t);
        }
        group.set(id, g);
      }
    }
    if (!group.size) continue;
    /**
     * The definition's description. Chapters that describe an activity in their own words (Røde
     * Kors: "Besøkstjenesten i Bergen …") are describing THEIR provision, which stays on the
     * chapter. The definition gets a text only where it is the organisation's shared one:
     * the same text, verbatim, on 3 or more chapters (Røde Kors's hjelpekorps paragraph is on 49
     * branch pages), or the only text when one chapter provides it. Earlier this took the LONGEST
     * text, which made one branch's local text - with its coordinator's name - the national one.
     */
    // A rebuild must not lose a shared text because an earlier run already removed the chapters'
    // copies of it (below): keep the existing definition's text when the chapters no longer repeat it.
    const before = new Map((existing?.items ?? []).map((d) => [d.id, d]));
    for (const [id, g] of group) {
      const [best] = [...g.texts].sort((x, y) => y[1].n - x[1].n);
      if (best && (best[1].n >= 3 || g.chapters === 1)) { g.description = best[0]; g.url = best[1].url; }
      else if (before.get(id)?.description) { g.description = before.get(id)!.description; g.url = before.get(id)!.descriptionSourceUrl; }
    }
    if (existing && !force) {
      const have = new Set(existing.items.map((d) => d.id));
      const missing = [...group.keys()].filter((id) => !have.has(id));
      if (!missing.length) { Logger.info(`  ${slug.padEnd(20)} catalogue already complete`); continue; }
      Logger.warn(`${slug}: ${missing.length} referenced definition(s) missing from an `
        + 'existing catalogue; run with --force to rebuild');
      continue;
    }

    const org = chapters.find((c) => c.organization)?.organization;
    const items: ActivityDefinition[] = [...group.entries()].map(([id, g]): ActivityDefinition => ({
      id,
      organization: org,
      name: g.name,
      description: g.description,
      descriptionSourceUrl: g.description ? g.url : undefined,
      descriptionLanguage: g.description ? detectLanguage(g.description) : undefined,
      descriptionWordCount: g.description ? g.description.split(/\s+/).length : undefined,
      descriptionRetrievedAt: g.description ? nowIso() : undefined,
      isService: true,
      // One chapter running it means locally defined; several means it is shared across the
      // organisation. Inferred, so the evidence is stated rather than implied.
      // An extractor that knows the organisation's national list marks the rest `<org>:local-…`
      // (redcross-branches.ts). Otherwise: several chapters means shared, one means local -
      // inferred, so the evidence is stated rather than implied.
      origin: id.includes(':local-') ? 'LOCAL' : g.chapters > 1 || slug === 'redcross' ? 'NATIONAL' : 'LOCAL',
      originEvidence: id.includes(':local-')
        ? `a branch's own activity, not one of the organisation's national activities; ${g.chapters} chapter(s)`
        : slug === 'redcross' ? `one of Røde Kors's national activities (local name mapped by rule); ${g.chapters} chapter(s)`
          : `provided by ${g.chapters} chapter(s) in this dataset`,
      chapterCount: g.chapters,
      // No organisation here publishes a taxonomy; saying UNMAPPED is the honest claim.
      serviceCategory: { assignmentMethod: 'UNMAPPED', confidence: 'LOW' },
      provenance: {
        sourceUrl: g.url ?? chapters[0]?.provenance?.sourceUrl ?? '',
        confidence: 'MEDIUM',
        reconciliation: 'SOURCE_ONLY',
        idOrigin: 'DERIVED',
        parentOrigin: 'UNSTATED',
        matchMethod: 'derivedFromChapterProvisions',
        containsPersonalData: false,
      },
      freshness: { fetchedAt: nowIso() },
    })).sort((a, b) => a.name.localeCompare(b.name, 'nb'));

    // "Never a copy of the definition's description" (activity.yaml): a chapter that pastes the
    // organisation's shared text keeps nothing of its own, so its copy is removed.
    const shared = new Map(items.filter((i) => i.description).map((i) => [i.id, i.description!]));
    let copies = 0;
    for (const c of chapters) for (const a of c.activities ?? []) {
      if (a.definition?.id && a.description && shared.get(a.definition.id) === a.description) {
        delete a.description; copies += 1;
      }
    }
    if (copies) {
      const chFile = path.join(DATA_DIR, slug, 'chapters.json');
      const col = readCollection<Chapter>(chFile)!;
      col.items = chapters;
      writeCollection(chFile, col);
      Logger.info(`  ${slug.padEnd(20)} ${copies} chapter descriptions were copies of the shared text - removed`);
    }

    writeCollection(out, {
      items,
      extract: {
        sourceId: `${slug}-activity-catalogue`,
        method: 'MANUAL',
        fetchedAt: nowIso(),
        extractorVersion: '0.1.0',
        pagesAttempted: chapters.length,
        pagesParsed: items.length,
      },
    } as Collection<ActivityDefinition>);

    const nat = items.filter((i) => i.origin === 'NATIONAL').length;
    Logger.info(`  ${slug.padEnd(20)} ${String(items.length).padStart(3)} definitions`
      + ` from ${[...group.values()].reduce((n, g) => n + g.chapters, 0)} provisions`
      + `   NATIONAL ${nat}  LOCAL ${items.length - nat}`
      + `   with description ${items.filter((i) => i.description).length}`);
  }
}

main();
