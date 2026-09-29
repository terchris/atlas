#!/usr/bin/env node
/**
 * Build the published kommune/fylke boundary file from Kartverket.
 *
 * 🔴 WHY A FILE AND NOT A RELATION. Full-resolution boundaries are ~29 MB
 * across 357 kommuner (measured 2026-09-29: mean 78 KB, Oslo the worst at
 * 223 KB). Serving that through PostgREST would be worse than having no maps —
 * the API already has no indexes and degrades at three concurrent scans
 * (urb-agents #1438). Terje's decision, 2026-09-29: simplify on ingest, serve
 * the file.
 *
 * 🔴 THE OUTPUT IS DELIBERATELY NOT WHAT KARTVERKET PUBLISHED. It is simplified
 * with Douglas–Peucker to ~33 m, which drops ~94% of the points. That is a
 * DERIVATION, and the first time Atlas ships geometry that is not the
 * upstream's own. It is fit for a choropleth at national scale and NOT for
 * anything where a boundary's position matters — cadastral work, area
 * calculation, or deciding which side of a line a point is on. The file says
 * so in its own `atlas` block, because a consumer who downloads it will not be
 * reading this script.
 *
 * 🔵 Authoritative geometry stays at Kartverket. This file is a convenience,
 * and it names where to get the real thing.
 *
 * Source: ws.geonorge.no/kommuneinfo — plain JSON, no auth, "Åpne data",
 * no stated use limitations. Keys arrive already matching Atlas:
 * `kommunenummer` is zero-padded text ("0301"), as is `dim_kommune.kommune_nr`.
 *
 * Usage:  node scripts/generate-kommune-geometry.mjs [--tolerance 0.0003]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../static/geo/kommuner.geojson');
const API = 'https://ws.geonorge.no/kommuneinfo/v1';
const ATLAS_API = 'https://api-atlas.urbalurba.com';

const argTol = process.argv.indexOf('--tolerance');
const TOLERANCE = argTol > -1 ? Number(process.argv[argTol + 1]) : 0.0003;
const COORD_DECIMALS = 5;   // ~1 m; finer than the tolerance, so it never dominates

/** Perpendicular distance from p to the segment a→b, in degrees. */
function perp(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Douglas–Peucker, iterative so a 6 000-point ring cannot blow the stack. */
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let imax = -1, dmax = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = perp(pts[i], pts[lo], pts[hi]);
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (imax > -1) { keep[imax] = 1; stack.push([lo, imax], [imax, hi]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  // A polygon ring needs at least 4 positions and must close.
  if (out.length < 4) return pts.slice(0, 1).concat(pts.slice(1, 3), pts.slice(0, 1));
  if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) out.push(out[0]);
  return out;
}

const round = (n) => Number(n.toFixed(COORD_DECIMALS));

function simplifyGeometry(g, tol) {
  const ring = (r) => simplifyRing(r, tol).map(([x, y]) => [round(x), round(y)]);
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(ring) };
  if (g.type === 'MultiPolygon')
    return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) };
  throw new Error(`unexpected geometry type ${g.type}`);
}

const countPts = (o) =>
  Array.isArray(o) ? (typeof o[0] === 'number' ? 1 : o.reduce((n, x) => n + countPts(x), 0)) : 0;

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'atlas-geometry-build' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((s) => setTimeout(s, 500 * i));
    }
  }
}

/**
 * 🔴 The kommune list comes from Atlas's OWN dim_kommune, not from Kartverket.
 * If the two ever disagree, a boundary file keyed on codes Atlas does not
 * publish is worse than no file: every join silently drops rows. Taking the
 * list from dim_kommune means a mismatch shows up here, loudly, as a kommune
 * Kartverket will not serve — rather than as absent polygons in someone's map.
 */
async function activeKommuner() {
  const rows = await getJson(
    `${ATLAS_API}/dim_kommune?is_active=eq.true&is_sentinel=eq.false&select=kommune_nr,kommune_name,fylke_nr&order=kommune_nr`
  );
  return rows;
}

async function main() {
  const list = await activeKommuner();
  console.log(`→ ${list.length} active kommuner from Atlas dim_kommune`);

  const features = [];
  let fullBytes = 0, fullPts = 0, simplePts = 0, failed = [];
  for (const [i, k] of list.entries()) {
    try {
      const d = await getJson(`${API}/kommuner/${k.kommune_nr}/omrade?utkoordsys=4326`);
      const raw = d.omrade;
      fullBytes += JSON.stringify(raw).length;
      fullPts += countPts(raw.coordinates);
      const geom = simplifyGeometry(raw, TOLERANCE);
      simplePts += countPts(geom.coordinates);
      features.push({
        type: 'Feature',
        properties: {
          kommune_nr: k.kommune_nr,
          kommune_name: k.kommune_name,
          fylke_nr: k.fylke_nr,
        },
        geometry: geom,
      });
    } catch (e) {
      failed.push(`${k.kommune_nr} ${k.kommune_name}: ${e.message}`);
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${list.length}\n`);
    await new Promise((s) => setTimeout(s, 120));   // be polite to Kartverket
  }

  if (failed.length) {
    console.error(`\n✗ ${failed.length} kommune(s) could not be fetched:`);
    failed.slice(0, 10).forEach((f) => console.error(`    ${f}`));
    console.error('  Refusing to write a partial boundary file — a map with silent');
    console.error('  holes is worse than no map. Re-run, or fix the mismatch.');
    process.exit(1);
  }

  const doc = {
    type: 'FeatureCollection',
    atlas: {
      what: 'Norwegian kommune boundaries, SIMPLIFIED. Not survey-grade.',
      generated_from: `${API}/kommuner/{kommune_nr}/omrade`,
      upstream: 'Kartverket / Geonorge — "Administrative enheter kommuner"',
      upstream_terms: 'Åpne data; no stated use limitations. Attribute Kartverket.',
      authoritative_geometry: 'https://kartkatalog.geonorge.no/metadata/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b',
      simplification: `Douglas–Peucker, tolerance ${TOLERANCE}° (~${Math.round(TOLERANCE * 111000)} m), coordinates rounded to ${COORD_DECIMALS} decimals`,
      not_suitable_for:
        'area calculation, cadastral work, or point-in-polygon decisions near a border',
      join_key: 'properties.kommune_nr matches api_v1.dim_kommune.kommune_nr (zero-padded text)',
      kommune_count: features.length,
      crs: 'EPSG:4326 (WGS 84 lon/lat)',
      built_at: new Date().toISOString().slice(0, 10),
    },
    features,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  const json = JSON.stringify(doc);
  writeFileSync(OUT, json + '\n');
  console.log(
    `\n→ ${OUT}\n` +
      `   kommuner   ${features.length}\n` +
      `   points     ${fullPts} → ${simplePts}  (${(100 * simplePts / fullPts).toFixed(1)}% kept)\n` +
      `   size       ${(fullBytes / 1e6).toFixed(1)} MB upstream → ${(json.length / 1e6).toFixed(2)} MB written`
  );
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
