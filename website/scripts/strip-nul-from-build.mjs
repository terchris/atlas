#!/usr/bin/env node
/**
 * Remove NUL bytes from the built HTML, and say how many and where.
 *
 * DRIFT-GATE: none — this is a POST-BUILD FIXER, not a generator of committed
 * artifacts. It rewrites files under build/, which is not in git.
 *
 * 🔴 WHY. Docusaurus emits a NUL byte into exactly two of 63 dataset pages:
 *
 *     datasets/ssb-12132.html      byte 8459   immediately before "ø" (C3 B8)
 *     datasets/fhi-depresjon.html  byte 14634  immediately before U+200B (E2 80 8B)
 *
 * In both cases the NUL sits directly in front of a MULTI-BYTE UTF-8 character,
 * at a byte offset that is identical across minified and unminified builds. The
 * API response, the registry JSON and the .mdx source all contain zero NULs —
 * it is introduced during the site build.
 *
 * ⚠️ A NUL IS NOT VALID IN HTML TEXT, and the damage is not visual. Browsers
 * tolerate it, so the pages look correct — but `file(1)` reports "data", and
 * any tool doing binary detection REFUSES THE FILE AND RETURNS NOTHING.
 *
 * 🔴 THAT COST TWO AGENTS A COMBINED FOUR ROUNDS. ops-dev's grep is a ugrep
 * wrapper with -I; mine is binary-aware too. Both of us measured "0 headings,
 * 0 Provenance" on pages that render all eight sections, and both of us
 * reported it as a rendering defect. I went further and "proved" the slug was
 * at fault — three probes, one clean build — because every probe that inherited
 * this title inherited the NUL, and my instrument refused all of them
 * identically (urb-agents #1429).
 *
 * 🔵 An instrument that answers "nothing found" when it means "I declined to
 * look" is the sharpest version of this week's recurring defect, and it is the
 * only one so far that fooled the person holding it.
 *
 * ⚠️ THIS IS A MITIGATION, NOT THE FIX. The NUL should not be emitted. Stripping
 * it makes the pages valid HTML and readable by every tool; finding what emits
 * it is open and belongs upstream of here.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = resolve(WEBSITE_DIR, 'build');

function* htmlFiles(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (e.endsWith('.html')) yield p;
  }
}

let scanned = 0;
const cleaned = [];
try {
  for (const f of htmlFiles(BUILD)) {
    scanned += 1;
    const buf = readFileSync(f);
    const n = buf.filter((b) => b === 0).length;
    if (n === 0) continue;
    const at = buf.indexOf(0);
    writeFileSync(f, Buffer.from(buf.filter((b) => b !== 0)));
    cleaned.push({ file: relative(BUILD, f), n, at });
  }
} catch (err) {
  console.error(`✗ could not scan ${BUILD}: ${err.message}`);
  process.exit(2);
}

if (scanned === 0) {
  console.error('✗ scanned zero HTML files — run `npm run build` first.');
  process.exit(2);
}

for (const c of cleaned) {
  console.log(`  stripped ${c.n} NUL byte(s) from ${c.file} (first at byte ${c.at})`);
}
console.log(`  ✓ ${scanned} built pages scanned · ${cleaned.length} contained a NUL and were cleaned`);
