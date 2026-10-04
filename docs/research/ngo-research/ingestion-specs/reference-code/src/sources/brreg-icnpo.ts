/**
 * file: ingest/src/sources/brreg-icnpo.ts
 * description: The complete ICNPO classification, straight from the voluntary register.
 * output: data/_icnpo/icnpo-categories.csv, icnpo-assignments.csv
 *
 * WHY THIS IS A SEPARATE PULL: the aggregated view exposes the classification as single
 * columns — the PRIMARY category only. The register returns an ordered ARRAY, and 24% of
 * organisations carry more than one, so reading the flattened view silently discards
 * ~22,000 classifications. It undercuts hardest in exactly the fields that matter:
 * crisis support +154%, inclusion +148%, youth organisations +122%.
 *
 *   npm run icnpo                # full pull, ~730 requests, ~3 min
 *   npm run icnpo -- --limit 2000
 */

import * as fs from 'fs';
import * as path from 'path';
import { getJson, sleep } from '../lib/http';
import Logger from '../lib/logger';
import { DATA_DIR } from '../lib/io';

const BASE = 'https://data.brreg.no/frivillighetsregisteret/api';
const OUT = path.join(DATA_DIR, '_icnpo');
const PAGE = 100; // the API rejects size>100 with "size cannot exceed 100"

interface Category { icnpoNummer: string; navn: string; }
interface Org {
  organisasjonsnummer: string;
  innfoertDato?: string;
  frivilligOrganisasjonsstatus?: string;
  grasrotandel?: { deltarI?: boolean };
  icnpoKategorier?: { icnpoNummer: string; kategori: string; rekkefoelge: number }[];
}

const csv = (rows: (string | number | boolean)[][]) =>
  `${rows.map((r) => r.map((v) => (typeof v === 'string' && /[",\n]/.test(v)
    ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n')}\n`;

async function reference(): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const lang of ['NOB', 'NNO']) {
    const d = await getJson<any>(`${BASE}/icnpo-kategorier?spraak=${lang}`);
    for (const k of d._embedded.icnpoKategorier as Category[]) {
      out[k.icnpoNummer] ??= {};
      out[k.icnpoNummer][lang] = k.navn;
    }
  }
  return out;
}

/** Cursor paging via searchAfter — no 10,000-row ceiling, unlike the unit endpoint. */
async function organisations(limit?: number): Promise<Org[]> {
  const rows: Org[] = [];
  let after: string | undefined;
  for (;;) {
    const url = `${BASE}/frivillige-organisasjoner?size=${PAGE}`
      + (after ? `&searchAfter=${encodeURIComponent(after)}` : '');
    const d = await getJson<any>(url, { timeoutMs: 60_000 });
    const batch: Org[] = d?._embedded?.frivilligeOrganisasjoner ?? [];
    if (!batch.length) break;
    rows.push(...batch);
    if (rows.length % 10_000 < PAGE) Logger.info(`    ${rows.length.toLocaleString()}`);
    if (limit && rows.length >= limit) break;
    const next: string | undefined = d?._links?.next?.href;
    if (!next) break;
    after = new URL(next, BASE).searchParams.get('searchAfter') ?? undefined;
    if (!after) break;
    await sleep(50);
  }
  return rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || undefined;
  fs.mkdirSync(OUT, { recursive: true });

  const ref = await reference();
  const codes = new Set(Object.keys(ref));
  const catRows: (string | number)[][] = [
    ['icnpoCode', 'parentCode', 'level', 'nameNob', 'nameNno'],
  ];
  for (const code of [...codes].sort((a, b) => a.padEnd(5, '0').localeCompare(b.padEnd(5, '0')))) {
    // Codes are <group><3 digits>, and groups are one OR TWO digits: 1 -> 1100,
    // 10 -> 10100, 11 -> 11300. Deriving the parent as code[0] mis-parents everything
    // from group 10 upward and silently hides two whole groups.
    const isLeaf = code.length > 2 && codes.has(code.slice(0, -3));
    catRows.push([code, isLeaf ? code.slice(0, -3) : '', isLeaf ? 'leaf' : 'group',
                  ref[code].NOB ?? '', ref[code].NNO ?? '']);
  }
  fs.writeFileSync(path.join(OUT, 'icnpo-categories.csv'), csv(catRows));
  const groups = catRows.slice(1).filter((r) => r[2] === 'group').length;
  Logger.info(`reference: ${catRows.length - 1} codes (${groups} groups, `
    + `${catRows.length - 1 - groups} leaves)`);

  Logger.info('walking the register...');
  const orgs = await organisations(limit);
  Logger.info(`organisations: ${orgs.length.toLocaleString()}`);

  const label = Object.fromEntries(Object.entries(ref).map(([c, v]) => [c, v.NOB ?? '']));
  const rows: (string | number | boolean)[][] = [
    ['organizationNumber', 'rank', 'isPrimary', 'icnpoCode', 'icnpoName',
     'icnpoKey', 'grasrotandel', 'registeredDate', 'status'],
  ];
  const perOrg: Record<number, number> = {};
  for (const o of orgs) {
    const ks = o.icnpoKategorier ?? [];
    perOrg[ks.length] = (perOrg[ks.length] ?? 0) + 1;
    for (const k of ks) {
      rows.push([o.organisasjonsnummer, k.rekkefoelge, k.rekkefoelge === 1,
                 k.icnpoNummer, label[k.icnpoNummer] ?? '', k.kategori ?? '',
                 Boolean(o.grasrotandel?.deltarI), o.innfoertDato ?? '',
                 (o.frivilligOrganisasjonsstatus ?? '')
                   .replace('frivilligOrganisasjonsstatus.', '')]);
    }
  }
  fs.writeFileSync(path.join(OUT, 'icnpo-assignments.csv'), csv(rows));

  const multi = Object.entries(perOrg)
    .filter(([n]) => Number(n) > 1).reduce((a, [, v]) => a + v, 0);
  Logger.info(`assignments: ${(rows.length - 1).toLocaleString()} rows`);
  Logger.info(`  categories per org: ${JSON.stringify(perOrg)}`);
  Logger.info(`  with more than one: ${multi.toLocaleString()} `
    + `(${((multi / orgs.length) * 100).toFixed(1)}%)  <- lost by reading only the primary`);
  Logger.info(`  mean per org: ${((rows.length - 1) / orgs.length).toFixed(2)}`);
}

main().catch((e) => { Logger.error(String(e)); process.exit(1); });
