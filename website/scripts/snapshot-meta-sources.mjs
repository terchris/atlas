#!/usr/bin/env node
/**
 * Snapshot api_v1.meta_sources into website/src/data/meta-sources-snapshot.json
 * so the catalog generator can render live ingest freshness (last_ingested_at,
 * row counts) without hitting Postgres at build time.
 *
 * Same pattern as snapshot-lineage.mjs (snapshot-openapi.mjs was deleted
 * 2026-09-23 when Scalar switched to reading live) — refresh
 * manually whenever you want the catalog to reflect a newer ingest state,
 * then commit the snapshot.
 *
 * Env vars:
 *   PGRST_SOURCE_URL   where to fetch from (default: the public API, from hosts.mjs)
 *
 * Usage:
 *   npm run sources:snapshot-freshness
 */

// DRIFT-GATE: none — snapshots LIVE state (the running API / Postgres), so a
// repo diff cannot gate it: its input is not in the repo. What it needs is a
// LIVENESS check comparing the committed snapshot against the live source,
// which is not written yet. ⚠️ atlas#423 is what happens without one — the
// published API explorer served 13 of 19 relations and a 44-character root
// document for months, and pointed every Try-it button at a localhost name.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = resolve(WEBSITE_DIR, 'src', 'data', 'meta-sources-snapshot.json');
// 🔴 DEFAULT DERIVES FROM hosts.mjs. It used to be a hardcoded dev address,
// and that is why this file went stale: regenerating it correctly required
// knowing an environment variable that nothing told you about, so the bare
// command silently produced a snapshot of a local database or failed.
//
// ⚠️ MEASURED CONSEQUENCE, 2026-09-23 (urb-agents #1417): the docs site
// listed 41 of 44 sources, omitting brreg-enheter-alle, brreg-frivillige and
// brreg-oppdateringer — all three SERVED. And 41 is also the number of live
// sources with a non-empty served_as, so the total read as a deliberate
// filter. It was not: the snapshot also INCLUDED the three unserved sources.
// The count matched for the wrong reason and a reviewer checking it against
// the API would have passed it.
//
// 🔵 This is the same defect atlas#423 fixed in snapshot-openapi.mjs. That one
// no longer exists — Scalar reads the live spec — but these siblings kept the
// bad default.
import { ATLAS_API_BASE_URL } from '../hosts.mjs';

const SOURCE_URL = process.env.PGRST_SOURCE_URL ?? ATLAS_API_BASE_URL.replace(/\/$/, '');

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
