#!/usr/bin/env node
/**
 * Every URL the site generates into a page must actually answer.
 *
 * DRIFT-GATE: none — this is a CHECKER, not a generator. It writes nothing.
 * It is enumerated by check-generators-declare-a-drift-gate.sh because that
 * script sweeps website/scripts/*.mjs, and declaring the exemption here is
 * cheaper and more honest than teaching the enumerator about naming.
 *
 * 🔴 WHY THIS EXISTS. On 2026-09-23 all 44 dataset pages printed a
 * "get this data" URL and NONE of them worked: 42 returned 404 and 2 had no
 * URL. They were built from raw table names, and the public API exposes api_v1
 * only. The response is a well-formed PGRST205 naming a schema the reader has
 * never heard of, so it reads as "this dataset does not exist" — which is
 * false. Terje found it on one page (urb-agents #1419).
 *
 * ⚠️ NOTHING COULD HAVE CAUGHT IT FROM THE REPO. The URLs are well-formed,
 * the host is right, the generator ran cleanly, every existing gate was green.
 * The only way to know is to ask the API. That makes this the first Atlas
 * check that needs the network, so it does NOT belong in the pure-repo gates
 * — run it after a deploy, or on a schedule.
 *
 * 🔵 It checks the URLs in the REGISTRY rather than scraping built HTML: the
 * registry is what the pages are generated from, so a failure here names the
 * source rather than the page.
 *
 * Usage:  node scripts/check-published-urls.mjs
 * Exit:   0 all answered · 1 at least one did not · 2 could not check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = resolve(WEBSITE_DIR, 'src', 'data', 'sources-registry.json');

if (!existsSync(REGISTRY)) {
  console.error(`✗ CANNOT CHECK: ${REGISTRY} not found — run \`npm run sources:generate\` first.`);
  process.exit(2);
}
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));

const targets = [
  ...(reg.sources ?? []).filter((s) => s.sample_query).map((s) => [`source ${s.source_id}`, s.sample_query]),
  ...(reg.views ?? []).filter((v) => v.sample_query).map((v) => [`view ${v.view_id}`, v.sample_query]),
];

if (targets.length === 0) {
  console.error('✗ CANNOT CHECK: the registry produced zero URLs. This check cannot pass by');
  console.error('  finding nothing — regenerate the registry, or fix this reader if the shape changed.');
  process.exit(2);
}

// 🔵 Sources with an empty served_as legitimately have NO url. Count them, so
// "41 checked" is never mistaken for "44 pages are fine".
const noUrl = (reg.sources ?? []).filter((s) => !s.sample_query).map((s) => s.source_id);

let failed = 0;
let empty = 0;
for (const [label, url] of targets) {
  let status = 0;
  let rows = -1;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    status = res.status;
    if (status === 200) {
      const body = await res.json().catch(() => null);
      rows = Array.isArray(body) ? body.length : -1;
    }
  } catch (err) {
    console.error(`✗ ${label}: request failed — ${err.message}`);
    console.error(`    ${url}`);
    failed += 1;
    continue;
  }
  if (status !== 200) {
    console.error(`✗ ${label}: HTTP ${status}`);
    console.error(`    ${url}`);
    failed += 1;
  } else if (rows === 0) {
    // Not a failure: a published relation can be legitimately empty, e.g. while
    // its source is parked. Reported so it is visible rather than silent.
    console.log(`  ⚠ ${label}: 200 but zero rows — ${url.split('.com/')[1] ?? url}`);
    empty += 1;
  }
}

console.log(`  checked ${targets.length} published URLs · ${failed} failed · ${empty} returned no rows`);
if (noUrl.length > 0) {
  console.log(`  ${noUrl.length} source(s) correctly print no URL (empty served_as): ${noUrl.join(', ')}`);
}
if (failed > 0) {
  console.error(`\n✗ ${failed} URL(s) the site publishes do not answer.`);
  console.error('  A dataset page\'s sample query is the one command a reader will actually run.');
  process.exit(1);
}
console.log('  ✓ every URL the site publishes answers with HTTP 200');
