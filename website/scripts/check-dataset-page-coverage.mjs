#!/usr/bin/env node
/**
 * Every published api_v1 relation has a dataset page.
 *
 * DRIFT-GATE: none — this is a CHECKER, not a generator. It writes nothing.
 *
 * 🔴 WHY. On 2026-09-23 there were 19 published relations and 17 dataset
 * pages. `bufdir_indicator_alias` and `meta_dimensions` were in the OpenAPI
 * document and in meta_endpoints — so a MACHINE found them and a PERSON
 * browsing /datasets could not (urb-agents #1428, from Terje asking why one
 * page had a "Try at /api" link and others did not).
 *
 * 🔵 It was never a judgement about those two relations. The page list was
 * derived from the LINEAGE csv — "each mart that consumes at least one raw
 * source" — and both are built from seeds, so they had zero lineage rows and
 * fell out. A relation with no source behind it disappears from every
 * source-derived view, which is the same root cause as #1427.
 *
 * ⚠️ NO ERROR-WATCHING CHECK CAN SEE THIS. Nothing 404s; the page simply is
 * not there. Fourth defect of that shape this week, after the empty <img src>,
 * the undeclared relations and the missing URLs.
 *
 * 🔵 Repo-derivable: compares the generated registry against
 * seeds/sources/api_v1_relations.csv, which is the authority on what is
 * published. No network, so it belongs in the pure-repo gates.
 *
 * ⚠️ If a relation should DELIBERATELY have no page, that is a decision and it
 * needs saying out loud — add it to EXEMPT below with the reason, the same way
 * generators declare DRIFT-GATE in their own source. An empty list today is
 * the honest state: nobody has decided to hide anything.
 *
 * Exit: 0 every relation has a page · 1 one does not · 2 cannot check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = resolve(WEBSITE_DIR, 'src', 'data', 'sources-registry.json');
const RELATIONS = resolve(WEBSITE_DIR, '..', 'atlas-data', 'dbt', 'seeds', 'sources', 'api_v1_relations.csv');

/** relation_name -> why it is deliberately not on the site */
const EXEMPT = new Map([]);

for (const [label, f] of [['registry', REGISTRY], ['relations seed', RELATIONS]]) {
  if (!existsSync(f)) {
    console.error(`✗ CANNOT CHECK: ${label} not found at ${f}.`);
    process.exit(2);
  }
}

const published = readFileSync(RELATIONS, 'utf-8')
  .split(/\r?\n/)
  .filter((l) => l.length > 0)
  .slice(1)
  .map((l) => l.split(',')[0])
  .filter(Boolean);

if (published.length === 0) {
  console.error('✗ CANNOT CHECK: the relations seed yielded zero rows. This check cannot');
  console.error('  pass by finding nothing to check.');
  process.exit(2);
}

const pages = new Set((JSON.parse(readFileSync(REGISTRY, 'utf8')).views ?? []).map((v) => v.api_v1_name));
const missing = published.filter((r) => !pages.has(r) && !EXEMPT.has(r));
const orphan = [...pages].filter((p) => !published.includes(p));

if (missing.length > 0 || orphan.length > 0) {
  if (missing.length > 0) {
    console.error(`✗ ${missing.length} published relation(s) have no dataset page:`);
    for (const r of missing) console.error(`    ${r}`);
    console.error('  A machine finds these in the OpenAPI document; a person browsing /datasets cannot.');
    console.error('  Nothing 404s — the page is simply absent, so no error-watching check sees it.');
  }
  if (orphan.length > 0) {
    console.error(`✗ ${orphan.length} dataset page(s) describe nothing published:`);
    for (const p of orphan) console.error(`    ${p}`);
  }
  process.exit(1);
}

const note = EXEMPT.size > 0 ? `, ${EXEMPT.size} deliberately exempt` : '';
console.log(`  ✓ all ${published.length} published relations have a dataset page${note}`);
