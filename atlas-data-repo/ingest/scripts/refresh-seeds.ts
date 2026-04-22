/**
 * Re-fetch labels for every `dbt/seeds/ref_*.csv` from upstream metadata
 * and overwrite the CSVs in place. Run after upstream codes/labels are
 * suspected to have changed; review `git diff -- ../dbt/seeds/` and commit.
 *
 * Atlas is pre-production: this script always rewrites to current upstream
 * contents, no backward-compat preservation. See `dbt/seeds/README.md`.
 *
 * Decisions/quirks captured during PLAN-001:
 * - SSB exposes labels cleanly at `…/tables/{id}/metadata?lang={no|en}` with
 *   `dimension.<NAME>.category.{index,label}`.
 * - FHI's `/metadata` endpoint returns prose only — no dimension catalog.
 *   Workaround: GET `/query` to discover codes, POST `/data` with all codes
 *   for the target dimension and the first code for every other dimension,
 *   then harvest labels from the json-stat2 response.
 * - FHI publishes Norwegian only; `label_en` stays blank.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableMetadata } from "../src/lib/pxweb.js";
import { logger } from "../src/lib/logger.js";

const SEEDS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../dbt/seeds",
);

const FHI_BASE = "https://statistikk-data.fhi.no/api/open/v1";

type SeedRow = {
  code: string;
  label_no: string;
  label_en: string;
  sort_order: number;
};

type SsbSpec = {
  provider: "ssb";
  file: string;
  tableId: string;
  dimension: string;
};

type FhiSpec = {
  provider: "fhi";
  file: string;
  tableId: number;
  sourceId: string;
  dimension: string;
};

type SeedSpec = SsbSpec | FhiSpec;

const SEEDS: SeedSpec[] = [
  { provider: "ssb", file: "ref_ssb_family_type.csv",    tableId: "06083", dimension: "FamilieType" },
  { provider: "ssb", file: "ref_ssb_household_type.csv", tableId: "06944", dimension: "HusholdType" },
  { provider: "ssb", file: "ref_ssb_nivaa.csv",          tableId: "09429", dimension: "Nivaa" },
  { provider: "fhi", file: "ref_fhi_utdann.csv",         tableId: 794, sourceId: "nokkel", dimension: "UTDANN" },
  { provider: "fhi", file: "ref_fhi_innvkat.csv",        tableId: 360, sourceId: "nokkel", dimension: "INNVKAT" },
];

type JsonStatCategory = {
  index: Record<string, number> | string[];
  label: Record<string, string>;
};

type JsonStatDimension = { category: JsonStatCategory };

type JsonStatLike = { dimension: Record<string, JsonStatDimension> };

type FhiQueryDimension = { code: string; filter: string; values: string[] };
type FhiQuery = { dimensions: FhiQueryDimension[] };

async function fetchSsbDimension(
  spec: SsbSpec,
): Promise<{ codes: string[]; label_no: Record<string, string>; label_en: Record<string, string> }> {
  const [no, en] = await Promise.all([
    fetchPxTableMetadata({ tableId: spec.tableId, lang: "no" }) as Promise<JsonStatLike>,
    fetchPxTableMetadata({ tableId: spec.tableId, lang: "en" }) as Promise<JsonStatLike>,
  ]);

  const dimNo = no.dimension[spec.dimension];
  const dimEn = en.dimension[spec.dimension];
  if (!dimNo || !dimEn) {
    throw new Error(
      `SSB ${spec.tableId}: dimension ${spec.dimension} not found (no: ${!!dimNo}, en: ${!!dimEn})`,
    );
  }

  const codes = orderedCodes(dimNo.category.index);
  return { codes, label_no: dimNo.category.label, label_en: dimEn.category.label };
}

async function fetchFhiDimension(
  spec: FhiSpec,
): Promise<{ codes: string[]; label_no: Record<string, string>; label_en: Record<string, string> }> {
  // Step 1: discover every dimension's codes via the default query body.
  const queryUrl = `${FHI_BASE}/${spec.sourceId}/table/${spec.tableId}/query`;
  const queryRes = await fetch(queryUrl, fhiInit("GET"));
  if (!queryRes.ok) {
    throw new Error(`FHI ${spec.tableId} /query: ${queryRes.status} ${queryRes.statusText}`);
  }
  const query = (await queryRes.json()) as FhiQuery;

  const target = query.dimensions.find((d) => d.code === spec.dimension);
  if (!target) {
    throw new Error(`FHI ${spec.tableId}: dimension ${spec.dimension} not in /query`);
  }

  // Step 2: minimal data POST. Target dimension = all codes; every other
  // dimension = its first code. Asks for one cell per target code, just
  // enough for the response to carry every category label.
  const body = {
    dimensions: query.dimensions.map((d) => ({
      code: d.code,
      filter: "item" as const,
      values: d.code === spec.dimension ? d.values : [d.values[0] ?? ""],
    })),
    response: { format: "json-stat2" as const, maxRowCount: 50_000 },
  };

  const dataUrl = `${FHI_BASE}/${spec.sourceId}/table/${spec.tableId}/data`;
  const dataRes = await fetch(dataUrl, {
    ...fhiInit("POST"),
    body: JSON.stringify(body),
  });
  if (!dataRes.ok) {
    const msg = await dataRes.text().catch(() => "");
    throw new Error(`FHI ${spec.tableId} /data: ${dataRes.status} ${dataRes.statusText}: ${msg.slice(0, 300)}`);
  }
  const data = (await dataRes.json()) as JsonStatLike;

  const dim = data.dimension[spec.dimension];
  if (!dim) {
    throw new Error(`FHI ${spec.tableId}: dimension ${spec.dimension} missing from response`);
  }

  const codes = orderedCodes(dim.category.index);
  return { codes, label_no: dim.category.label, label_en: {} };
}

function fhiInit(method: "GET" | "POST"): RequestInit {
  return {
    method,
    headers: {
      "User-Agent": "atlas-data/0.0 (https://atlas.helpers.no)",
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
  };
}

/**
 * Normalise json-stat2's two `category.index` shapes into a position-ordered
 * code list. SSB uses `{code: position}`; FHI uses `[code, code, …]`.
 */
function orderedCodes(index: Record<string, number> | string[]): string[] {
  if (Array.isArray(index)) return [...index];
  return Object.entries(index)
    .sort(([, a], [, b]) => a - b)
    .map(([code]) => code);
}

function buildRows(
  codes: string[],
  label_no: Record<string, string>,
  label_en: Record<string, string>,
): SeedRow[] {
  return codes.map((code, i) => ({
    code,
    label_no: label_no[code] ?? "",
    label_en: label_en[code] ?? "",
    sort_order: i + 1,
  }));
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowsToCsv(rows: SeedRow[]): string {
  const lines = ["code,label_no,label_en,sort_order"];
  for (const r of rows) {
    lines.push(
      [csvField(r.code), csvField(r.label_no), csvField(r.label_en), String(r.sort_order)].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function diffSummary(prev: SeedRow[], next: SeedRow[]): string {
  const prevByCode = new Map(prev.map((r) => [r.code, r]));
  const nextByCode = new Map(next.map((r) => [r.code, r]));
  let added = 0, removed = 0, changed = 0;
  for (const code of nextByCode.keys()) {
    const before = prevByCode.get(code);
    const after = nextByCode.get(code);
    if (!before) added++;
    else if (after && (before.label_no !== after.label_no || before.label_en !== after.label_en || before.sort_order !== after.sort_order)) {
      changed++;
    }
  }
  for (const code of prevByCode.keys()) {
    if (!nextByCode.has(code)) removed++;
  }
  if (added === 0 && removed === 0 && changed === 0) return "no diff";
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (changed) parts.push(`${changed} changed`);
  return parts.join(", ");
}

async function readExistingCsv(path: string): Promise<SeedRow[]> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const rows: SeedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i] ?? "");
    if (fields.length < 4) continue;
    rows.push({
      code: fields[0] ?? "",
      label_no: fields[1] ?? "",
      label_en: fields[2] ?? "",
      sort_order: Number(fields[3] ?? 0),
    });
  }
  return rows;
}

/** Minimal CSV parser sufficient for our seed format (4 cols, optional quoting). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let v = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; continue; }
        if (line[i] === '"') { i++; break; }
        v += line[i++];
      }
      out.push(v);
      if (line[i] === ",") i++;
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) end = line.length;
      out.push(line.slice(i, end));
      i = end + 1;
      if (i > line.length) break;
    }
  }
  return out;
}

async function refreshOne(spec: SeedSpec): Promise<void> {
  const fetched =
    spec.provider === "ssb" ? await fetchSsbDimension(spec) : await fetchFhiDimension(spec);
  const next = buildRows(fetched.codes, fetched.label_no, fetched.label_en);
  const path = resolve(SEEDS_DIR, spec.file);
  const prev = await readExistingCsv(path);
  const summary = diffSummary(prev, next);
  await writeFile(path, rowsToCsv(next), "utf8");
  logger.info("refresh-seeds.done", {
    file: spec.file,
    codes: next.length,
    diff: summary,
  });
  // Human-friendly stdout line in addition to the structured log.
  console.log(`${spec.file.padEnd(32)} ${String(next.length).padStart(2)} codes  (${summary})`);
}

async function main(): Promise<void> {
  logger.info("refresh-seeds.start", { seeds: SEEDS.length, dir: SEEDS_DIR });
  for (const spec of SEEDS) {
    await refreshOne(spec);
  }
  logger.info("refresh-seeds.complete", { seeds: SEEDS.length });
}

main().catch((err) => {
  logger.error("refresh-seeds.failed", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
