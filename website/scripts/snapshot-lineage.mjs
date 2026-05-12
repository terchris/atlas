#!/usr/bin/env node
/**
 * Snapshot the dbt project's docs into a single self-contained HTML file at
 * website/static/lineage/index.html. The dbt `--static` flag embeds
 * manifest.json + catalog.json into one HTML, which sidesteps the well-known
 * dbt-docs bug where the multi-file layout fetches /manifest.json at the page
 * root and breaks when served from a subpath like /lineage/.
 *
 * Requires: local Postgres reachable at the address dbt expects (typically
 * port-forwarded to localhost:35432 by UIS, or via `kubectl port-forward
 * svc/postgresql 35432:5432 -n default`). Fails loudly if not.
 *
 * Atlas's pinned dbt-core 1.8.x produces a working static bundle. dbt-core
 * 1.9.4 / 1.10.8 have a regression that breaks --static; see dbt-core
 * Issue #11986. Verify --static still works whenever bumping dbt.
 *
 * Refresh manually whenever the dbt project's shape changes (new models,
 * renamed fields). Same pattern as `npm run api:snapshot`.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DBT_DIR = resolve(WEBSITE_DIR, '..', 'atlas-data', 'dbt');
const ENV_FILE = resolve(WEBSITE_DIR, '..', 'atlas-data', 'ingest', '.env');
const STATIC_SRC = resolve(DBT_DIR, 'target', 'static_index.html');
const STATIC_DEST_DIR = resolve(WEBSITE_DIR, 'static', 'lineage');
const STATIC_DEST = resolve(STATIC_DEST_DIR, 'index.html');

console.log(`running: uv run --env-file ${ENV_FILE} dbt docs generate --static --no-compile`);
console.log(`         (cwd: ${DBT_DIR})`);

const result = spawnSync(
  'uv',
  ['run', '--env-file', ENV_FILE, 'dbt', 'docs', 'generate', '--static', '--no-compile'],
  { cwd: DBT_DIR, stdio: 'inherit' }
);

if (result.status !== 0) {
  console.error(`\ndbt docs generate failed (exit ${result.status}).`);
  console.error(`Common cause: Postgres not reachable at localhost:35432.`);
  console.error(`Fix: ensure UIS Postgres is exposed — either './uis expose postgresql' (UIS tester)`);
  console.error(`     or 'kubectl port-forward -n default svc/postgresql 35432:5432' (direct).`);
  process.exit(result.status ?? 1);
}

mkdirSync(STATIC_DEST_DIR, { recursive: true });
copyFileSync(STATIC_SRC, STATIC_DEST);

const size = statSync(STATIC_DEST).size;
const manifest = JSON.parse(readFileSync(resolve(DBT_DIR, 'target', 'manifest.json'), 'utf8'));
const nodes = Object.keys(manifest.nodes ?? {}).length;
const sources = Object.keys(manifest.sources ?? {}).length;

console.log(
  `\nsnapshot updated: ${STATIC_DEST} (${(size / 1024 / 1024).toFixed(1)} MB, ${nodes} nodes, ${sources} sources)`
);
