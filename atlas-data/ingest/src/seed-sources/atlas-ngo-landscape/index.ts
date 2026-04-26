/**
 * Refresh marts.dim_ngo from Atlas-curated landscape.json.
 *
 * Source: docs/research/ngo-landscape.md → curated into landscape.json (this
 * folder). The JSON is the human-edited source-of-truth; this script
 * flattens it into dbt/seeds/dim_ngo.csv.
 *
 * Workflow when adding/updating an NGO:
 *   1. Edit landscape.json
 *   2. `npm run refresh:atlas-ngo-landscape`
 *   3. Review `git diff -- ../dbt/seeds/dim_ngo.csv` and the JSON change
 *   4. Commit both files
 *
 * Refresh cadence: curated. No external API; nothing drifts. Run on
 * demand when the curator changes the JSON.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSeedSourceGeneric, runOnError } from "../../lib/seed.js";

export const SOURCE_ID = "atlas-ngo-landscape";
const SEED_FILE = "dim_ngo.csv";

const VALID_TIERS = new Set([
  "A", "B", "B-minus",
  "C-donor", "C-petition", "C-industry", "C-quasigovernmental",
]);
const VALID_SHAPES = new Set([
  "api_canonical", "cms_bins", "programme_only", "no_structure",
]);
const VALID_FOCUSES = new Set([
  "humanitarian", "health", "social", "youth", "environment",
  "civic", "patient_support", "faith_adjacent", "service_club",
]);

type NgoEntry = {
  orgnr: string;
  slug: string;
  name: string;
  brand_name: string | null;
  website_url: string;
  tier: string;
  chapter_data_shape: string;
  has_chapters: boolean;
  primary_focus: string;
  icnpo_code_1: string | null;
  icnpo_code_2: string | null;
  icnpo_code_3: string | null;
};

type LandscapeFile = {
  ngos: NgoEntry[];
};

const LANDSCAPE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "landscape.json",
);

function validate(entry: NgoEntry, index: number): void {
  if (!/^\d{9}$/.test(entry.orgnr)) {
    throw new Error(`landscape.json[${index}] orgnr must be 9 digits, got ${JSON.stringify(entry.orgnr)}`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(entry.slug)) {
    throw new Error(`landscape.json[${index}] slug must be kebab-case (lowercase, digits, hyphens), got ${JSON.stringify(entry.slug)}`);
  }
  if (!entry.name || entry.name.length === 0) {
    throw new Error(`landscape.json[${index}] name is required`);
  }
  if (!VALID_TIERS.has(entry.tier)) {
    throw new Error(`landscape.json[${index}] tier ${JSON.stringify(entry.tier)} not in ${[...VALID_TIERS].join(", ")}`);
  }
  if (!VALID_SHAPES.has(entry.chapter_data_shape)) {
    throw new Error(`landscape.json[${index}] chapter_data_shape ${JSON.stringify(entry.chapter_data_shape)} not in ${[...VALID_SHAPES].join(", ")}`);
  }
  if (!VALID_FOCUSES.has(entry.primary_focus)) {
    throw new Error(`landscape.json[${index}] primary_focus ${JSON.stringify(entry.primary_focus)} not in ${[...VALID_FOCUSES].join(", ")}`);
  }
}

async function fetchLandscape(): Promise<readonly (readonly string[])[]> {
  const text = await readFile(LANDSCAPE_PATH, "utf8");
  const parsed = JSON.parse(text) as LandscapeFile;
  if (!Array.isArray(parsed.ngos) || parsed.ngos.length === 0) {
    throw new Error("landscape.json missing non-empty .ngos array");
  }

  parsed.ngos.forEach(validate);

  // Detect duplicate orgnr / slug across the file.
  const orgnrs = new Set<string>();
  const slugs = new Set<string>();
  for (const e of parsed.ngos) {
    if (orgnrs.has(e.orgnr)) throw new Error(`landscape.json: duplicate orgnr ${e.orgnr}`);
    if (slugs.has(e.slug)) throw new Error(`landscape.json: duplicate slug ${e.slug}`);
    orgnrs.add(e.orgnr);
    slugs.add(e.slug);
  }

  // Sort by slug for deterministic output.
  const sorted = [...parsed.ngos].sort((a, b) => a.slug.localeCompare(b.slug));

  return sorted.map((e) => [
    e.orgnr,
    e.slug,
    e.name,
    e.brand_name ?? "",
    e.website_url,
    e.tier,
    e.chapter_data_shape,
    e.has_chapters ? "true" : "false",
    e.primary_focus,
    e.icnpo_code_1 ?? "",
    e.icnpo_code_2 ?? "",
    e.icnpo_code_3 ?? "",
  ]);
}

export async function run(): Promise<void> {
  await runSeedSourceGeneric({
    sourceId: SOURCE_ID,
    seedFile: SEED_FILE,
    header: [
      "orgnr",
      "slug",
      "name",
      "brand_name",
      "website_url",
      "tier",
      "chapter_data_shape",
      "has_chapters",
      "primary_focus",
      "icnpo_code_1",
      "icnpo_code_2",
      "icnpo_code_3",
    ],
    fetch: fetchLandscape,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => runOnError(err, SOURCE_ID));
}
