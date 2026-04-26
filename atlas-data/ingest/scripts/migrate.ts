/**
 * Tiny migration runner. Reads every `*.sql` file from `../migrations/` in
 * lexical order and executes each against `DATABASE_URL`. Files must be
 * individually idempotent — this runner does not track state (no
 * `schema_migrations` table). Re-running applies every file again, which
 * is safe as long as statements use `create … if not exists` etc.
 *
 * Trade this in for a real migrator (sqitch, node-pg-migrate) when we have
 * > ~10 migrations or need cross-environment coordination.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getSql, closeSql } from "../src/lib/postgres.js";
import { logger } from "../src/lib/logger.js";

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

async function main(): Promise<void> {
  const sql = getSql();
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((f) => f.endsWith(".sql")).sort();

  if (files.length === 0) {
    logger.warn("migrate.empty", { dir: MIGRATIONS_DIR });
    await closeSql();
    return;
  }

  logger.info("migrate.start", { dir: MIGRATIONS_DIR, file_count: files.length });

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const content = await readFile(path, "utf8");
    logger.info("migrate.apply", { file });
    const started = Date.now();
    await sql.unsafe(content);
    logger.info("migrate.applied", { file, duration_ms: Date.now() - started });
  }

  await closeSql();
  logger.info("migrate.done", { file_count: files.length });
}

main().catch((err) => {
  logger.error("migrate.failed", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
