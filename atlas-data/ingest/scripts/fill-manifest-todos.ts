#!/usr/bin/env tsx
/**
 * Fills TODO fields in each source's manifest.yml by reading the existing
 * per-source README.md and applying heuristics.
 *
 * - description       → first descriptive paragraph from the README
 * - upstream_id       → from the README's Upstream table ("Table id" row)
 * - upstream_title    → from the README's H1 + intro line
 * - license           → from the README's Upstream table ("Licence" / "License" row)
 * - tags.topic        → keyword-pattern match on title + description
 * - tags.geo          → heuristic from source_id + content (default kommune)
 * - tags.cadence      → mapped from periodicity field
 *
 * Run after bootstrap-manifest.ts (which fetches API metadata + writes the
 * skeletons). This script does not touch fields that are already filled (no
 * `TODO` value).
 *
 * Usage:
 *   npm run sources:fill-manifest-todos        # all sources
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = resolve(SCRIPT_DIR, "../src/sources");

type Dimension = {
  code: string;
  meaning: string;
  value_format: string;
  notes: string;
};

type Manifest = {
  source_id: string;
  upstream_id: string;
  upstream_url: string;
  upstream_title: string | null;
  description: string | null;
  publisher: string;
  license: string;
  license_url: string;
  periodicity: string | null;
  eu_theme: string | null;
  attribution: string | null;
  tags: { provider: string; topic: string; geo: string; cadence: string };
  dimensions: Dimension[];
};

/**
 * Topic keyword patterns — first match wins. Norwegian + English.
 * Order matters: more specific rules first; broad ones last.
 *
 * `helse` (Norwegian for health) is deliberately NOT in the health rule —
 * "Folkehelsestatistikk" (FHI's bureau name) contains "helse" and would
 * incorrectly match every FHI source as health-topic.
 *
 * The ngo-supply rule requires explicitly NGO-related vocabulary (Røde Kors,
 * lokallag, etc.) — generic "tjeneste" or "aktivitet" alone are too broad
 * (they catch health/care services like omsorgstjenester).
 */
const TOPIC_RULES: Array<{ topic: string; pattern: RegExp }> = [
  { topic: "ngo-supply",   pattern: /røde kors|red cross|lokallag|distrikt(er)?\b|chapter|branch|frivillig|ngo|organisasjons.?api|orgnr/i },
  { topic: "reference",    pattern: /klassifikasjon|kommuneinndeling|fylkesinndeling|kodeliste|standard for/i },
  { topic: "income",       pattern: /lavinntekt|low.?income|husholdningsinntekt|household.?income|fattig|poverty|inntekt|formue/i },
  { topic: "education",    pattern: /utdann|videregåen|gjennomf[øo]r|vgs|completion|elev|education|skole|mobbing|bullying|attainment|niv[åa]|vgs.?gjennom/i },
  { topic: "health",       pattern: /\bhealth\b|omsorg|nursing|home.?care|sykehjem|pleie|hjemmetjeneste/i },
  { topic: "social",       pattern: /sosialhjelp|sosialst[øo]nad|social.?assistance|stønad|trygd|welfare|trangbodd|overcrowded|bostøtte|housing/i },
  { topic: "demographics", pattern: /befolkning|population|alder\b|age\b|kjønn|sex|husholdning|household|familie|family|enslig|alone|single|innvandr|fødte|d[øo]de|migration|bor alene/i },
];

/** Geo overrides per source_id where the default heuristic isn't right. */
const GEO_OVERRIDES: Record<string, string> = {
  "ssb-klass-fylker": "fylke",
  "ssb-klass-kommuner": "kommune",
  "frr": "national",
};

/**
 * Mapping from Atlas-domain `tags.topic` to EU Publications Office Data Theme
 * (DCAT-AP `dcat:theme`). Coarser than Atlas topics — income / social /
 * demographics / ngo-supply all collapse to SOCI ("Population and society"),
 * which is the right call: SOCI is the federated-discovery bucket those
 * datasets live in on data.norge.no and data.europa.eu. Atlas keeps the
 * finer-grained `topic` for its own UX. See
 * INVESTIGATE-felles-datakatalog-classification.md.
 */
const TOPIC_TO_EU_THEME: Record<string, string> = {
  demographics: "SOCI",
  income: "SOCI",
  social: "SOCI",
  "ngo-supply": "SOCI",
  education: "EDUC",
  health: "HEAL",
  reference: "GOVE",
};

/** Last-resort topic when nothing matches. */
const TOPIC_FALLBACK: Record<string, string> = {
  "frr": "ngo-supply",
};

/** Description fallbacks for the few sources whose README text is sparse. */
const DESCRIPTION_FALLBACKS: Record<string, string> = {
  frr: "Norges Røde Kors's internal Frivillig Resource Register (FRR) — operational data on volunteer resources, status, and positions. Private; never exposed via the public API.",
};

/**
 * Hardcoded overrides for sources whose READMEs don't follow the
 * SSB/FHI Upstream-table format. Applied only when the field is still TODO
 * after README parsing.
 */
const MANUAL_OVERRIDES: Record<string, Partial<Manifest>> = {
  "redcross-branches": {
    upstream_id: "organizations-api",
    upstream_url: "https://api.redcross.no/nrx/v1/organizations",
    upstream_title: "Norges Røde Kors Organizations API — branches + per-branch activities",
    license: "permissive",
    license_url: "https://www.rodekors.no/personvern/",
    attribution: "Norges Røde Kors, Organizations API",
  },
  "frr": {
    upstream_id: "frr",
    // FRR is internal — no public canonical URL; rodekors.no is the closest
    // public-facing parent reference.
    upstream_url: "https://www.rodekors.no/",
    upstream_title: "Frivillig Resource Register (FRR) — Norges Røde Kors internal volunteer register",
    attribution: "Norges Røde Kors, Frivillig Resource Register (FRR) — internal data",
  },
};

function parseExistingManifest(yaml: string): Manifest | null {
  // Minimal hand-rolled parser; the manifest shape is shallow enough.
  const lines = yaml.split("\n");
  const obj: Record<string, unknown> = {};
  const tags: Record<string, string> = {};
  let inTags = false;
  let multiKey: string | null = null;
  let multiBuf: string[] = [];

  const finishMulti = () => {
    if (multiKey) {
      obj[multiKey] = multiBuf.join("\n").trim();
      multiKey = null;
      multiBuf = [];
    }
  };

  for (const raw of lines) {
    if (multiKey) {
      // Stop multiline at next non-indented line
      if (/^\S/.test(raw) || raw === "") {
        finishMulti();
        // fallthrough to normal parsing below
      } else {
        multiBuf.push(raw.replace(/^  /, ""));
        continue;
      }
    }
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "tags:") {
      inTags = true;
      continue;
    }
    if (inTags && /^\S/.test(raw)) {
      // dedented out of tags
      inTags = false;
    }
    if (inTags) {
      const m = raw.match(/^\s+(provider|topic|geo|cadence):\s*(.*?)(\s*#.*)?$/);
      if (m) tags[m[1]!] = unquote(m[2]!.trim().replace(/\s+#.*$/, ""));
      continue;
    }
    const m = raw.match(/^([a-z_]+):\s*(.*?)(\s+#.*)?$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    const v = (valRaw ?? "").trim().replace(/\s+#.*$/, "");
    if (v === "|") {
      multiKey = key!;
      multiBuf = [];
    } else {
      obj[key!] = unquote(v);
    }
  }
  finishMulti();

  const r = obj as Record<string, string | undefined>;
  return {
    source_id: r["source_id"] ?? "",
    upstream_id: r["upstream_id"] ?? "",
    upstream_url: r["upstream_url"] ?? "",
    upstream_title: r["upstream_title"] ?? null,
    description: r["description"] ?? null,
    publisher: r["publisher"] ?? "",
    license: r["license"] ?? "",
    license_url: r["license_url"] ?? "",
    periodicity: r["periodicity"] ?? null,
    eu_theme: r["eu_theme"] ?? null,
    attribution: r["attribution"] ?? null,
    tags: {
      provider: tags["provider"] ?? "TODO",
      topic: tags["topic"] ?? "TODO",
      geo: tags["geo"] ?? "TODO",
      cadence: tags["cadence"] ?? "TODO",
    },
    // Dimensions are hand-authored by the contributor; the parser preserves
    // whatever's already in the YAML. The parser is intentionally minimal —
    // it doesn't try to reconstruct the dimensions array shape.
    dimensions: parseExistingDimensions(yaml),
  };
}

/**
 * Best-effort parser for the `dimensions:` block. The block is a YAML list of
 * mappings; we don't pretty-print or normalise — we just preserve the raw
 * bytes between `dimensions:` and the next top-level key, so subsequent
 * passes through the renderer don't lose hand-authored content. Returns []
 * when the block is missing or empty.
 */
function parseExistingDimensions(yaml: string): Dimension[] {
  const lines = yaml.split("\n");
  let inDims = false;
  let current: Partial<Dimension> | null = null;
  const dims: Dimension[] = [];
  for (const raw of lines) {
    if (raw.startsWith("dimensions:")) {
      inDims = true;
      continue;
    }
    if (!inDims) continue;
    if (/^\S/.test(raw) || raw === "") {
      // dedented out of dimensions block
      if (current && current.code) dims.push(completeDimension(current));
      current = null;
      inDims = false;
      continue;
    }
    const itemMatch = raw.match(/^\s*-\s+code:\s*(.*)$/);
    if (itemMatch) {
      if (current && current.code) dims.push(completeDimension(current));
      current = { code: unquote(itemMatch[1]!.trim()) };
      continue;
    }
    const keyMatch = raw.match(/^\s+(meaning|value_format|notes):\s*(.*)$/);
    if (keyMatch && current) {
      const [, key, val] = keyMatch;
      (current as Record<string, string>)[key!] = unquote(val!.trim());
    }
  }
  if (current && current.code) dims.push(completeDimension(current));
  return dims;
}

function completeDimension(p: Partial<Dimension>): Dimension {
  return {
    code: p.code ?? "",
    meaning: p.meaning ?? "",
    value_format: p.value_format ?? "",
    notes: p.notes ?? "",
  };
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      return JSON.parse(t.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function isTodo(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v === "TODO" || v.startsWith("TODO ") || v === "" || v === "null";
}

function readReadme(sourceDir: string): string {
  const path = join(sourceDir, "README.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

/** Extract a value from the README's Upstream markdown table by key name. */
function lookupReadmeUpstream(readme: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`\\|\\s*${key}\\s*\\|\\s*([^|]+?)\\s*\\|`, "i");
    const m = readme.match(re);
    if (m && m[1]) {
      // Strip Markdown code formatting (`like-this`) so values like `187`
      // come out as 187 not "`187`".
      return m[1].trim().replace(/^`(.+)`$/, "$1").trim();
    }
  }
  return null;
}

/** Pull a clean description from the README — the first prose paragraph. */
function extractDescription(readme: string, sourceId: string): string | null {
  // Take the first non-heading paragraph after the H1.
  const lines = readme.split("\n");
  let started = false;
  let buffer: string[] = [];
  for (const line of lines) {
    if (line.startsWith("# ")) {
      started = true;
      continue;
    }
    if (!started) continue;
    if (line.startsWith("##")) break; // hit the next subheading
    if (line.trim() === "" && buffer.length > 0) break; // paragraph end
    if (line.trim() === "") continue;
    buffer.push(line.trim());
  }
  if (buffer.length === 0) return DESCRIPTION_FALLBACKS[sourceId] ?? null;
  // Strip Markdown formatting that won't render well in YAML scalar contexts.
  let text = buffer
    .join(" ")
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1")     // italics
    .replace(/`([^`]+)`/g, "$1")       // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\s+/g, " ")
    .trim();
  // Tidy length — keep it short for the catalogue
  if (text.length > 400) {
    const cut = text.slice(0, 400);
    const lastDot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    text = (lastDot > 200 ? cut.slice(0, lastDot + 1) : cut + "…").trim();
  }
  return text;
}

function deriveTopic(title: string, description: string, sourceId: string): string {
  const blob = `${title} ${description}`;
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(blob)) return rule.topic;
  }
  return TOPIC_FALLBACK[sourceId] ?? "demographics";
}

function deriveGeo(sourceId: string, readme: string, title: string): string {
  if (GEO_OVERRIDES[sourceId]) return GEO_OVERRIDES[sourceId]!;
  const blob = `${title}\n${readme}`;
  // Priority: kommune > fylke > bydel > national. Most Atlas data is
  // kommune-level even when bydel is mentioned in passing.
  if (/\bkommun|\bK\)\s|\(K\)|kostra/i.test(blob)) return "kommune";
  if (/\bfylke/i.test(blob)) return "fylke";
  if (/\bbydel/i.test(blob)) return "bydel";
  return "kommune";
}

function deriveCadence(periodicity: string | null): string {
  if (!periodicity) return "irregular";
  switch (periodicity) {
    case "P1Y": return "annual";
    case "P3M": return "quarterly";
    case "P1M": return "monthly";
    case "P1D": return "daily";
    case "irregular": return "irregular";
    default: return "irregular";
  }
}

/** Re-emit YAML deterministically from a complete Manifest. */
function renderManifest(m: Manifest): string {
  const lines: string[] = [];
  lines.push(`# Bootstrapped by bootstrap-manifest.ts; auto-fillable fields populated by fill-manifest-todos.ts.`);
  lines.push(`# The dimensions: block is hand-authored — editorial semantics the catalogue can't compute.`);
  lines.push(`# After commit, this file is human-authored — ingest runs do NOT modify it.`);
  lines.push(``);
  lines.push(`source_id: ${m.source_id}`);
  lines.push(`upstream_id: ${quote(m.upstream_id)}`);
  lines.push(`upstream_url: ${m.upstream_url}`);
  lines.push(`upstream_title: ${blockOrInline(m.upstream_title ?? "")}`);
  lines.push(`description: ${blockOrInline(m.description ?? "")}`);
  lines.push(`publisher: ${quote(m.publisher)}`);
  lines.push(`license: ${m.license}`);
  lines.push(`license_url: ${m.license_url}`);
  lines.push(`periodicity: ${m.periodicity ?? ""}`);
  lines.push(`eu_theme: ${m.eu_theme ?? ""}`);
  lines.push(`attribution: ${blockOrInline(m.attribution ?? "")}`);
  lines.push(``);
  lines.push(`tags:`);
  lines.push(`  provider: ${m.tags.provider}`);
  lines.push(`  topic: ${m.tags.topic}`);
  lines.push(`  geo: ${m.tags.geo}`);
  lines.push(`  cadence: ${m.tags.cadence}`);
  lines.push(``);
  if (m.dimensions.length === 0) {
    lines.push(`dimensions: []  # TODO list each upstream dimension: code, meaning, value_format, notes`);
  } else {
    lines.push(`dimensions:`);
    for (const d of m.dimensions) {
      lines.push(`  - code: ${quote(d.code)}`);
      lines.push(`    meaning: ${quote(d.meaning)}`);
      lines.push(`    value_format: ${quote(d.value_format)}`);
      lines.push(`    notes: ${quote(d.notes)}`);
    }
  }
  lines.push(``);
  return lines.join("\n");
}

function quote(s: string): string {
  if (!s) return '""';
  if (/[:#?]|^[!&*-]/.test(s)) return JSON.stringify(s);
  return s;
}

function blockOrInline(s: string): string {
  if (!s) return "";
  if (s.includes("\n")) {
    const indented = s
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    return `|\n${indented}`;
  }
  return JSON.stringify(s);
}

/** Try to extract a likely upstream_title from the README itself. */
function extractTitleFromReadme(readme: string): string | null {
  const intro = readme.split("\n").slice(0, 8).join(" ");
  // Pattern: "tabell 187 — \"Personer som bor alene\""
  const quoted = intro.match(/[""]([^""]{4,120})[""]/);
  if (quoted && quoted[1]) return cleanTitle(quoted[1]);
  // Pattern: "tabell 377 — *Mobbing, 7. og 10. klasse, 3-årige tall*"
  // Italic emphasis is the most reliable signal; allows periods inside the title.
  const italic = intro.match(/(?:tabell|table)\s+\S+\s*[—–-]\s*\*([^*\n]{4,160})\*/i);
  if (italic && italic[1]) return cleanTitle(italic[1]);
  // Pattern: "table 08764 — Personer under 18 år..."
  const dashed = intro.match(/(?:tabell|table)\s+\S+\s*[—–-]\s*([^.\n]{4,120})/i);
  if (dashed && dashed[1]) return cleanTitle(dashed[1]);
  return null;
}

/** Strip Markdown emphasis + trailing punctuation that leak into titles. */
function cleanTitle(s: string): string {
  return s
    .replace(/^\s*\*+/, "")     // leading *bold or *italic
    .replace(/\*+\s*$/, "")     // trailing emphasis
    .replace(/^\s*"+/, "")      // leading quotes
    .replace(/"+\s*$/, "")      // trailing quotes
    .replace(/\s+/g, " ")
    .trim();
}

function fillOne(sourceDir: string): { sourceId: string; changed: boolean; warnings: string[] } {
  const manifestPath = join(sourceDir, "manifest.yml");
  if (!existsSync(manifestPath)) return { sourceId: "?", changed: false, warnings: ["no manifest.yml"] };
  const before = readFileSync(manifestPath, "utf8");
  const m = parseExistingManifest(before);
  if (!m) return { sourceId: "?", changed: false, warnings: ["parse failed"] };

  const readme = readReadme(sourceDir);
  const warnings: string[] = [];
  let touched = false;

  const overrides = MANUAL_OVERRIDES[m.source_id] ?? {};

  // upstream_id
  if (isTodo(m.upstream_id)) {
    const v = lookupReadmeUpstream(readme, ["Table id", "Source"]) ?? overrides.upstream_id ?? null;
    if (v) {
      m.upstream_id = v;
      touched = true;
    } else warnings.push("no upstream_id");
  }
  // upstream_url — manual override > derived from upstream_id (FHI/SSB) >
  // README's `URL` row. The generic provider homepage (fhi.no, rodekors.no)
  // is not a useful catalogue link for shoppers; we deep-link to the
  // table/API endpoint instead.
  if (isTodo(m.upstream_url)) {
    let derived: string | null = null;
    if (overrides.upstream_url) derived = overrides.upstream_url;
    else if (m.source_id.startsWith("fhi-") && !isTodo(m.upstream_id)) {
      derived = `https://statistikk-data.fhi.no/api/open/v1/nokkel/table/${m.upstream_id}`;
    } else if (m.source_id.startsWith("ssb-klass-") && !isTodo(m.upstream_id)) {
      derived = `https://www.ssb.no/klass/klassifikasjoner/${m.upstream_id}`;
    } else if (m.source_id.startsWith("ssb-") && !isTodo(m.upstream_id)) {
      derived = `https://www.ssb.no/statbank/table/${m.upstream_id}`;
    } else {
      derived = lookupReadmeUpstream(readme, ["URL"]);
    }
    if (derived) {
      m.upstream_url = derived;
      touched = true;
    } else warnings.push("no upstream_url");
  }
  // upstream_title
  if (isTodo(m.upstream_title)) {
    const v = extractTitleFromReadme(readme) ?? overrides.upstream_title ?? null;
    if (v) {
      m.upstream_title = v;
      touched = true;
    } else warnings.push("no upstream_title");
  }
  // license / license_url overrides for sources without a clean Upstream table
  if (isTodo(m.license) && overrides.license) {
    m.license = overrides.license;
    touched = true;
  }
  if (isTodo(m.license_url) && overrides.license_url) {
    m.license_url = overrides.license_url;
    touched = true;
  }
  // attribution — prefer the Upstream-table row, fall back to the
  // "Attribution: *Kilde: ...*" prose pattern (used by some KOSTRA sources
  // whose Upstream table is condensed to Table id + URL).
  if (isTodo(m.attribution)) {
    const fromTable = lookupReadmeUpstream(readme, ["Attribution"]);
    const fromProse = readme.match(/Attribution:\s*\*?([^*\n]+)\*?/i)?.[1] ?? null;
    const v = fromTable ?? fromProse ?? overrides.attribution ?? null;
    if (v) {
      // Strip surrounding markdown emphasis (*Kilde: ...*) and trailing
      // sentence punctuation that follows in prose form.
      const cleaned = v
        .replace(/^\*+/, "")
        .replace(/\*+$/, "")
        .replace(/[.;]+$/, "")
        .trim();
      m.attribution = cleaned;
      touched = true;
    } else warnings.push("no attribution");
  }
  // license / license_url — keep what bootstrap set unless explicit TODO
  if (isTodo(m.license)) {
    const v = lookupReadmeUpstream(readme, ["Licence", "License"]);
    if (v) {
      // Pick the canonical token: NLOD if mentioned, otherwise the literal text.
      m.license = /nlod/i.test(v) ? "NLOD" : v.replace(/\(.*?\)/g, "").trim();
      if (m.license === "NLOD" && isTodo(m.license_url)) {
        m.license_url = "https://data.norge.no/nlod/no/2.0";
      }
      touched = true;
    }
  }
  if (isTodo(m.license_url) && m.license === "NLOD") {
    m.license_url = "https://data.norge.no/nlod/no/2.0";
    touched = true;
  }
  // description
  if (isTodo(m.description)) {
    const v = extractDescription(readme, m.source_id);
    if (v) {
      m.description = v;
      touched = true;
    } else warnings.push("no description");
  }
  // periodicity — leave whatever bootstrap inferred; only fill if still TODO
  if (isTodo(m.periodicity)) {
    if (m.source_id.startsWith("ssb-klass-")) m.periodicity = "irregular";
    else if (m.source_id === "redcross-branches") m.periodicity = "irregular";
    else if (m.source_id === "frr") m.periodicity = "irregular";
    else m.periodicity = "P1Y"; // FHI tables are mostly annual
    touched = true;
  }

  // Tags
  const titleBlob = m.upstream_title ?? "";
  const descBlob = m.description ?? "";
  if (isTodo(m.tags.topic)) {
    m.tags.topic = deriveTopic(titleBlob, descBlob, m.source_id);
    touched = true;
  }
  if (isTodo(m.tags.geo)) {
    m.tags.geo = deriveGeo(m.source_id, readme, titleBlob);
    touched = true;
  }
  if (isTodo(m.tags.cadence)) {
    m.tags.cadence = deriveCadence(m.periodicity);
    touched = true;
  }

  // EU Data Theme — derived from topic via the static map (per
  // INVESTIGATE-felles-datakatalog-classification.md). Cardinality is one;
  // multi-theme sources can override by hand-editing the manifest.
  if (isTodo(m.eu_theme)) {
    const derived = TOPIC_TO_EU_THEME[m.tags.topic];
    if (derived) {
      m.eu_theme = derived;
      touched = true;
    } else {
      warnings.push(`no eu_theme mapping for topic '${m.tags.topic}'`);
    }
  }

  if (!touched) return { sourceId: m.source_id, changed: false, warnings };
  writeFileSync(manifestPath, renderManifest(m), "utf8");
  return { sourceId: m.source_id, changed: true, warnings };
}

function main(): void {
  const folders = readdirSync(SOURCES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  let touchedCount = 0;
  for (const folder of folders) {
    const result = fillOne(join(SOURCES_DIR, folder));
    const status = result.changed ? "filled" : "skip  ";
    const warn = result.warnings.length > 0 ? `  (warn: ${result.warnings.join(", ")})` : "";
    console.error(`${status}  ${result.sourceId}${warn}`);
    if (result.changed) touchedCount++;
  }
  console.error(`\nfilled ${touchedCount} of ${folders.length} manifests`);
}

main();
