#!/usr/bin/env tsx
/**
 * Run every public `npm run ingest:*` source sequentially, validate via
 * `raw.ingest_runs`, and print a final summary.
 *
 * Why this exists:
 *   After a cluster reset, only the dim-spine sources (Klass kommuner /
 *   fylker) are mandatory in the post-reset workflow (see
 *   website/docs/contributors/setup.md § "After a cluster reset / fresh
 *   start" step 6). The rest are catalogued (manifest.yml committed, dbt
 *   models exist, mart_meta_sources knows about them) but their raw.*
 *   tables are empty until someone runs `npm run ingest:<source>` for
 *   each. That's 36+ commands; people skip it; the catalogue's freshness
 *   signals stay null. This script does the catch-up in one command.
 *
 * Usage:
 *   npm run ingest:all                       # all public sources, sequential
 *   npm run ingest:all -- --dry-run          # list what would run, no execution
 *   npm run ingest:all -- --include frr      # also include frr (private)
 *   npm run ingest:all -- --skip fhi-mediebruk-spill,ssb-09429
 *   npm run ingest:all -- --only ssb-08764,fhi-alkohol
 *
 * Validation strategy:
 *   For each source, after the spawn returns, query
 *   `raw.ingest_runs WHERE source_slug = '<source>' ORDER BY run_id DESC LIMIT 1`
 *   and assert `exit_code = 0` and `rows_parsed > 0`. The lifecycle
 *   wrapper at `lib/ingest_run.ts` already populates these fields on
 *   every successful run; this script just consumes them.
 *
 * Exit code:
 *   0 if every source succeeded.
 *   1 if any source failed (process spawn, ingest_runs validation, or both).
 *   2 if the script can't connect to Postgres at startup.
 *
 * Frr is excluded by default — it requires Red Cross internal API access
 * and writes to private_raw.*, not raw.*. Pass --include frr to opt in.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { closeSql, getSql } from "../src/lib/postgres.js";
import { logger } from "../src/lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = resolve(__dirname, "..", "package.json");

/** Sources excluded from `--all` by default. Override via --include. */
const DEFAULT_EXCLUDED = new Set(["frr"]);

type SourceResult = {
  sourceId: string;
  status: "ok" | "spawn-failed" | "validation-failed" | "skipped";
  durationMs: number;
  rowsParsed: number | null;
  exitCode: number | null;
  notes?: string;
};

type Args = {
  dryRun: boolean;
  include: Set<string>;
  skip: Set<string>;
  only: Set<string> | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    include: new Set<string>(),
    skip: new Set<string>(),
    only: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--include" && argv[i + 1]) {
      argv[i + 1]!.split(",").forEach((s) => args.include.add(s.trim()));
      i++;
    } else if (a === "--skip" && argv[i + 1]) {
      argv[i + 1]!.split(",").forEach((s) => args.skip.add(s.trim()));
      i++;
    } else if (a === "--only" && argv[i + 1]) {
      args.only = new Set(argv[i + 1]!.split(",").map((s) => s.trim()));
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npm run ingest:all -- [--dry-run] [--include <ids>] [--skip <ids>] [--only <ids>]",
      );
      process.exit(0);
    }
  }
  return args;
}

/** Discover every `ingest:<source-id>` script declared in package.json,
 *  excluding `ingest:all` itself (would recurse infinitely). */
function discoverIngestScripts(): string[] {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};
  return Object.keys(scripts)
    .filter((k) => k.startsWith("ingest:") && k !== "ingest:all")
    .map((k) => k.slice("ingest:".length))
    .sort();
}

/** Run `npm run ingest:<sourceId>`, return spawn exit code and duration. */
function runIngest(
  sourceId: string,
): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((resolveOuter) => {
    const started = Date.now();
    const child = spawn("npm", ["run", `ingest:${sourceId}`], {
      cwd: resolve(__dirname, ".."),
      stdio: ["ignore", "ignore", "inherit"], // stdout silenced (per-source logs are noisy); stderr inherits so failures surface
      env: process.env,
    });
    child.on("exit", (code) => {
      resolveOuter({
        exitCode: code ?? -1,
        durationMs: Date.now() - started,
      });
    });
    child.on("error", () => {
      resolveOuter({
        exitCode: -1,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * Validate that `raw.ingest_runs` has a recent successful row for this
 * source. Returns rowsParsed on success, null on failure.
 */
async function validateIngestRun(
  sql: ReturnType<typeof getSql>,
  sourceId: string,
  startedAfter: Date,
): Promise<{
  ok: boolean;
  rowsParsed: number | null;
  exitCode: number | null;
  notes?: string;
}> {
  const rows = await sql<
    Array<{
      run_id: number;
      finished_at: Date | null;
      exit_code: number | null;
      rows_parsed: number | null;
      notes: string | null;
    }>
  >`
    select run_id, finished_at, exit_code, rows_parsed, notes
    from raw.ingest_runs
    where source_slug = ${sourceId}
      and started_at >= ${startedAfter}
    order by run_id desc
    limit 1
  `;
  const latest = rows[0];
  if (!latest) {
    return {
      ok: false,
      rowsParsed: null,
      exitCode: null,
      notes: "no ingest_runs row created (script may have crashed before recordIngestRun)",
    };
  }
  if (latest.finished_at === null) {
    return {
      ok: false,
      rowsParsed: latest.rows_parsed,
      exitCode: latest.exit_code,
      notes: "ingest_runs row has no finished_at (run still in progress or crashed)",
    };
  }
  if (latest.exit_code !== 0) {
    return {
      ok: false,
      rowsParsed: latest.rows_parsed,
      exitCode: latest.exit_code,
      notes: latest.notes?.slice(0, 200) ?? `exit_code=${latest.exit_code}`,
    };
  }
  if (latest.rows_parsed === null || latest.rows_parsed === 0) {
    return {
      ok: false,
      rowsParsed: latest.rows_parsed,
      exitCode: latest.exit_code,
      notes: "ingest_runs.rows_parsed is null/0 — upstream returned no rows",
    };
  }
  return {
    ok: true,
    rowsParsed: latest.rows_parsed,
    exitCode: latest.exit_code,
  };
}

function pickSources(all: string[], args: Args): string[] {
  if (args.only) {
    return all.filter((s) => args.only!.has(s));
  }
  return all.filter((s) => {
    if (args.skip.has(s)) return false;
    if (DEFAULT_EXCLUDED.has(s) && !args.include.has(s)) return false;
    return true;
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const allSources = discoverIngestScripts();
  const selected = pickSources(allSources, args);
  const skipped = allSources.filter((s) => !selected.includes(s));

  if (!process.env["DATABASE_URL"]) {
    console.error(
      "ERROR: DATABASE_URL is not set. ingest-all needs a Postgres connection to validate via raw.ingest_runs.",
    );
    return 2;
  }

  console.log(
    `\n=== ingest-all: ${selected.length} sources to run (skipping ${skipped.length}) ===\n`,
  );
  if (skipped.length > 0) {
    console.log(`  skipped: ${skipped.join(", ")}`);
    console.log("");
  }

  if (args.dryRun) {
    console.log("--dry-run — printing the run order, not executing.\n");
    selected.forEach((s, i) =>
      console.log(`  [${i + 1}/${selected.length}] ${s}`),
    );
    return 0;
  }

  const sql = getSql();
  // Sanity probe — fail fast if Postgres is unreachable.
  try {
    await sql`select 1`;
  } catch (err) {
    console.error(
      `ERROR: Postgres unreachable: ${err instanceof Error ? err.message : err}`,
    );
    await closeSql();
    return 2;
  }

  const results: SourceResult[] = [];
  const overallStart = Date.now();

  for (let i = 0; i < selected.length; i++) {
    const sourceId = selected[i]!;
    const label = `[${(i + 1).toString().padStart(2)}/${selected.length}] ${sourceId.padEnd(30)}`;
    process.stdout.write(`${label} … `);

    const runStart = new Date();
    const { exitCode, durationMs } = await runIngest(sourceId);

    if (exitCode !== 0) {
      results.push({
        sourceId,
        status: "spawn-failed",
        durationMs,
        rowsParsed: null,
        exitCode,
        notes: `npm run ingest:${sourceId} exited ${exitCode}`,
      });
      console.log(
        `FAIL  (spawn exit ${exitCode}, ${formatDuration(durationMs)})`,
      );
      continue;
    }

    const v = await validateIngestRun(sql, sourceId, runStart);
    if (!v.ok) {
      results.push({
        sourceId,
        status: "validation-failed",
        durationMs,
        rowsParsed: v.rowsParsed,
        exitCode: v.exitCode,
        notes: v.notes,
      });
      console.log(
        `FAIL  validation: ${v.notes ?? "unknown"} (${formatDuration(durationMs)})`,
      );
      continue;
    }

    results.push({
      sourceId,
      status: "ok",
      durationMs,
      rowsParsed: v.rowsParsed,
      exitCode: v.exitCode,
    });
    console.log(
      `OK    ${(v.rowsParsed ?? 0).toLocaleString().padStart(8)} rows (${formatDuration(durationMs)})`,
    );
  }

  await closeSql();

  // ── Summary ─────────────────────────────────────────────────────────
  const totalDuration = Date.now() - overallStart;
  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status !== "ok");
  const totalRows = ok.reduce((sum, r) => sum + (r.rowsParsed ?? 0), 0);

  console.log("\n=== Summary ===\n");
  console.log(`  Succeeded: ${ok.length}/${selected.length}`);
  console.log(`  Failed:    ${failed.length}/${selected.length}`);
  console.log(`  Rows:      ${totalRows.toLocaleString()} parsed across all sources`);
  console.log(`  Duration:  ${formatDuration(totalDuration)}\n`);

  if (failed.length > 0) {
    console.log("  Failed sources:");
    for (const r of failed) {
      console.log(
        `    ${r.sourceId.padEnd(30)} ${r.status.padEnd(20)} ${r.notes ?? ""}`,
      );
    }
    console.log("");
  }

  if (failed.length === 0) {
    logger.info("ingest_all.done", {
      sources: ok.length,
      rows: totalRows,
      duration_ms: totalDuration,
    });
  }

  return failed.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `ingest-all crashed: ${err instanceof Error ? err.stack : err}`,
    );
    process.exit(1);
  });
