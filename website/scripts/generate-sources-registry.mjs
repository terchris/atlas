#!/usr/bin/env node
/**
 * Generate website/src/data/sources-registry.json from per-source manifests
 * + publishers.yaml + source-categories.yaml.
 *
 * Source of truth is atlas-data/ingest/src/sources/. This script does NOT
 * validate manifest shape — that's check-manifests.sh's job (PLAN-001).
 * The generator trusts the gate and joins data for the catalog UI.
 *
 * Output shape (sources-registry.json):
 *   {
 *     generated_at, manifest_schema_id,
 *     categories[], publishers[],
 *     sources[]: {...manifest fields..., publisher: <resolved>, category: <resolved>,
 *                  atlas_summary, related_by_topic[], sample_query, citation,
 *                  feedback_url}
 *   }
 *
 * Idempotent: re-running with no input changes produces byte-identical output.
 *
 * Usage:
 *   npm run sources:generate     # from website/
 *   node scripts/generate-sources-registry.mjs
 *
 * Wired to `prebuild` so `npm run build` regenerates automatically; the
 * committed JSON is the contract for the CI drift gate (Phase 5 of PLAN-002).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ── Paths ───────────────────────────────────────────────────────────────

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_DIR = resolve(WEBSITE_DIR, '..', 'atlas-data', 'ingest', 'src', 'sources');
const REGISTRY_OUT = resolve(WEBSITE_DIR, 'src', 'data', 'sources-registry.json');
const PUBLISHERS_FILE = resolve(SOURCES_DIR, 'publishers.yaml');
const CATEGORIES_FILE = resolve(SOURCES_DIR, 'source-categories.yaml');
const SCHEMA_FILE = resolve(SOURCES_DIR, 'manifest.schema.json');

const ATLAS_BASE_URL = 'https://atlas.sovereignsky.no';
const POSTGREST_BASE_URL = 'https://api-atlas.sovereignsky.no';

// ── Helpers ──────────────────────────────────────────────────────────────

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'));
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Extract the section under `## Atlas summary` (case-insensitive) from a
 * source's README.md. Returns the prose text between that heading and the
 * next `##` heading or end of file, with surrounding whitespace trimmed.
 */
function extractAtlasSummary(readmePath) {
  if (!existsSync(readmePath)) return null;
  const text = readFileSync(readmePath, 'utf-8');
  const match = text.match(/^##\s+Atlas summary\s*\n([\s\S]*?)(?=\n##\s+|\n*$)/im);
  if (!match) return null;
  const body = match[1].trim();
  return body.length > 0 ? body : null;
}

/**
 * Build the default sample-query URL when the manifest doesn't supply one.
 * Uses the first raw_table (explicit or underscore-translated) and adds limit=5.
 */
function buildDefaultSampleQuery(manifest) {
  const rawTables = Array.isArray(manifest.raw_tables) && manifest.raw_tables.length > 0
    ? manifest.raw_tables
    : [manifest.source_id.replace(/-/g, '_')];
  return `${POSTGREST_BASE_URL}/${rawTables[0]}?limit=5`;
}

/**
 * Build the citation text + BibTeX for a source.
 * Uses landing_page > upstream_url for the canonical URL.
 */
function buildCitation(manifest) {
  const url = manifest.upstream_landing_page || manifest.upstream_url;
  const year = manifest.time_coverage?.end ?? 'n.d.';
  const atlasPermalink = `${ATLAS_BASE_URL}/sources/${manifest.source_id}`;
  const text =
    `${manifest.publisher}. (${year}). ${manifest.upstream_title}. ` +
    `Retrieved from ${url}. Available in Atlas at ${atlasPermalink}.`;
  const bibtex =
    `@misc{atlas_${manifest.source_id.replace(/-/g, '_')},\n` +
    `  author = {${manifest.publisher}},\n` +
    `  title  = {${manifest.upstream_title}},\n` +
    `  year   = {${year}},\n` +
    `  url    = {${url}},\n` +
    `  note   = {Available in Atlas at ${atlasPermalink}}\n` +
    `}`;
  return { text, bibtex };
}

/**
 * For a given source, list up to 6 other source_ids in the same tags.topic.
 * Self-excluded; deterministic order (alphabetical by source_id).
 */
function relatedByTopic(manifest, allManifests) {
  const sameTopic = allManifests
    .filter((m) => m.source_id !== manifest.source_id && m.tags?.topic === manifest.tags?.topic)
    .map((m) => m.source_id)
    .sort();
  return sameTopic.slice(0, 6);
}

// ── Load companion files ────────────────────────────────────────────────

function loadPublishers() {
  const doc = loadYaml(PUBLISHERS_FILE);
  if (!doc || !Array.isArray(doc.publishers)) {
    throw new Error(`${PUBLISHERS_FILE}: missing top-level 'publishers:' array`);
  }
  return doc.publishers;
}

function loadCategories() {
  const doc = loadYaml(CATEGORIES_FILE);
  if (!doc || !Array.isArray(doc.categories)) {
    throw new Error(`${CATEGORIES_FILE}: missing top-level 'categories:' array`);
  }
  return doc.categories;
}

function loadSchemaId() {
  if (!existsSync(SCHEMA_FILE)) return null;
  const schema = loadJson(SCHEMA_FILE);
  return schema.$id ?? null;
}

// ── Walk manifests ──────────────────────────────────────────────────────

function listManifestFiles() {
  const files = [];
  for (const entry of readdirSync(SOURCES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(SOURCES_DIR, entry.name, 'manifest.yml');
    if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
      files.push({ sourceId: entry.name, manifestPath });
    }
  }
  return files.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  const publishers = loadPublishers();
  const categories = loadCategories();
  const schemaId = loadSchemaId();
  const publishersByName = new Map(publishers.map((p) => [p.display_name, p]));
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  const manifestFiles = listManifestFiles();
  const allManifests = manifestFiles.map(({ manifestPath }) => loadYaml(manifestPath));

  const sources = manifestFiles.map(({ sourceId, manifestPath }, idx) => {
    const m = allManifests[idx];
    const readmePath = resolve(SOURCES_DIR, sourceId, 'README.md');
    const atlasSummary = extractAtlasSummary(readmePath);

    const publisher = publishersByName.get(m.publisher);
    if (!publisher) {
      throw new Error(`${sourceId}: publisher '${m.publisher}' not found in publishers.yaml`);
    }
    const category = categoriesById.get(m.tags?.topic);
    if (!category) {
      throw new Error(`${sourceId}: tags.topic '${m.tags?.topic}' not found in source-categories.yaml`);
    }

    const sampleQuery = m.sample_query && m.sample_query.length > 0
      ? m.sample_query
      : buildDefaultSampleQuery(m);

    const feedbackUrl = m.feedback_url && m.feedback_url.length > 0
      ? m.feedback_url
      : publisher.feedback_url;

    return {
      source_id: m.source_id,
      upstream_id: m.upstream_id,
      upstream_url: m.upstream_url,
      upstream_landing_page: m.upstream_landing_page ?? null,
      upstream_title: m.upstream_title,
      description: m.description,
      atlas_summary: atlasSummary,
      publisher: {
        id: publisher.id,
        display_name: publisher.display_name,
        homepage: publisher.homepage,
        logo: publisher.logo,
      },
      category: {
        id: category.id,
        name: category.name,
        emoji: category.emoji,
      },
      license: m.license,
      license_url: m.license_url,
      periodicity: m.periodicity,
      eu_theme: m.eu_theme,
      attribution: m.attribution,
      tags: m.tags,
      keywords: Array.isArray(m.keywords) ? m.keywords : [],
      lifecycle: m.lifecycle,
      time_coverage: m.time_coverage,
      methodology_notes: m.methodology_notes ?? null,
      suggested_joins: Array.isArray(m.suggested_joins) ? m.suggested_joins : [],
      related_by_topic: relatedByTopic(m, allManifests),
      dimensions: Array.isArray(m.dimensions) ? m.dimensions : [],
      raw_tables: Array.isArray(m.raw_tables) ? m.raw_tables : null,
      sample_query: sampleQuery,
      citation: buildCitation(m),
      feedback_url: feedbackUrl,
    };
  });

  // Sort publishers by id for deterministic output.
  const publishersOut = publishers
    .map((p) => ({ ...p, source_count: sources.filter((s) => s.publisher.id === p.id).length }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Sort categories by order, then by id.
  const categoriesOut = categories
    .map((c) => ({ ...c, source_count: sources.filter((s) => s.category.id === c.id).length }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));

  const registry = {
    generated_at: new Date().toISOString().slice(0, 10), // date-stable; not per-second
    manifest_schema_id: schemaId,
    atlas_base_url: ATLAS_BASE_URL,
    postgrest_base_url: POSTGREST_BASE_URL,
    categories: categoriesOut,
    publishers: publishersOut,
    sources,
  };

  mkdirSync(dirname(REGISTRY_OUT), { recursive: true });
  writeFileSync(REGISTRY_OUT, JSON.stringify(registry, null, 2) + '\n', 'utf-8');

  console.log(
    `→ generated ${REGISTRY_OUT.replace(WEBSITE_DIR + '/', '')}: ` +
    `${sources.length} sources, ${categoriesOut.length} categories, ${publishersOut.length} publishers`
  );
}

main();
