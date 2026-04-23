/**
 * Shared helpers for seed sources — dbt seed CSVs that decode upstream codes
 * (per-source decoders), pin authoritative reference standards (ICNPO, SDG),
 * or carry conformed dimensions (postnummer, etc.).
 *
 * Each seed-source module under `src/seed-sources/<id>/index.ts` exports
 * SOURCE_ID and run(). The run() body fetches its rows then calls
 * `runSeedSource(...)` here, which handles diff vs. existing CSV, write,
 * and structured logging uniformly.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPxTableMetadata } from "./pxweb.js";
import { logger } from "./logger.js";

/** Common seed row shape. */
export type SeedRow = {
  code: string;
  label_no: string;
  label_en: string;
  sort_order: number;
};

/** What a fetch produces for `runSeedSource`. */
export type FetchResult = {
  codes: string[];
  label_no: Record<string, string>;
  label_en: Record<string, string>;
};

/** Path to the dbt seeds folder, resolved relative to `ingest/src/lib/`. */
const SEEDS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../dbt/seeds",
);

const FHI_BASE = "https://statistikk-data.fhi.no/api/open/v1";

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

export type SeedSourceOpts = {
  /** Stable id, e.g. "ssb-family-type". Used in logs. */
  sourceId: string;
  /** CSV filename under dbt/seeds/, e.g. "ref_ssb_family_type.csv". */
  seedFile: string;
  /** Returns the codes + labels to write. */
  fetch: () => Promise<FetchResult>;
};

/**
 * Standard seed-refresh flow: fetch → build rows → diff against committed
 * CSV → write → log. Errors propagate; the caller is responsible for
 * `process.exit(1)` on failure.
 */
export async function runSeedSource(opts: SeedSourceOpts): Promise<void> {
  const { sourceId, seedFile, fetch } = opts;
  logger.info("seed.refresh.start", { sourceId, seedFile });

  const fetched = await fetch();
  const next = buildRows(fetched.codes, fetched.label_no, fetched.label_en);
  const path = resolve(SEEDS_DIR, seedFile);
  const prev = await readExistingCsv(path);
  const summary = diffSummary(prev, next);

  await writeFile(path, rowsToCsv(next), "utf8");

  logger.info("seed.refresh.done", {
    sourceId,
    seedFile,
    codes: next.length,
    diff: summary,
  });
  console.log(`${seedFile.padEnd(36)} ${String(next.length).padStart(2)} codes  (${summary})`);
}

/* ------------------------------------------------------------------ */
/* Provider-specific fetchers                                          */
/* ------------------------------------------------------------------ */

type JsonStatCategory = {
  index: Record<string, number> | string[];
  label: Record<string, string>;
};
type JsonStatDimension = { category: JsonStatCategory };
type JsonStatLike = { dimension: Record<string, JsonStatDimension> };

/**
 * Fetch SSB metadata for a dimension in both Norwegian and English. Used by
 * SSB seed-source modules whose canonical labels live in PxWebAPI metadata.
 */
export async function fetchSsbDimension(args: {
  tableId: string;
  dimension: string;
}): Promise<FetchResult> {
  const [no, en] = await Promise.all([
    fetchPxTableMetadata({ tableId: args.tableId, lang: "no" }) as Promise<JsonStatLike>,
    fetchPxTableMetadata({ tableId: args.tableId, lang: "en" }) as Promise<JsonStatLike>,
  ]);

  const dimNo = no.dimension[args.dimension];
  const dimEn = en.dimension[args.dimension];
  if (!dimNo || !dimEn) {
    throw new Error(
      `SSB ${args.tableId}: dimension ${args.dimension} not found (no: ${!!dimNo}, en: ${!!dimEn})`,
    );
  }

  const codes = orderedCodes(dimNo.category.index);
  return { codes, label_no: dimNo.category.label, label_en: dimEn.category.label };
}

type FhiQueryDimension = { code: string; filter: string; values: string[] };
type FhiQuery = { dimensions: FhiQueryDimension[] };

/**
 * Fetch FHI dimension labels via the /query → /data workaround. FHI's
 * /metadata endpoint returns prose only, so we discover codes through
 * /query, then POST a 1-cell /data request with all target codes selected
 * to harvest the json-stat2 response's category labels. FHI publishes
 * Norwegian only; label_en stays empty.
 */
export async function fetchFhiDimension(args: {
  sourceId: string;
  tableId: number;
  dimension: string;
}): Promise<FetchResult> {
  const queryUrl = `${FHI_BASE}/${args.sourceId}/table/${args.tableId}/query`;
  const queryRes = await fetch(queryUrl, fhiInit("GET"));
  if (!queryRes.ok) {
    throw new Error(`FHI ${args.tableId} /query: ${queryRes.status} ${queryRes.statusText}`);
  }
  const query = (await queryRes.json()) as FhiQuery;

  const target = query.dimensions.find((d) => d.code === args.dimension);
  if (!target) {
    throw new Error(`FHI ${args.tableId}: dimension ${args.dimension} not in /query`);
  }

  const body = {
    dimensions: query.dimensions.map((d) => ({
      code: d.code,
      filter: "item" as const,
      values: d.code === args.dimension ? d.values : [d.values[0] ?? ""],
    })),
    response: { format: "json-stat2" as const, maxRowCount: 50_000 },
  };

  const dataUrl = `${FHI_BASE}/${args.sourceId}/table/${args.tableId}/data`;
  const dataRes = await fetch(dataUrl, {
    ...fhiInit("POST"),
    body: JSON.stringify(body),
  });
  if (!dataRes.ok) {
    const msg = await dataRes.text().catch(() => "");
    throw new Error(`FHI ${args.tableId} /data: ${dataRes.status} ${dataRes.statusText}: ${msg.slice(0, 300)}`);
  }
  const data = (await dataRes.json()) as JsonStatLike;

  const dim = data.dimension[args.dimension];
  if (!dim) {
    throw new Error(`FHI ${args.tableId}: dimension ${args.dimension} missing from response`);
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

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Normalise json-stat2's two `category.index` shapes into a position-ordered
 * code list. SSB uses `{code: position}`; FHI uses `[code, code, …]`.
 */
export function orderedCodes(index: Record<string, number> | string[]): string[] {
  if (Array.isArray(index)) return [...index];
  return Object.entries(index)
    .sort(([, a], [, b]) => a - b)
    .map(([code]) => code);
}

export function buildRows(
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

export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowsToCsv(rows: SeedRow[]): string {
  const lines = ["code,label_no,label_en,sort_order"];
  for (const r of rows) {
    lines.push(
      [csvField(r.code), csvField(r.label_no), csvField(r.label_en), String(r.sort_order)].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function diffSummary(prev: SeedRow[], next: SeedRow[]): string {
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

export async function readExistingCsv(path: string): Promise<SeedRow[]> {
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
export function parseCsvLine(line: string): string[] {
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

/**
 * Standard `process.exit(1)` wrapper for seed-source CLI entrypoints.
 * Each `seed-sources/<id>/index.ts` calls this from its bottom guard.
 */
export function runOnError(err: unknown, sourceId: string): void {
  logger.error("seed.refresh.failed", {
    sourceId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Generic runner for seeds with non-standard column shapes            */
/* ------------------------------------------------------------------ */

export type GenericSeedRunOpts = {
  /** Stable id, e.g. "brreg-icnpo". Used in logs. */
  sourceId: string;
  /** CSV filename under dbt/seeds/. */
  seedFile: string;
  /** Column names in order. Becomes the CSV header line. */
  header: readonly string[];
  /** Returns row data as 2D array of strings, same column order as `header`. */
  fetch: () => Promise<readonly (readonly string[])[]>;
};

/**
 * Same flow as `runSeedSource` but for seeds whose columns aren't the
 * code/label_no/label_en/sort_order shape — ICNPO carries a parent_code,
 * dim_postnummer carries postnummer+post_office+kommune_nr, etc. Cells are
 * passed through unchanged; CSV-quoting is applied per cell.
 */
export async function runSeedSourceGeneric(opts: GenericSeedRunOpts): Promise<void> {
  const { sourceId, seedFile, header, fetch } = opts;
  logger.info("seed.refresh.start", { sourceId, seedFile });

  const rows = await fetch();
  const path = resolve(SEEDS_DIR, seedFile);
  const prevText = await readFile(path, "utf8").catch(() => "");
  const nextText = formatCsv(header, rows);
  const summary = computeGenericDiff(prevText, nextText);

  await writeFile(path, nextText, "utf8");

  logger.info("seed.refresh.done", {
    sourceId,
    seedFile,
    rows: rows.length,
    diff: summary,
  });
  console.log(`${seedFile.padEnd(36)} ${String(rows.length).padStart(5)} rows  (${summary})`);
}

function formatCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header.map(csvField).join(",")];
  for (const r of rows) {
    if (r.length !== header.length) {
      throw new Error(
        `Row width ${r.length} does not match header width ${header.length} (row: ${JSON.stringify(r)})`,
      );
    }
    lines.push(r.map(csvField).join(","));
  }
  return lines.join("\n") + "\n";
}

function computeGenericDiff(prevText: string, nextText: string): string {
  if (prevText === nextText) return "no diff";
  const prevLines = new Set(prevText.split(/\r?\n/).filter((l) => l.length > 0).slice(1));
  const nextLines = new Set(nextText.split(/\r?\n/).filter((l) => l.length > 0).slice(1));
  let added = 0, removed = 0;
  for (const l of nextLines) if (!prevLines.has(l)) added++;
  for (const l of prevLines) if (!nextLines.has(l)) removed++;
  if (added === 0 && removed === 0) return "header changed only";
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return parts.join(", ");
}
