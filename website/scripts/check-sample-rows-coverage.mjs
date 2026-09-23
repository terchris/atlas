#!/usr/bin/env node
/**
 * Every source and every published relation has an entry in
 * sample-rows-snapshot.json.
 *
 * DRIFT-GATE: none — this is a CHECKER, not a generator. It writes nothing.
 *
 * 🔴 WHY. Ten dataset pages show no example rows because the snapshot was
 * generated on 12 May against a local dev API and nothing has regenerated it
 * since. Terje found two of those pages from the outside this morning
 * (urb-agents #1429, item 4 — flagged by ops-dev as unmentioned in my report,
 * which is fair: I read it as belonging to the daily job).
 *
 * ⚠️ IT BELONGS HERE AND NOT IN THE DAGSTER JOB, and the reason is where the
 * file lives. The snapshot is in the website repo; the Dagster image ships
 * atlas-data only and cannot see it. The daily job dereferences the API; this
 * compares two committed artifacts. Different substrate, different check.
 *
 * 🔴 IT IS RED TODAY AND THAT IS CORRECT. The remedy is
 * `npm run sources:snapshot-samples`, which needs an INTERNAL PostgREST that
 * can reach raw.* — the public API exposes api_v1 only, by design. So this is
 * NOT wired into CI: it would be red on every PR for a reason no PR can fix,
 * and a permanently red gate gets switched off. Run it beside the regeneration.
 *
 * Exit: 0 full coverage · 1 something is missing · 2 cannot check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = resolve(WEBSITE_DIR, 'src', 'data', 'sources-registry.json');
const SNAPSHOT = resolve(WEBSITE_DIR, 'src', 'data', 'sample-rows-snapshot.json');

for (const [label, f] of [['registry', REGISTRY], ['snapshot', SNAPSHOT]]) {
  if (!existsSync(f)) {
    console.error(`✗ CANNOT CHECK: ${label} not found at ${f}.`);
    process.exit(2);
  }
}

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

const sources = (reg.sources ?? []).map((s) => s.source_id);
const views = (reg.views ?? []).map((v) => v.api_v1_name);
if (sources.length === 0 || views.length === 0) {
  console.error('✗ CANNOT CHECK: the registry listed zero sources or zero views.');
  process.exit(2);
}

const haveSources = new Set(Object.keys(snap.sources ?? {}));
const haveViews = new Set(Object.keys(snap.views ?? {}));
const missingSources = sources.filter((s) => !haveSources.has(s));
const missingViews = views.filter((v) => !haveViews.has(v));

console.log(`  snapshot generated ${snap.generated_at ?? 'unknown'} from ${snap.source_url ?? 'unknown'}`);
console.log(`  sources ${sources.length - missingSources.length}/${sources.length} · views ${views.length - missingViews.length}/${views.length}`);

if (missingSources.length || missingViews.length) {
  if (missingSources.length) {
    console.error(`✗ ${missingSources.length} source(s) have no sample rows: ${missingSources.join(', ')}`);
  }
  if (missingViews.length) {
    console.error(`✗ ${missingViews.length} view(s) have no sample rows: ${missingViews.join(', ')}`);
  }
  console.error('  Their dataset pages render without an example. Regenerate with');
  console.error('  `npm run sources:snapshot-samples` against an INTERNAL PostgREST —');
  console.error('  the public API serves api_v1 only and cannot see raw.*.');
  process.exit(1);
}
console.log('  ✓ every source and every published relation has sample rows');
