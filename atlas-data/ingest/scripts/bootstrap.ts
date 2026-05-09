#!/usr/bin/env tsx
/**
 * One-command bootstrap from a fresh cluster to "every queryable endpoint
 * has rows". Replaces the multi-step post-reset workflow.
 *
 * Eight phases, sequential, idempotent:
 *
 *   1. migrate                 — applies every pending raw.* migration
 *   2. refresh:<id>            — runs every refresh:* whose seed-source
 *                                writes to raw.* (currently just
 *                                brreg-enheter; detected at runtime by
 *                                grepping src/seed-sources/<id>/index.ts
 *                                for "raw.")
 *   3. ingest:<id>             — runs every ingest:* (41 sources today),
 *                                validating each via raw.ingest_runs (same
 *                                logic the old ingest-all.ts had)
 *   4. dbt seed                — loads atlas-data/dbt/seeds/*.csv into
 *                                marts.* (committed CSVs survive the reset)
 *   5. dbt run                 — builds every dbt model
 *   6. api_v1                  — applies api_v1_generated.sql (creates
 *                                api_v1.* wrapper views), re-grants SELECT
 *                                on marts.* + raw.* to atlas_web_anon (dbt
 *                                drops grants when it recreates tables in
 *                                phase 5), and notifies PostgREST to reload
 *                                its schema cache.
 *   7. dbt test                — runs every dbt test (relationship,
 *                                not_null, accepted_values, etc.)
 *   8. dbt docs generate       — refreshes target/catalog.json so the
 *                                dbt-docs UI introspects the post-Phase-6
 *                                schema (api_v1.* views included). Without
 *                                this phase, the catalog drifts every
 *                                time models change. The companion
 *                                `npm run dbt:rebuild` alias re-runs the
 *                                cheap end of this pipeline (run + api +
 *                                test + docs) for the "I edited a model"
 *                                / "I added one new ingest source" cases.
 *
 * Why this exists:
 *   After a cluster reset, the contributor needs to repopulate raw.*,
 *   load seeds, build marts, and verify — five+ separate commands. Easy
 *   to skip one (the symptom that prompted this script: a contributor ran
 *   ingest:all but skipped refresh:brreg-enheter, which left dim_chapter
 *   empty, which left every chapter-touching mart empty, including the
 *   visible /data/api_v1/distrikt_summary). One command is the answer.
 *
 * Usage:
 *   npm run bootstrap                # full bootstrap, all phases
 *   npm run bootstrap -- --dry-run   # list what would run, no execution
 *   npm run bootstrap -- --skip ingest,test   # skip listed phases
 *   npm run bootstrap -- --only migrate,refresh   # run only listed phases
 *
 * Phase IDs for --skip / --only:
 *   migrate, refresh, ingest, seed, run, api, test, docs
 *
 * Exit codes:
 *   0  every phase succeeded
 *   1  one or more phases failed (specific failures listed in summary)
 *   2  startup check failed (Postgres unreachable, no DATABASE_URL, etc.)
 *
 * On any failure, the summary names the specific retry command — so
 * fixing the underlying issue and re-running just that piece is fast.
 */

import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { closeSql, getSql } from "../src/lib/postgres.js";
import { logger } from "../src/lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INGEST_DIR = resolve(__dirname, "..");
const PACKAGE_JSON = resolve(INGEST_DIR, "package.json");
const SEED_SOURCES_DIR = resolve(INGEST_DIR, "src/seed-sources");
const DBT_DIR = resolve(INGEST_DIR, "..", "dbt");

/** Sources excluded from `--all` ingest by default. Override via --include. */
const DEFAULT_EXCLUDED_INGESTS = new Set(["frr"]);

type PhaseId =
  | "migrate"
  | "refresh"
  | "ingest"
  | "seed"
  | "run"
  | "api"
  | "test"
  | "docs";

const ALL_PHASES: PhaseId[] = [
  "migrate",
  "refresh",
  "ingest",
  "seed",
  "run",
  "api",
  "test",
  "docs",
];

type Args = {
  dryRun: boolean;
  skip: Set<PhaseId>;
  only: Set<PhaseId> | null;
  includeIngests: Set<string>;
};

type StepResult = {
  phase: PhaseId;
  step: string;
  status: "ok" | "failed" | "skipped";
  durationMs: number;
  notes?: string;
  retryCommand?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    skip: new Set(),
    only: null,
    includeIngests: new Set(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--skip" && argv[i + 1]) {
      argv[i + 1]!
        .split(",")
        .map((s) => s.trim() as PhaseId)
        .forEach((s) => args.skip.add(s));
      i++;
    } else if (a === "--only" && argv[i + 1]) {
      args.only = new Set(
        argv[i + 1]!.split(",").map((s) => s.trim() as PhaseId),
      );
      i++;
    } else if (a === "--include" && argv[i + 1]) {
      argv[i + 1]!.split(",").forEach((s) => args.includeIngests.add(s.trim()));
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npm run bootstrap -- [--dry-run] [--skip phase,...] [--only phase,...] [--include source,...]\n" +
          "  Phases: migrate, refresh, ingest, seed, run, test\n" +
          "  --include adds otherwise-excluded ingests (e.g. 'frr' for the private-data path)",
      );
      process.exit(0);
    }
  }
  return args;
}

function shouldRunPhase(phase: PhaseId, args: Args): boolean {
  if (args.only) return args.only.has(phase);
  if (args.skip.has(phase)) return false;
  return true;
}

/** Discover refresh:* seed-source scripts whose index.ts writes to a raw.* table. */
function discoverRawRefreshes(): string[] {
  const refreshes: string[] = [];
  for (const dirent of readdirSync(SEED_SOURCES_DIR)) {
    const indexFile = resolve(SEED_SOURCES_DIR, dirent, "index.ts");
    try {
      if (!statSync(indexFile).isFile()) continue;
    } catch {
      continue;
    }
    const src = readFileSync(indexFile, "utf8");
    if (/\braw\.[A-Za-z_][A-Za-z0-9_]*/.test(src)) {
      refreshes.push(dirent);
    }
  }
  return refreshes.sort();
}

/** Discover every `ingest:<source-id>` script declared in package.json. */
function discoverIngestScripts(): string[] {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};
  return Object.keys(scripts)
    .filter(
      (k) =>
        k.startsWith("ingest:") &&
        k !== "ingest:all" /* legacy alias if it survives */,
    )
    .map((k) => k.slice("ingest:".length))
    .sort();
}

/** Run a child process; return exit code + duration. stderr inherits so failures surface. */
function runCommand(
  cmd: string,
  cmdArgs: string[],
  cwd: string,
): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((resolveOuter) => {
    const started = Date.now();
    const child = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ["ignore", "ignore", "inherit"],
      env: process.env,
    });
    child.on("exit", (code) => {
      resolveOuter({
        exitCode: code ?? -1,
        durationMs: Date.now() - started,
      });
    });
    child.on("error", () => {
      resolveOuter({ exitCode: -1, durationMs: Date.now() - started });
    });
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

function header(label: string): void {
  const bar = "─".repeat(72);
  console.log(`\n${bar}\n${label}\n${bar}`);
}

function step(label: string): void {
  process.stdout.write(`  ${label.padEnd(50)} `);
}

function ok(detail: string): void {
  console.log(`OK    ${detail}`);
}

function fail(detail: string): void {
  console.log(`FAIL  ${detail}`);
}

function skip(detail: string = ""): void {
  console.log(`SKIP  ${detail}`);
}

// ── Phase implementations ───────────────────────────────────────────────

async function phaseMigrate(): Promise<StepResult> {
  header("Phase 1: migrate");
  step("npm run migrate");
  const { exitCode, durationMs } = await runCommand(
    "npm",
    ["run", "migrate"],
    INGEST_DIR,
  );
  if (exitCode !== 0) {
    fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
    return {
      phase: "migrate",
      step: "migrate",
      status: "failed",
      durationMs,
      notes: `npm run migrate exited ${exitCode}`,
      retryCommand: "npm run migrate",
    };
  }
  ok(formatDuration(durationMs));
  return { phase: "migrate", step: "migrate", status: "ok", durationMs };
}

async function phaseRefresh(): Promise<StepResult[]> {
  header("Phase 2: refresh seed-sources that write to raw.*");
  const sources = discoverRawRefreshes();
  if (sources.length === 0) {
    console.log("  (no raw-writing refresh sources found — phase no-op)");
    return [];
  }
  console.log(`  ${sources.length} source(s) to refresh: ${sources.join(", ")}`);
  const results: StepResult[] = [];
  for (const source of sources) {
    step(`refresh:${source}`);
    const { exitCode, durationMs } = await runCommand(
      "npm",
      ["run", `refresh:${source}`],
      INGEST_DIR,
    );
    if (exitCode !== 0) {
      fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
      results.push({
        phase: "refresh",
        step: `refresh:${source}`,
        status: "failed",
        durationMs,
        notes: `exit ${exitCode}`,
        retryCommand: `npm run refresh:${source}`,
      });
    } else {
      ok(formatDuration(durationMs));
      results.push({
        phase: "refresh",
        step: `refresh:${source}`,
        status: "ok",
        durationMs,
      });
    }
  }
  return results;
}

async function phaseIngest(args: Args): Promise<StepResult[]> {
  header("Phase 3: ingest:* (raw.* per-source data)");
  const allSources = discoverIngestScripts();
  const sources = allSources.filter((s) => {
    if (DEFAULT_EXCLUDED_INGESTS.has(s) && !args.includeIngests.has(s)) {
      return false;
    }
    return true;
  });
  console.log(`  ${sources.length} source(s) to ingest`);

  const sql = getSql();
  const results: StepResult[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    const label = `[${(i + 1).toString().padStart(2)}/${sources.length}] ingest:${source}`;
    step(label);
    const startedAt = new Date();
    const { exitCode, durationMs } = await runCommand(
      "npm",
      ["run", `ingest:${source}`],
      INGEST_DIR,
    );

    if (exitCode !== 0) {
      fail(`spawn exit ${exitCode}, ${formatDuration(durationMs)}`);
      results.push({
        phase: "ingest",
        step: `ingest:${source}`,
        status: "failed",
        durationMs,
        notes: `spawn exit ${exitCode}`,
        retryCommand: `npm run ingest:${source}`,
      });
      continue;
    }

    // Validate via raw.ingest_runs (lifecycle wrapper writes to it).
    const rows = await sql<
      Array<{
        finished_at: Date | null;
        exit_code: number | null;
        rows_parsed: number | null;
        notes: string | null;
      }>
    >`
      select finished_at, exit_code, rows_parsed, notes
      from raw.ingest_runs
      where source_slug = ${source}
        and started_at >= ${startedAt}
      order by run_id desc
      limit 1
    `;
    const latest = rows[0];
    if (!latest || latest.finished_at === null || latest.exit_code !== 0) {
      const note =
        latest?.notes?.slice(0, 120) ??
        "no successful ingest_runs row created";
      fail(`validation: ${note} (${formatDuration(durationMs)})`);
      results.push({
        phase: "ingest",
        step: `ingest:${source}`,
        status: "failed",
        durationMs,
        notes: note,
        retryCommand: `npm run ingest:${source}`,
      });
      continue;
    }
    ok(
      `${(latest.rows_parsed ?? 0).toLocaleString().padStart(9)} rows (${formatDuration(durationMs)})`,
    );
    results.push({
      phase: "ingest",
      step: `ingest:${source}`,
      status: "ok",
      durationMs,
    });
  }

  return results;
}

async function phaseDbtSeed(): Promise<StepResult> {
  header("Phase 4: dbt seed (load committed CSVs into marts.*)");
  step("dbt seed");
  const { exitCode, durationMs } = await runCommand(
    "uv",
    ["run", "--env-file", "../ingest/.env", "dbt", "seed"],
    DBT_DIR,
  );
  if (exitCode !== 0) {
    fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
    return {
      phase: "seed",
      step: "dbt seed",
      status: "failed",
      durationMs,
      notes: `exit ${exitCode}`,
      retryCommand:
        "(cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt seed)",
    };
  }
  ok(formatDuration(durationMs));
  return { phase: "seed", step: "dbt seed", status: "ok", durationMs };
}

async function phaseDbtRun(): Promise<StepResult> {
  header("Phase 5: dbt run (build every mart)");
  step("dbt run");
  const { exitCode, durationMs } = await runCommand(
    "uv",
    ["run", "--env-file", "../ingest/.env", "dbt", "run"],
    DBT_DIR,
  );
  if (exitCode !== 0) {
    fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
    return {
      phase: "run",
      step: "dbt run",
      status: "failed",
      durationMs,
      notes: `exit ${exitCode}`,
      retryCommand:
        "(cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt run)",
    };
  }
  ok(formatDuration(durationMs));
  return { phase: "run", step: "dbt run", status: "ok", durationMs };
}

async function phaseApiV1(): Promise<StepResult[]> {
  header("Phase 6: api_v1 (apply wrapper SQL + regrant marts/raw + reload)");
  const results: StepResult[] = [];

  // 6a. Run apply-api-v1.sh to create/refresh api_v1.* wrapper views.
  // The generated SQL also re-grants SELECT on api_v1.* to atlas_web_anon.
  step("apply-api-v1.sh");
  const apply = await runCommand("./apply-api-v1.sh", [], DBT_DIR);
  if (apply.exitCode !== 0) {
    fail(`exit ${apply.exitCode}, ${formatDuration(apply.durationMs)}`);
    results.push({
      phase: "api",
      step: "apply-api-v1.sh",
      status: "failed",
      durationMs: apply.durationMs,
      notes: `exit ${apply.exitCode}`,
      retryCommand: "(cd atlas-data/dbt && ./apply-api-v1.sh)",
    });
    return results;
  }
  ok(formatDuration(apply.durationMs));
  results.push({
    phase: "api",
    step: "apply-api-v1.sh",
    status: "ok",
    durationMs: apply.durationMs,
  });

  // 6b. Re-grant SELECT on marts.* + raw.* to atlas_web_anon. dbt's CREATE
  // TABLE during phase 5 doesn't inherit the grants UIS configured on the
  // schema (ALTER DEFAULT PRIVILEGES would normally do this, but the
  // role-ownership chain doesn't pick it up reliably across cluster resets).
  // Idempotent. Guarded so it's a no-op when atlas_web_anon doesn't exist
  // (early dev, no PostgREST yet).
  step("regrant marts/raw + notify pgrst");
  const regrantStart = Date.now();
  try {
    const sql = getSql();
    await sql`
      do $$
      begin
        if exists (select from pg_roles where rolname = 'atlas_web_anon') then
          grant usage on schema marts to atlas_web_anon;
          grant usage on schema raw to atlas_web_anon;
          grant select on all tables in schema marts to atlas_web_anon;
          grant select on all tables in schema raw to atlas_web_anon;
        end if;
      end $$;
    `;
    await sql`notify pgrst, 'reload schema'`;
    const durationMs = Date.now() - regrantStart;
    ok(formatDuration(durationMs));
    results.push({
      phase: "api",
      step: "regrant + notify",
      status: "ok",
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - regrantStart;
    const msg = err instanceof Error ? err.message : String(err);
    fail(`${msg} (${formatDuration(durationMs)})`);
    results.push({
      phase: "api",
      step: "regrant + notify",
      status: "failed",
      durationMs,
      notes: msg.slice(0, 200),
      retryCommand:
        "rerun: npm run bootstrap -- --only api  (or psql with the GRANT block above)",
    });
  }

  return results;
}

async function phaseDbtTest(): Promise<StepResult> {
  header("Phase 7: dbt test (verify)");
  step("dbt test");
  const { exitCode, durationMs } = await runCommand(
    "uv",
    ["run", "--env-file", "../ingest/.env", "dbt", "test"],
    DBT_DIR,
  );
  if (exitCode !== 0) {
    fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
    return {
      phase: "test",
      step: "dbt test",
      status: "failed",
      durationMs,
      notes: `exit ${exitCode}`,
      retryCommand:
        "(cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt test)",
    };
  }
  ok(formatDuration(durationMs));
  return { phase: "test", step: "dbt test", status: "ok", durationMs };
}

async function phaseDbtDocs(): Promise<StepResult> {
  header("Phase 8: dbt docs generate (refresh catalog.json)");
  step("dbt docs generate");
  // Runs after Phase 6 (api) so the catalog introspection picks up the
  // api_v1.* wrapper views as well as marts.* + raw.*. Without this phase,
  // target/catalog.json drifts every time models change but no one runs
  // `dbt docs generate` manually — the dbt docs UI then shows stale column
  // metadata and tooltips reference dropped tables. Should run on every
  // bootstrap and on every "I added/edited a dbt model" cycle (see the
  // `npm run dbt:rebuild` alias for the latter).
  const { exitCode, durationMs } = await runCommand(
    "uv",
    ["run", "--env-file", "../ingest/.env", "dbt", "docs", "generate"],
    DBT_DIR,
  );
  if (exitCode !== 0) {
    fail(`exit ${exitCode}, ${formatDuration(durationMs)}`);
    return {
      phase: "docs",
      step: "dbt docs generate",
      status: "failed",
      durationMs,
      notes: `exit ${exitCode}`,
      retryCommand:
        "(cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt docs generate)",
    };
  }
  ok(formatDuration(durationMs));
  return { phase: "docs", step: "dbt docs generate", status: "ok", durationMs };
}

// ── Orchestrator ────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env["DATABASE_URL"]) {
    console.error(
      "ERROR: DATABASE_URL is not set. bootstrap needs a Postgres connection.",
    );
    return 2;
  }

  const phases = ALL_PHASES.filter((p) => shouldRunPhase(p, args));
  console.log(
    `\n=== bootstrap: ${phases.length}/${ALL_PHASES.length} phases (${phases.join(" → ")}) ===`,
  );
  if (args.dryRun) {
    console.log("\n--dry-run — printing phase order, not executing.\n");
    return 0;
  }

  // Sanity probe — fail fast if Postgres is unreachable.
  const sql = getSql();
  try {
    await sql`select 1`;
  } catch (err) {
    console.error(
      `ERROR: Postgres unreachable: ${err instanceof Error ? err.message : err}`,
    );
    await closeSql();
    return 2;
  }

  const allResults: StepResult[] = [];
  const overallStart = Date.now();
  let stopOnFailure = false;

  for (const phase of phases) {
    if (stopOnFailure) {
      allResults.push({
        phase,
        step: phase,
        status: "skipped",
        durationMs: 0,
        notes: "earlier phase failed",
      });
      continue;
    }
    let stepResults: StepResult[];
    switch (phase) {
      case "migrate":
        stepResults = [await phaseMigrate()];
        break;
      case "refresh":
        stepResults = await phaseRefresh();
        break;
      case "ingest":
        stepResults = await phaseIngest(args);
        break;
      case "seed":
        stepResults = [await phaseDbtSeed()];
        break;
      case "run":
        stepResults = [await phaseDbtRun()];
        break;
      case "api":
        stepResults = await phaseApiV1();
        break;
      case "test":
        stepResults = [await phaseDbtTest()];
        break;
      case "docs":
        stepResults = [await phaseDbtDocs()];
        break;
    }
    allResults.push(...stepResults);
    const phaseFailed = stepResults.some((r) => r.status === "failed");
    if (phaseFailed) {
      stopOnFailure = true;
    }
  }

  await closeSql();

  // ── Summary ─────────────────────────────────────────────────────────
  const totalDuration = Date.now() - overallStart;
  const ok = allResults.filter((r) => r.status === "ok");
  const failed = allResults.filter((r) => r.status === "failed");
  const skipped = allResults.filter((r) => r.status === "skipped");

  header("Summary");
  console.log(
    `  Succeeded: ${ok.length}/${allResults.length} steps · Failed: ${failed.length} · Skipped: ${skipped.length}`,
  );
  console.log(`  Duration:  ${formatDuration(totalDuration)}\n`);

  if (failed.length > 0) {
    console.log("  Failed steps + retry commands:");
    for (const r of failed) {
      console.log(`    [${r.phase}] ${r.step}`);
      if (r.notes) console.log(`        ${r.notes}`);
      if (r.retryCommand) console.log(`        retry: ${r.retryCommand}`);
    }
    console.log("");
  }

  if (failed.length === 0) {
    logger.info("bootstrap.done", {
      steps: ok.length,
      duration_ms: totalDuration,
    });
  }

  return failed.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `bootstrap crashed: ${err instanceof Error ? err.stack : err}`,
    );
    process.exit(1);
  });
