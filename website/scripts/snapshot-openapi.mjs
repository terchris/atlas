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

// DRIFT-GATE: none — snapshots LIVE state (the running API / Postgres), so a
// repo diff cannot gate it: its input is not in the repo. What it needs is a
// LIVENESS check comparing the committed snapshot against the live source,
// which is not written yet. ⚠️ atlas#423 is what happens without one — the
// published API explorer served 13 of 19 relations and a 44-character root
// document for months, and pointed every Try-it button at a localhost name.

import { writeFileSync } from 'node:fs';
import { ATLAS_API_BASE_URL } from '../hosts.mjs';

// 🔴 DEFAULTS DERIVE FROM hosts.mjs. They used to be hardcoded dev values, and
// what they produced was published to the public site for months:
//
//     host  api-atlas.localhost   scheme  http   basePath  /v1
//
// Every "Try it" button in the live Scalar explorer at /api therefore pointed
// at a hostname no visitor can resolve, over http, under a path prefix that
// does not exist. Measured on the live site 2026-09-22 (urb-agents #1407).
//
// ⚠️ THE OLD COMMENT SAID WHY, AND SAID WHAT TO DO, AND NOBODY DID IT:
// "api-atlas.helpers.no is the future public target (not yet deployed) … When
// PostgREST goes public, flip these defaults." PostgREST went public. The
// hostname it named was itself superseded twice since. A default that is
// correct only until a deployment happens is a defect with a delay on it —
// so this now reads the one file that is kept true.
//
// 🔵 `/v1` is gone for the same reason. It documented a UIS-side Traefik
// path-rewrite that never shipped; the live API's basePath is `/`, measured.
// A spec should describe what answers, not what was intended.
const PUBLIC_API = new URL(ATLAS_API_BASE_URL);

const SOURCE_URL = process.env.PGRST_SOURCE_URL ?? ATLAS_API_BASE_URL;
const PUBLISH_HOST = process.env.PGRST_PUBLISH_HOST ?? PUBLIC_API.host;
const PUBLISH_SCHEME = process.env.PGRST_PUBLISH_SCHEME ?? PUBLIC_API.protocol.replace(':', '');
const PUBLISH_BASEPATH = process.env.PGRST_PUBLISH_BASEPATH ?? '/';
const OUTPUT = 'static/openapi.json';

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`fetch ${SOURCE_URL} failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();

spec.host = PUBLISH_HOST;
spec.schemes = [PUBLISH_SCHEME];
spec.basePath = PUBLISH_BASEPATH;

writeFileSync(OUTPUT, JSON.stringify(spec));

const paths = Object.keys(spec.paths ?? {}).length;
const defs = Object.keys(spec.definitions ?? {}).length;
console.log(
  `snapshot updated: ${OUTPUT} (base: ${PUBLISH_SCHEME}://${PUBLISH_HOST}${PUBLISH_BASEPATH}, ${paths} paths, ${defs} definitions)`
);
