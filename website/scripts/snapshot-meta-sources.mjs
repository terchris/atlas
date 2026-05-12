#!/usr/bin/env node
/**
 * Snapshot api_v1.meta_sources into website/src/data/meta-sources-snapshot.json
 * so the catalog generator can render live ingest freshness (last_ingested_at,
 * row counts) without hitting Postgres at build time.
 *
 * Same pattern as snapshot-openapi.mjs and snapshot-lineage.mjs — refresh
 * manually whenever you want the catalog to reflect a newer ingest state,
 * then commit the snapshot.
 *
 * Env vars:
 *   PGRST_SOURCE_URL   where to fetch from (default http://api-atlas.localhost)
 *
 * Usage:
 *   npm run sources:snapshot-freshness
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = resolve(WEBSITE_DIR, 'src', 'data', 'meta-sources-snapshot.json');
const SOURCE_URL = process.env.PGRST_SOURCE_URL ?? 'http://api-atlas.localhost';

const FIELDS = [
  'source_id',
  'last_ingested_at',
  'latest_row_count',
  'total_runs',
  'downstream_model_count',
].join(',');

async function main() {
  const url = `${SOURCE_URL}/meta_sources?select=${FIELDS}`;
  console.log(`→ fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.error('✗ unexpected response shape (expected array)');
    process.exit(1);
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    rows,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  console.log(`→ wrote ${OUT_PATH.replace(WEBSITE_DIR + '/', '')}: ${rows.length} sources`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
