#!/usr/bin/env node
/**
 * Snapshot the PostgREST OpenAPI spec into static/openapi.json so Scalar can
 * load it same-origin (avoids the CORS bug on PostgREST GET responses — see
 * INVESTIGATE-deployment-pipeline.md Q21).
 *
 * Also rewrites the spec's `host` / `schemes` / `basePath` so the "Try it out"
 * curl examples show the public API URL, not PostgREST's internal
 * `0.0.0.0:3000`. The proper fix is UIS-side (set PostgREST's
 * OPENAPI_SERVER_PROXY_URI); this script is the workaround until that ships.
 *
 * Env vars:
 *   PGRST_SOURCE_URL     where to fetch the spec from (default: local UIS PostgREST)
 *   PGRST_PUBLISH_HOST   what to put in the spec's `host` field (default: prod target)
 *   PGRST_PUBLISH_SCHEME http or https (default: https)
 *
 * Examples:
 *   npm run api:snapshot                                    # default: refresh from localhost, publish as prod URL
 *   PGRST_PUBLISH_HOST=api-atlas.localhost \
 *     PGRST_PUBLISH_SCHEME=http npm run api:snapshot       # local-targeted snapshot (don't commit)
 */

import { writeFileSync } from 'node:fs';

const SOURCE_URL = process.env.PGRST_SOURCE_URL ?? 'http://api-atlas.localhost/';
// Default to the local UIS address because that's the only PostgREST reachable
// today; api-atlas.helpers.no is the future public target (not yet deployed —
// see INVESTIGATE-deployment-pipeline.md Q21). When PostgREST goes public,
// override with `PGRST_PUBLISH_HOST=api-atlas.helpers.no PGRST_PUBLISH_SCHEME=https`
// and re-snapshot, or flip these defaults.
const PUBLISH_HOST = process.env.PGRST_PUBLISH_HOST ?? 'api-atlas.localhost';
const PUBLISH_SCHEME = process.env.PGRST_PUBLISH_SCHEME ?? 'http';
const OUTPUT = 'static/openapi.json';

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`fetch ${SOURCE_URL} failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();

spec.host = PUBLISH_HOST;
spec.schemes = [PUBLISH_SCHEME];
spec.basePath = '/';

writeFileSync(OUTPUT, JSON.stringify(spec));

const paths = Object.keys(spec.paths ?? {}).length;
const defs = Object.keys(spec.definitions ?? {}).length;
console.log(
  `snapshot updated: ${OUTPUT} (host: ${PUBLISH_SCHEME}://${PUBLISH_HOST}/, ${paths} paths, ${defs} definitions)`
);
