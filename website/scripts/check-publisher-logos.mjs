#!/usr/bin/env node
/**
 * Every publisher in the registry has a logo, and the file it names exists.
 *
 * DRIFT-GATE: none — this is a CHECKER, not a generator. It writes nothing.
 *
 * 🔴 WHY. Brønnøysundregistrene had no logo, and the page did not break — it
 * rendered `<img alt="Brønnøysundregistrene logo" src="">` with naturalWidth
 * 0 and made ZERO failed requests. Blank space on every brreg dataset page,
 * and brreg is the source behind brreg_enhet, the largest relation Atlas
 * publishes. Røde Kors reported it (urb-agents #1425).
 *
 * ⚠️ AN EMPTY src PRODUCES NO ERROR. The published-URL gate (#435) walks the
 * URLs the registry CONTAINS; this is a URL the registry LACKS. No
 * error-watching check can see an absence — that is ops-dev's framing and it
 * is the reason this exists as a separate question rather than an extension.
 *
 * 🔵 Repo-derivable: the logos are committed, so this needs no network and can
 * sit in the pure-repo gates, unlike check-published-urls.mjs.
 *
 * Exit: 0 all present · 1 a publisher has no logo or a missing file · 2 cannot check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = resolve(WEBSITE_DIR, 'src', 'data', 'sources-registry.json');

if (!existsSync(REGISTRY)) {
  console.error(`✗ CANNOT CHECK: ${REGISTRY} not found — run \`npm run sources:generate\`.`);
  process.exit(2);
}
const publishers = JSON.parse(readFileSync(REGISTRY, 'utf8')).publishers ?? [];
if (publishers.length === 0) {
  console.error('✗ CANNOT CHECK: the registry lists zero publishers. This check cannot');
  console.error('  pass by finding nothing.');
  process.exit(2);
}

const problems = [];
for (const p of publishers) {
  if (!p.logo) {
    problems.push(`${p.id}: no logo field — the page renders <img src=""> and nothing 404s`);
    continue;
  }
  const file = resolve(WEBSITE_DIR, 'static', p.logo.replace(/^\//, ''));
  if (!existsSync(file)) {
    problems.push(`${p.id}: logo ${p.logo} is declared but static/${p.logo.replace(/^\//, '')} does not exist`);
    continue;
  }
  const bytes = readFileSync(file);
  if (bytes.length === 0) problems.push(`${p.id}: ${p.logo} is zero bytes`);
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} publisher logo problem(s):`);
  for (const t of problems) console.error(`    ${t}`);
  console.error('  A missing logo is invisible: an empty src makes no request and raises no error.');
  process.exit(1);
}
console.log(`  ✓ all ${publishers.length} publishers have a logo and the file exists`);
