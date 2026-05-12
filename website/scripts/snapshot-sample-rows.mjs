#!/usr/bin/env node
/**
 * Snapshot the first 5 rows of every dataset (source raw table + view) into
 * website/src/data/sample-rows-snapshot.json so dataset pages can render a
 * compact preview table without hitting PostgREST at build time.
 *
 * Same pattern as snapshot-meta-sources.mjs — refresh manually whenever
 * you want catalog previews to reflect a newer ingest state, then commit
 * the snapshot. Build-time render falls back gracefully when the snapshot
 * is missing or a specific dataset failed (other datasets keep working).
 *
 * Env vars:
 *   PGRST_SOURCE_URL   where to fetch from (default http://api-atlas.localhost)
 *
 * Usage:
 *   npm run sources:snapshot-samples
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_DIR = resolve(WEBSITE_DIR, '..', 'atlas-data', 'ingest', 'src', 'sources');
const OUT_PATH = resolve(WEBSITE_DIR, 'src', 'data', 'sample-rows-snapshot.json');
const SOURCE_URL = process.env.PGRST_SOURCE_URL ?? 'http://api-atlas.localhost';
const LIMIT = 5;

// ── Helpers ────────────────────────────────────────────────────────────

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'));
}

/**
 * Walk source manifests to enumerate raw tables. Each source maps to one
 * or more `raw_tables`; when the manifest doesn't supply them we fall back
 * to the underscore-translated source_id (same convention as the catalog
 * generator). Returns [{ source_id, raw_table }].
 */
function listSourceTables() {
  const out = [];
  if (!existsSync(SOURCES_DIR)) return out;
  for (const entry of readdirSync(SOURCES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(SOURCES_DIR, entry.name, 'manifest.yml');
    if (!existsSync(manifestPath)) continue;
    const manifest = loadYaml(manifestPath);
    if (!manifest || typeof manifest.source_id !== 'string') continue;
    const rawTables = Array.isArray(manifest.raw_tables) && manifest.raw_tables.length > 0
      ? manifest.raw_tables
      : [manifest.source_id.replace(/-/g, '_')];
    for (const t of rawTables) {
      out.push({ source_id: manifest.source_id, raw_table: t });
    }
  }
  return out;
}

/**
 * View list comes from the dbt mart schema.yml files. Each api_v1.* view
 * corresponds to a mart model named `mart_<name>` — strip the prefix.
 */
function listViews() {
  const schemaFiles = [
    resolve(WEBSITE_DIR, '..', 'atlas-data', 'dbt', 'models', 'marts', 'api', 'schema.yml'),
    resolve(WEBSITE_DIR, '..', 'atlas-data', 'dbt', 'models', 'marts', 'schema.yml'),
  ];
  const out = [];
  for (const path of schemaFiles) {
    if (!existsSync(path)) continue;
    const doc = loadYaml(path);
    const models = doc?.models ?? [];
    for (const m of models) {
      if (typeof m.name !== 'string') continue;
      if (!m.name.startsWith('mart_')) continue;
      out.push({ mart_name: m.name, api_v1_name: m.name.slice('mart_'.length) });
    }
  }
  return out;
}

async function fetchRows({ url, profile }) {
  const headers = profile ? { 'Accept-Profile': profile } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}` };
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'unexpected response shape (expected array)' };
  }
  return { ok: true, rows };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const sourceTables = listSourceTables();
  const views = listViews();

  console.log(`→ fetching from ${SOURCE_URL}`);
  console.log(`  ${sourceTables.length} source raw tables, ${views.length} api_v1 views`);

  const sources = {};
  let sourceOk = 0;
  for (const { source_id, raw_table } of sourceTables) {
    const url = `${SOURCE_URL}/${raw_table}?limit=${LIMIT}`;
    const result = await fetchRows({ url, profile: 'raw' });
    if (result.ok) {
      // Many sources map to the same raw table; later wins, but rows are
      // identical so it doesn't matter.
      sources[source_id] = { raw_table, rows: result.rows };
      sourceOk++;
    } else {
      console.warn(`  ! ${source_id} (${raw_table}): ${result.error}`);
    }
  }

  const viewsOut = {};
  let viewOk = 0;
  for (const { mart_name, api_v1_name } of views) {
    const url = `${SOURCE_URL}/${api_v1_name}?limit=${LIMIT}`;
    const result = await fetchRows({ url });
    if (result.ok) {
      viewsOut[api_v1_name] = { mart_name, rows: result.rows };
      viewOk++;
    } else {
      console.warn(`  ! ${api_v1_name} (${mart_name}): ${result.error}`);
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    row_limit: LIMIT,
    sources,
    views: viewsOut,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  console.log(
    `→ wrote ${OUT_PATH.replace(WEBSITE_DIR + '/', '')}: ` +
    `${sourceOk}/${sourceTables.length} sources, ${viewOk}/${views.length} views`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
