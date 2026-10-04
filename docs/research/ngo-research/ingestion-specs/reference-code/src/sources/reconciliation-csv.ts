/**
 * file: ingest/src/sources/reconciliation-csv.ts
 * description: Rewrites every data/<org>/reconciliation.csv from its chapters.json.
 * output: data/<org>/reconciliation.csv
 *
 * ⚠️ WHY. `reconcile` writes the CSV once, from the join. Every later step that rewrites
 * chapters.json — `hierarchy`, `classify` — left it behind: on 27 Sep 2026 all eleven
 * chapters.json were rewritten at 13:47 and no CSV was, so LHL's audit trail held 274 rows
 * against 285 chapters and SOURCE_ONLY 45 against 57. The same silent drift that got the
 * chapter CSVs deleted. chapters.json is canonical; this derives the audit view from it,
 * and `npm run check:integrity` fails if the two disagree.
 *
 * Same columns and row order as reconcile-chapters.ts: BOTH, REGISTRY_ONLY, SOURCE_ONLY.
 * The NATIONAL root is not a reconciled chapter and is not listed.
 *
 *   npm run reconciliation-csv
 */

import * as fs from 'fs';
import * as path from 'path';
import Logger from '../lib/logger';
import { DATA_DIR, readCollection } from '../lib/io';
import type { Chapter } from '../lib/types';

const ORDER = ['BOTH', 'REGISTRY_ONLY', 'SOURCE_ONLY'];

function main(): void {
  for (const org of fs.readdirSync(DATA_DIR).sort()) {
    const dir = path.join(DATA_DIR, org);
    const csvFile = path.join(dir, 'reconciliation.csv');
    // Only organisations that were ever reconciled have an audit trail to keep current.
    if (!fs.existsSync(csvFile)) continue;
    const chapters = readCollection<Chapter>(path.join(dir, 'chapters.json'))?.items ?? [];

    const rows = chapters
      .filter((c) => c.level !== 'NATIONAL' && c.provenance?.reconciliation)
      .sort((a, b) => ORDER.indexOf(a.provenance!.reconciliation!)
        - ORDER.indexOf(b.provenance!.reconciliation!))
      .map((c) => {
        const status = c.provenance!.reconciliation!;
        return [
          status, c.id, `"${c.name.replace(/"/g, '""')}"`,
          status === 'SOURCE_ONLY' ? '' : c.organizationNumber ?? '',
          status === 'REGISTRY_ONLY' ? '' : c.provenance?.sourceUrl ?? '',
        ].join(',');
      });

    fs.writeFileSync(csvFile,
      `${['reconciliation,chapterId,name,organizationNumber,sourceUrl', ...rows].join('\n')}\n`);
    Logger.info(`  ${org.padEnd(20)} ${String(rows.length).padStart(4)} rows`);
  }
}

main();
