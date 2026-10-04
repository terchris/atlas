/**
 * file: ingest/src/sources/classify-units.ts
 * description: Set `unitKind`, and move owned companies to level RELATED_ENTITY.
 * output: rewrites data/<org>/chapters.json in place
 *
 * ⚠️ WHY. `level` said where a unit sits; nothing said what it IS. So a lokallag with an
 * elected board and a drug-treatment centre with fifteen employees were both LOCAL
 * chapters, and the totals matched no organisation's own figures: Frelsesarmeen came to
 * 303 against roughly 100 korps, Kirkens Bymisjon to 434 against some 45 local bymisjoner.
 *
 * The rule below is ordered, and each step uses evidence rather than a guess:
 *
 *   1. NATIONAL/REGIONAL rows are governance by definition - a tier exists to govern.
 *   2. A unit run by a company the organisation OWNS is not in the chapter structure.
 *      Fretex is not one shop but a group of limited companies - FRETEX MILJØ AS alone
 *      employs 449 people - so its outlets are RELATED_ENTITY, not local chapters. 68 of
 *      them were typed as Frelsesarmeen's own LOCAL chapters.
 *   3. The organisation's OWN word decides governance. `chapterType` holds it, and the
 *      membership vocabulary is unambiguous across all eleven: korps, lokallag, klubb,
 *      helselag, sanitetsforening, speidergruppe, demensforening.
 *   4. Anything else that is REGISTERED is an operational unit - it employs people and has
 *      an address, it simply has no members.
 *   5. What is left is unregistered and named as an offering. That is an ACTIVITY, and it
 *      is flagged here rather than deleted, because where it goes is the open question of
 *      the activity layer. Kirkens Bymisjon's 282 already exist in activities.json.
 *
 *   npm run classify -- --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection, writeCollection } from '../lib/io';
import type { Chapter, Collection } from '../lib/types';

/** Membership vocabulary, across all eleven organisations. */
const GOVERNANCE = /^(korps|lokallag|lokalforening|klubb|helselag|sanitetsforening|sanitetslag|speidergruppe|demensforening|unge sanitet|hjelpekorps|besøkstjeneste|omsorg|fylkeslag|krets|distrikt|divisjon|fylke|region|fylkesstyret|fylkesforening|administrasjon)/i;

/** Companies the organisation owns. Their outlets are not its chapters. */
const OWNED_COMPANY = /\bfretex\b|\bAS\b/;

function main(): void {
  const dry = process.argv.includes('--dry-run');
  const dirs = fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('_'));
  const totals = { GOVERNANCE: 0, OPERATIONAL: 0, ACTIVITY: 0, RELATED: 0 };

  for (const slug of dirs) {
    const file = path.join(DATA_DIR, slug, 'chapters.json');
    const col = readCollection<Chapter>(file);
    if (!col) continue;

    let gov = 0; let oper = 0; let act = 0; let rel = 0;
    for (const c of col.items) {
      const type = (c.chapterType ?? '').trim();

      if (c.level === 'NATIONAL' || c.level === 'REGIONAL') {
        c.unitKind = 'GOVERNANCE'; gov += 1; continue;
      }
      if (OWNED_COMPANY.test(c.name) || OWNED_COMPANY.test(type)) {
        c.level = 'RELATED_ENTITY';
        c.unitKind = 'OPERATIONAL';
        rel += 1;
        continue;
      }
      if (GOVERNANCE.test(type)) { c.unitKind = 'GOVERNANCE'; gov += 1; continue; }
      if (c.registration === 'SUB_UNIT' || c.registration === 'LEGAL_ENTITY') {
        c.unitKind = 'OPERATIONAL'; oper += 1; continue;
      }
      // Unregistered and not a membership unit: an activity wearing a chapter's clothes.
      c.unitKind = 'UNKNOWN'; act += 1;
    }

    totals.GOVERNANCE += gov; totals.OPERATIONAL += oper;
    totals.ACTIVITY += act; totals.RELATED += rel;
    Logger.info(`  ${slug.padEnd(20)} governance ${String(gov).padStart(4)}`
      + `   operational ${String(oper).padStart(4)}`
      + `   owned-company ${String(rel).padStart(3)}`
      + `   looks-like-activity ${String(act).padStart(4)}`);

    if (!dry) writeCollection(file, col as Collection<Chapter>);
  }

  Logger.info(`\n  chapters that are governance units: ${totals.GOVERNANCE}`);
  Logger.info(`  operational units (registered, no members): ${totals.OPERATIONAL}`);
  Logger.info(`  moved to RELATED_ENTITY (owned companies): ${totals.RELATED}`);
  Logger.warn(`${totals.ACTIVITY} row(s) are unregistered offerings that belong in the `
    + 'activity layer; flagged unitKind=UNKNOWN, not yet moved');
  if (dry) Logger.info('  --dry-run: nothing written');
}

main();
