/**
 * file: ingest/src/sources/derive-fields.ts
 * description: Fields computed from data already on disk - self links and activity aliases.
 * output: rewrites data/<org>/chapters.json, data/<org>/activities.json and
 *         data/_organizations/organizations.json in place
 *
 * ⚠️ WHY. Both fields were declared in the contract and populated on 0 of 4 125 records,
 * which the standard forbids ("expose only fields that carry data"). Neither needs a fetch:
 *
 * - `href`: the standard requires every item to carry its own canonical URL so it is
 *   dereferenceable. It is a function of the id and the route, so it is derived, never
 *   scraped - and recomputed every run, so a renamed route cannot leave stale links.
 * - `aliases`: chapter pages name an activity in their own spelling, and the name a chapter
 *   used is already stored on each provision. 300 N.K.S. chapters write 'Omsorgsber.' and
 *   64 write 'Språkvenn' against the catalogue's 'Språkvennn'. Every distinct provision name
 *   that differs from the definition's canonical name IS an alias, observed rather than
 *   invented.
 *
 * Run after any step that rewrites these files, then `npm run reconciliation-csv`.
 *
 *   npm run derive
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection, writeCollection } from '../lib/io';
import type { ActivityDefinition, Chapter, Collection } from '../lib/types';

/** The first server in schemas/build/constants/openapi-defaults/servers.yaml - production. */
const API_BASE = 'https://atlas.helpers.no';

const link = (route: string, id: string) => `${API_BASE}${route}/${encodeURIComponent(id)
  .replace(/%3A/g, ':')}`;

/** Put href straight after id, so a record still reads id, href, name. */
function withHref<T extends { id: string }>(item: T, href: string): T {
  const { id, ...rest } = item as T & { href?: string };
  delete (rest as { href?: string }).href;
  return { id, href, ...rest } as unknown as T;
}

function main(): void {
  const orgFile = path.join(DATA_DIR, '_organizations', 'organizations.json');
  const orgs = readCollection<{ id: string }>(orgFile);
  if (orgs) {
    orgs.items = orgs.items.map((o) => withHref(o, link('/organization/v1/organizations', o.id)));
    writeCollection(orgFile, orgs);
    Logger.info(`  organizations        ${String(orgs.items.length).padStart(4)} href`);
  }

  for (const org of fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_')).sort()) {
    const chapterFile = path.join(DATA_DIR, org, 'chapters.json');
    const chapters = readCollection<Chapter>(chapterFile);
    if (!chapters) continue;
    const defFile = path.join(DATA_DIR, org, 'activities.json');
    const defs = readCollection<ActivityDefinition>(defFile);
    const defName = new Map((defs?.items ?? []).map((d) => [d.id, d.name]));

    // References carry the same link as the thing they point at. A group has no route
    // (ActivityGroup is not modelled), so a group reference stays {id, name}.
    chapters.items = chapters.items.map((c) => {
      const out = withHref(c, link('/organization/v1/chapters', c.id));
      if (out.organization) {
        out.organization = withHref(out.organization, link('/organization/v1/organizations', out.organization.id));
      }
      for (const a of out.activities ?? []) {
        if (!a.definition?.id) continue;
        a.definition = withHref(a.definition, link('/volunteering/v1/activity-definitions', a.definition.id));
        if (!a.definition.name && defName.has(a.definition.id)) a.definition.name = defName.get(a.definition.id);
      }
      return out;
    });
    writeCollection(chapterFile, chapters as Collection<Chapter>);

    let aliased = 0;
    if (defs) {
      const seen = new Map<string, Set<string>>();
      for (const c of chapters.items) {
        for (const a of c.activities ?? []) {
          const id = a.definition?.id;
          if (!id || !a.name) continue;
          if (!seen.has(id)) seen.set(id, new Set());
          seen.get(id)!.add(a.name.trim());
        }
      }
      defs.items = defs.items.map((d) => {
        const names = [...(seen.get(d.id) ?? [])].filter((n) => n && n !== d.name).sort();
        const out = { ...d } as ActivityDefinition & { organization?: { id: string; href?: string } };
        if (names.length) { out.aliases = names.slice(0, 50); aliased += 1; } else delete out.aliases;
        if (out.organization) {
          out.organization = withHref(out.organization, link('/organization/v1/organizations', out.organization.id));
        }
        return withHref(out, link('/volunteering/v1/activity-definitions', d.id));
      });
      writeCollection(defFile, defs);
    }
    Logger.info(`  ${org.padEnd(20)} ${String(chapters.items.length).padStart(4)} href`
      + (defs ? `   ${defs.items.length} definitions, ${aliased} with aliases` : ''));
  }
}

main();
