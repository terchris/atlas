#!/usr/bin/env tsx
/**
 * Bootstrap a per-source manifest.yml from upstream metadata.
 *
 * Usage:
 *   npm run sources:bootstrap-manifest -- ssb-08764
 *   npm run sources:bootstrap-manifest -- ssb-08764 --force   # overwrite
 *
 * Emits atlas-data/ingest/src/sources/<source_id>/manifest.yml with as
 * many fields pre-filled from the upstream as possible. `description` and
 * `tags:` (topic / geo / cadence) are left as TODO placeholders for human
 * review before commit. License defaults to NLOD for Norwegian public-sector.
 *
 * Provider extractors:
 *   - ssb-NNNNN          → SSB PxWebAPI metadata (lib/pxweb.ts)
 *   - ssb-klass-*        → SSB KLASS classification API (lib/klass.ts)
 *   - fhi-*              → FHI Norgeshelsa metadata (lib/fhi.ts)
 *   - everything else    → fallback template (manual TODOs)
 *
 * Per PLAN-007: subsequent ingest runs DO NOT touch the manifest. This script
 * is for first-time creation only. Refuses to overwrite an existing manifest
 * unless `--force` is passed.
 */

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableMetadata } from "../src/lib/pxweb.js";

type ManifestStub = {
  source_id: string;
  upstream_id: string;
  upstream_url: string;
  upstream_title: string | null;
  publisher: string;
  license: string;
  license_url: string;
  periodicity: string | null;
  /** Free-form prose; left as TODO if unknown. */
  description: string | null;
};

type Provider = "ssb" | "ssb-klass" | "fhi" | "redcross" | "frr" | "unknown";

const NLOD_URL = "https://data.norge.no/nlod/no/2.0";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = resolve(SCRIPT_DIR, "../src/sources");

function detectProvider(sourceId: string): Provider {
  if (sourceId.startsWith("ssb-klass-")) return "ssb-klass";
  if (/^ssb-\d+$/.test(sourceId)) return "ssb";
  if (sourceId.startsWith("fhi-")) return "fhi";
  if (sourceId.startsWith("redcross-")) return "redcross";
  if (sourceId === "frr") return "frr";
  return "unknown";
}

/** Type-narrowing helper for unknown JSON. */
function asRecord(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

/** Try to read a string field; returns null if missing or wrong shape. */
function pickString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

/**
 * SSB PxWebAPI metadata extractor. The metadata response has shape:
 *   { id, label, source, updated, dimension: {...}, link: {...}, ... }
 *
 * We pull title from `label`, publisher from `source`, and infer periodicity
 * from the Tid (time) dimension's value codes if present.
 */
async function extractSsb(sourceId: string): Promise<ManifestStub> {
  const tableId = sourceId.replace(/^ssb-/, "");
  const meta = await fetchPxTableMetadata({ tableId, lang: "no" });
  const root = asRecord(meta);

  const title = pickString(root, "label") ?? pickString(root, "title");
  const publisher = pickString(root, "source") ?? "Statistisk sentralbyrå";

  // Heuristic periodicity from Tid value codes: 4-digit = annual, MNN = monthly,
  // KNN = quarterly. If no Tid dimension, leave null for human review.
  let periodicity: string | null = null;
  const dimension = asRecord(root?.["dimension"]);
  const tid = asRecord(dimension?.["Tid"]);
  const category = asRecord(tid?.["category"]);
  const index = asRecord(category?.["index"]);
  if (index) {
    const codes = Object.keys(index);
    const sample = codes[Math.floor(codes.length / 2)] ?? codes[0];
    if (sample) {
      if (/^\d{4}$/.test(sample)) periodicity = "P1Y";
      else if (/^\d{4}M\d{2}$/.test(sample)) periodicity = "P1M";
      else if (/^\d{4}K\d$/.test(sample)) periodicity = "P3M";
    }
  }

  return {
    source_id: sourceId,
    upstream_id: tableId,
    upstream_url: `https://www.ssb.no/statbank/table/${tableId}`,
    upstream_title: title,
    publisher,
    license: "NLOD",
    license_url: NLOD_URL,
    periodicity,
    description: null,
  };
}

/**
 * SSB KLASS extractor. KLASS has a separate REST API. Hardcoded for the two
 * existing sources (kommuner, fylker); falls back to template for anything
 * else.
 */
function extractSsbKlass(sourceId: string): ManifestStub {
  const known: Record<string, { id: string; title: string }> = {
    "ssb-klass-kommuner": { id: "131", title: "Standard for kommuneinndeling" },
    "ssb-klass-fylker": { id: "104", title: "Standard for fylkesinndeling" },
  };
  const entry = known[sourceId];
  return {
    source_id: sourceId,
    upstream_id: entry?.id ?? "",
    upstream_url: entry
      ? `https://www.ssb.no/klass/klassifikasjoner/${entry.id}`
      : `https://www.ssb.no/klass/`,
    upstream_title: entry?.title ?? null,
    publisher: "Statistisk sentralbyrå",
    license: "NLOD",
    license_url: NLOD_URL,
    periodicity: "irregular",
    description: null,
  };
}

/**
 * FHI fallback. Norgeshelsa exposes json-stat2 endpoints but the metadata
 * shape varies per indicator. For v1, we don't fetch — emit a template with
 * NLOD defaults; the human fills in upstream_title + upstream_id from the
 * existing per-source README.
 *
 * upstream_url left as TODO — fill-manifest-todos.ts derives the API
 * endpoint URL from the upstream_id once known
 * (https://statistikk-data.fhi.no/api/open/v1/nokkel/table/<id>). The
 * generic fhi.no homepage is not a useful catalogue link for shoppers.
 */
function extractFhi(sourceId: string): ManifestStub {
  return {
    source_id: sourceId,
    upstream_id: "TODO",
    upstream_url: "TODO",
    upstream_title: null,
    publisher: "Folkehelseinstituttet",
    license: "NLOD",
    license_url: NLOD_URL,
    periodicity: null,
    description: null,
  };
}

/**
 * Red Cross fallback. Web-scrape source; no structured upstream metadata API.
 */
function extractRedCross(sourceId: string): ManifestStub {
  return {
    source_id: sourceId,
    upstream_id: "TODO",
    upstream_url: "https://www.rodekors.no/",
    upstream_title: null,
    publisher: "Norges Røde Kors",
    license: "TODO",
    license_url: "TODO",
    periodicity: "irregular",
    description: null,
  };
}

/** Generic fallback for unknown providers. */
function extractFallback(sourceId: string): ManifestStub {
  return {
    source_id: sourceId,
    upstream_id: "TODO",
    upstream_url: "TODO",
    upstream_title: null,
    publisher: "TODO",
    license: "TODO",
    license_url: "TODO",
    periodicity: null,
    description: null,
  };
}

/**
 * Render a ManifestStub to YAML. Hand-rolled (no yaml lib dep). Output is
 * trivially simple: 8 top-level scalars + a `tags:` map of 4 entries.
 *
 * Multi-line strings use the `|` block-scalar form with a trailing newline.
 * Strings containing : or # are wrapped in double quotes for safety.
 */
function renderManifest(m: ManifestStub): string {
  const lines: string[] = [];
  lines.push(`# Auto-generated by bootstrap-manifest.ts. Review TODO fields before committing.`);
  lines.push(`# After commit, this file is human-authored — ingest runs do NOT modify it.`);
  lines.push(``);
  lines.push(`source_id: ${m.source_id}`);
  lines.push(`upstream_id: ${quote(m.upstream_id)}`);
  lines.push(`upstream_url: ${m.upstream_url}`);
  if (m.upstream_title) {
    lines.push(`upstream_title: ${blockScalar(m.upstream_title)}`);
  } else {
    lines.push(`upstream_title: TODO  # the upstream's authoritative title (often Norwegian)`);
  }
  if (m.description) {
    lines.push(`description: ${blockScalar(m.description)}`);
  } else {
    lines.push(`description: TODO  # one paragraph framing the dataset for the customer-facing catalogue`);
  }
  lines.push(`publisher: ${quote(m.publisher)}`);
  lines.push(`license: ${m.license}`);
  lines.push(`license_url: ${m.license_url}`);
  if (m.periodicity) {
    lines.push(`periodicity: ${m.periodicity}`);
  } else {
    lines.push(`periodicity: TODO  # ISO 8601 — P1Y annual, P3M quarterly, P1M monthly, irregular`);
  }
  lines.push(``);
  lines.push(`tags:`);
  lines.push(`  provider: ${guessProviderTag(m.source_id)}`);
  lines.push(`  topic: TODO       # demographics / income / education / health / social / ngo-supply / reference`);
  lines.push(`  geo: TODO         # kommune / fylke / national / bydel`);
  lines.push(`  cadence: TODO     # annual / quarterly / monthly / irregular / one-shot`);
  lines.push(``);
  return lines.join("\n");
}

function guessProviderTag(sourceId: string): string {
  if (sourceId.startsWith("ssb-")) return "ssb";
  if (sourceId.startsWith("fhi-")) return "fhi";
  if (sourceId.startsWith("redcross-")) return "redcross";
  if (sourceId === "frr") return "redcross";
  return "TODO";
}

/** YAML quote a string only if it needs it (contains : or # or starts with ?). */
function quote(s: string): string {
  if (!s) return '""';
  if (/[:#?]|^[!&*-]/.test(s)) return JSON.stringify(s);
  return s;
}

/** YAML block scalar (`|-`-style) preserving newlines, with 2-space indent. */
function blockScalar(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.includes("\n")) return JSON.stringify(trimmed);
  const indented = trimmed
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `|\n${indented}`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sourceId = argv.find((a) => !a.startsWith("--"));
  const force = argv.includes("--force");

  if (!sourceId) {
    console.error("usage: npm run sources:bootstrap-manifest -- <source_id> [--force]");
    process.exit(2);
  }

  const sourceDir = resolve(SOURCES_DIR, sourceId);
  if (!existsSync(sourceDir)) {
    console.error(`source folder not found: ${sourceDir}`);
    console.error(`(create it first via the standard adding-a-source workflow)`);
    process.exit(2);
  }

  const manifestPath = resolve(sourceDir, "manifest.yml");
  if (existsSync(manifestPath) && !force) {
    console.error(`manifest already exists: ${manifestPath}`);
    console.error(`pass --force to overwrite, or edit by hand`);
    process.exit(1);
  }

  const provider = detectProvider(sourceId);
  let stub: ManifestStub;

  switch (provider) {
    case "ssb":
      console.error(`fetching SSB metadata for ${sourceId}…`);
      stub = await extractSsb(sourceId);
      break;
    case "ssb-klass":
      stub = extractSsbKlass(sourceId);
      break;
    case "fhi":
      stub = extractFhi(sourceId);
      break;
    case "redcross":
      stub = extractRedCross(sourceId);
      break;
    case "frr":
      stub = extractFallback(sourceId);
      stub.publisher = "Norges Røde Kors (private FRR register)";
      stub.license = "internal";
      stub.license_url = "internal";
      break;
    default:
      stub = extractFallback(sourceId);
  }

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, renderManifest(stub), "utf8");
  console.error(`wrote ${manifestPath}`);
  if (Object.values(stub).some((v) => v === null) || provider !== "ssb") {
    console.error(`note: review TODO fields before committing`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
