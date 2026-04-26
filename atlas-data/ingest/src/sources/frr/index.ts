/**
 * FRR (Felles Ressursregister) ingest — NGO-agnostic.
 *
 * FRR is a Norwegian government-shared registry; the schema is Atlas-managed
 * (verbatim from FRR), so the ingest code lives in atlas-data. The actual
 * NGO data files live in the private repo and are gitignored.
 *
 * Convention this script implements:
 *   atlas-private-data-repo/<ngo-slug>/frr/*.json
 *
 * For each NGO subdirectory found, every *.json file is read and rows are
 * upserted into private_raw.frr_resources with the NGO's Brreg orgnr (resolved
 * from atlas-ngo-landscape/landscape.json, with a synthetic entry for
 * sample-ngo). The dbt staging at private_marts/frr_*.sql shreds the JSON.
 *
 * Run from repo root:
 *   tsx --env-file=atlas-data/ingest/.env \
 *     atlas-data/ingest/src/sources/frr/index.ts
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import { logger } from "../../lib/logger.js";

const SOURCE_ID = "frr";
const TABLE = "private_raw.frr_resources";

// Resolved relative to this file: atlas-private-data-repo/ at the repo root.
const PRIVATE_DATA_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../atlas-private-data-repo",
);

const LANDSCAPE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../seed-sources/atlas-ngo-landscape/landscape.json",
);

// sample-ngo is committed synthetic data for onboarding; not in landscape.json.
// The orgnr is deliberately fake (fails Brreg MOD-11) so it can never collide
// with a real NGO.
const SAMPLE_NGO_ORGNR = "999999999";

type FrrResource = {
  id: string;
  sistOppdatert?: string | null;
  [k: string]: unknown;
};

type LandscapeNgo = { slug: string; orgnr: string };
type Landscape = { ngos: LandscapeNgo[] };

async function loadSlugToOrgnr(): Promise<Map<string, string>> {
  const raw = await readFile(LANDSCAPE_PATH, "utf-8");
  const landscape = JSON.parse(raw) as Landscape;
  const map = new Map<string, string>();
  for (const ngo of landscape.ngos) {
    map.set(ngo.slug, ngo.orgnr);
  }
  map.set("sample-ngo", SAMPLE_NGO_ORGNR);
  return map;
}

async function discoverNgoFolders(): Promise<string[]> {
  const entries = await readdir(PRIVATE_DATA_ROOT, { withFileTypes: true });
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const frrDir = join(PRIVATE_DATA_ROOT, entry.name, "frr");
    try {
      const s = await stat(frrDir);
      if (s.isDirectory()) slugs.push(entry.name);
    } catch {
      // No frr/ subdirectory — NGO has no FRR data, skip.
    }
  }
  return slugs.sort();
}

async function loadJsonFiles(dir: string): Promise<FrrResource[]> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const all: FrrResource[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${file}: expected JSON array at top level, got ${typeof parsed}`);
    }
    all.push(...(parsed as FrrResource[]));
  }
  return all;
}

async function ingestNgo(slug: string, orgnr: string): Promise<number> {
  const dir = join(PRIVATE_DATA_ROOT, slug, "frr");
  const resources = await loadJsonFiles(dir);
  logger.info(`${SOURCE_ID}.parsed`, { slug, orgnr, resource_count: resources.length });

  if (resources.length === 0) return 0;

  const rows = resources.map((r) => ({
    id: r.id,
    ngo_orgnr: orgnr,
    raw_payload: r,
    sist_oppdatert: r.sistOppdatert ? new Date(r.sistOppdatert) : null,
  }));

  const missingIds = rows.filter((r) => !r.id).length;
  if (missingIds > 0) {
    throw new Error(`${slug}: ${missingIds} of ${rows.length} resources missing 'id'`);
  }

  const sql = getSql();
  const inserted = await upsert(sql, {
    table: TABLE,
    rows,
    columns: ["id", "ngo_orgnr", "raw_payload", "sist_oppdatert"],
    conflictKeys: ["id"],
    chunkSize: 500,
  });
  logger.info(`${SOURCE_ID}.upserted`, { slug, table: TABLE, rows: inserted });
  return inserted;
}

async function main(): Promise<void> {
  logger.info(`${SOURCE_ID}.start`, { root: PRIVATE_DATA_ROOT });

  const slugToOrgnr = await loadSlugToOrgnr();
  const ngoSlugs = await discoverNgoFolders();
  logger.info(`${SOURCE_ID}.discovered`, { ngo_count: ngoSlugs.length, ngos: ngoSlugs });

  let total = 0;
  for (const slug of ngoSlugs) {
    const orgnr = slugToOrgnr.get(slug);
    if (!orgnr) {
      logger.warn(`${SOURCE_ID}.skip_unknown_slug`, { slug });
      continue;
    }
    total += await ingestNgo(slug, orgnr);
  }

  await closeSql();
  logger.info(`${SOURCE_ID}.done`, { rows: total });
}

main().catch(async (err) => {
  logger.error(`${SOURCE_ID}.fatal`, { err: String(err) });
  await closeSql().catch(() => {});
  process.exit(1);
});
