#!/usr/bin/env tsx
/**
 * validate-manifests.ts — schema + cross-file validation for source manifests.
 *
 * Canonical guide: website/docs/contributors/check-manifests.md
 *
 * What it checks:
 *   1. Every src/sources/<id>/manifest.yml conforms to manifest.schema.json.
 *   2. Every manifest's `tags.topic` resolves to an id in source-categories.yaml.
 *   3. Every manifest's `publisher` matches a `display_name` in publishers.yaml.
 *
 * Exit codes:
 *   0 — all OK.
 *   1 — one or more manifests failed schema or cross-file check.
 *   2 — internal error (schema file missing, parse error in schema, etc.).
 *
 * Companion files (publishers.yaml, source-categories.yaml) are optional in
 * isolation: when missing, the cross-file checks are skipped with a warning
 * but the schema check still runs. This lets Phase 1 of PLAN-001 land
 * (schema validator) before Phase 3 ships the companion files.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { load as parseYaml } from "js-yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(SCRIPT_DIR, "manifest.schema.json");
const PUBLISHERS_PATH = join(SCRIPT_DIR, "publishers.yaml");
const CATEGORIES_PATH = join(SCRIPT_DIR, "source-categories.yaml");

// ── Types (loose — we trust the schema) ─────────────────────────────────

interface Manifest {
  source_id: string;
  publisher: string;
  tags: { topic: string; [k: string]: string };
  [k: string]: unknown;
}

interface PublishersFile {
  publishers: Array<{ id: string; display_name: string; [k: string]: unknown }>;
}

interface CategoriesFile {
  categories: Array<{ id: string; [k: string]: unknown }>;
}

// ── Discover manifests ──────────────────────────────────────────────────

function listManifestFiles(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(SCRIPT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(SCRIPT_DIR, entry.name, "manifest.yml");
    if (existsSync(manifest) && statSync(manifest).isFile()) {
      files.push(manifest);
    }
  }
  return files.sort();
}

// ── Schema validation ───────────────────────────────────────────────────

function loadSchema(): object {
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`✗ schema not found: ${SCHEMA_PATH}`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  } catch (err) {
    console.error(`✗ schema parse error: ${(err as Error).message}`);
    process.exit(2);
  }
}

function loadManifest(path: string): { ok: true; data: Manifest } | { ok: false; err: string } {
  try {
    const text = readFileSync(path, "utf-8");
    const data = parseYaml(text) as Manifest;
    if (!data || typeof data !== "object") {
      return { ok: false, err: "manifest is empty or not a YAML mapping" };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, err: `YAML parse failed: ${(err as Error).message}` };
  }
}

// ── Cross-file companion loaders ────────────────────────────────────────

function loadPublishers(): Set<string> | null {
  if (!existsSync(PUBLISHERS_PATH)) return null;
  const text = readFileSync(PUBLISHERS_PATH, "utf-8");
  const data = parseYaml(text) as PublishersFile;
  if (!data || !Array.isArray(data.publishers)) {
    throw new Error("publishers.yaml: missing top-level `publishers:` array");
  }
  return new Set(data.publishers.map((p) => p.display_name));
}

function loadCategories(): Set<string> | null {
  if (!existsSync(CATEGORIES_PATH)) return null;
  const text = readFileSync(CATEGORIES_PATH, "utf-8");
  const data = parseYaml(text) as CategoriesFile;
  if (!data || !Array.isArray(data.categories)) {
    throw new Error("source-categories.yaml: missing top-level `categories:` array");
  }
  return new Set(data.categories.map((c) => c.id));
}

// ── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  const schema = loadSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const manifestFiles = listManifestFiles();
  if (manifestFiles.length === 0) {
    console.error(`✗ no manifests found under ${SCRIPT_DIR}`);
    process.exit(2);
  }

  console.log(`→ schema check: ${manifestFiles.length} manifests under src/sources/`);

  let schemaFailures = 0;
  const parsedManifests: Array<{ path: string; data: Manifest }> = [];

  for (const path of manifestFiles) {
    const rel = path.slice(SCRIPT_DIR.length + 1);
    const loaded = loadManifest(path);
    if (!loaded.ok) {
      console.error(`  ✗ ${rel}`);
      console.error(`      ${loaded.err}`);
      schemaFailures++;
      continue;
    }
    if (!validate(loaded.data)) {
      console.error(`  ✗ ${rel}`);
      for (const err of validate.errors ?? []) {
        const at = err.instancePath || "/";
        console.error(`      ${at}: ${err.message ?? "(no message)"}`);
      }
      schemaFailures++;
      continue;
    }
    parsedManifests.push({ path, data: loaded.data });
  }

  if (schemaFailures === 0) {
    console.log(`  ✓ all ${manifestFiles.length} manifests pass schema`);
  }

  // ── Cross-file checks ────────────────────────────────────────────────

  console.log(`→ cross-file checks`);
  let crossFailures = 0;

  let categories: Set<string> | null = null;
  try {
    categories = loadCategories();
  } catch (err) {
    console.error(`  ✗ source-categories.yaml: ${(err as Error).message}`);
    crossFailures++;
  }
  if (categories === null) {
    console.warn(`  ⚠ source-categories.yaml not found — skipping topic resolution`);
  } else {
    const unresolved: Array<{ path: string; topic: string }> = [];
    for (const { path, data } of parsedManifests) {
      const topic = data.tags?.topic;
      if (topic && !categories.has(topic)) {
        unresolved.push({ path: path.slice(SCRIPT_DIR.length + 1), topic });
      }
    }
    if (unresolved.length > 0) {
      console.error(`  ✗ ${unresolved.length} manifest(s) have tags.topic not in source-categories.yaml:`);
      for (const u of unresolved) {
        console.error(`      ${u.path}: topic '${u.topic}'`);
      }
      crossFailures++;
    } else {
      console.log(`  ✓ all tags.topic resolve to a category id`);
    }
  }

  let publishers: Set<string> | null = null;
  try {
    publishers = loadPublishers();
  } catch (err) {
    console.error(`  ✗ publishers.yaml: ${(err as Error).message}`);
    crossFailures++;
  }
  if (publishers === null) {
    console.warn(`  ⚠ publishers.yaml not found — skipping publisher resolution`);
  } else {
    const unresolved: Array<{ path: string; publisher: string }> = [];
    for (const { path, data } of parsedManifests) {
      if (data.publisher && !publishers.has(data.publisher)) {
        unresolved.push({ path: path.slice(SCRIPT_DIR.length + 1), publisher: data.publisher });
      }
    }
    if (unresolved.length > 0) {
      console.error(`  ✗ ${unresolved.length} manifest(s) have publisher not in publishers.yaml:`);
      for (const u of unresolved) {
        console.error(`      ${u.path}: publisher '${u.publisher}'`);
      }
      crossFailures++;
    } else {
      console.log(`  ✓ all publisher fields resolve to a publishers.yaml entry`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────

  const total = schemaFailures + crossFailures;
  if (total === 0) {
    console.log(`\n→ validated ${manifestFiles.length} manifests`);
    process.exit(0);
  }
  console.error(`\n✗ ${schemaFailures} schema failure(s), ${crossFailures} cross-file failure(s)`);
  process.exit(1);
}

main();
