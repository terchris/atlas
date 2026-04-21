import postgres from "postgres";
import { logger } from "./logger.js";

/**
 * Thin Postgres helper. Reads `DATABASE_URL` from the environment; callers
 * don't pass credentials. One lazy singleton connection pool per process.
 */
let cachedSql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (cachedSql) return cachedSql;
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Populate .env (see .env.example) or export it before running.",
    );
  }
  cachedSql = postgres(url, {
    max: 4,
    idle_timeout: 10,
    // Log minimally; the source modules do higher-level logging around writes.
    onnotice: () => {},
  });
  return cachedSql;
}

export async function closeSql(): Promise<void> {
  if (cachedSql) {
    await cachedSql.end({ timeout: 5 });
    cachedSql = null;
  }
}

/**
 * Idempotent bulk upsert.
 *
 * Chunks the rows to avoid very large single statements, then for each chunk
 * issues:
 *
 *   INSERT INTO <table> (<columns>) VALUES (...)
 *   ON CONFLICT (<conflictKeys>) DO UPDATE SET <non-key columns> = EXCLUDED.<col>
 *
 * Values are parameterised via the `postgres` client (safe). Identifiers
 * (table/column names) are interpolated via `sql.unsafe` — acceptable because
 * they come from our own code, not from user input.
 *
 * Deliberately not generic: the caller supplies column names as plain strings
 * rather than inferring from a row type. `postgres.js` has very precise
 * overloads for `sql(items, ...cols)` that don't cooperate well with wrapper
 * generics, so we keep this layer simple and defer compile-time column checking
 * to the caller's own types.
 */
export type UpsertRow = Record<string, unknown>;

export async function upsert(
  sql: postgres.Sql,
  opts: {
    table: string;
    rows: ReadonlyArray<UpsertRow>;
    columns: readonly string[];
    conflictKeys: readonly string[];
    chunkSize?: number;
  },
): Promise<number> {
  const { table, rows, columns, conflictKeys, chunkSize = 500 } = opts;
  if (rows.length === 0) return 0;

  const updateCols = columns.filter((c) => !conflictKeys.includes(c));
  if (updateCols.length === 0) {
    throw new Error(
      `upsert: every column is in conflictKeys; nothing to update on conflict for ${table}`,
    );
  }

  const tableRef = sql.unsafe(table);
  const conflictSql = sql.unsafe(
    conflictKeys.map((c) => `"${c}"`).join(", "),
  );
  const updateSql = sql.unsafe(
    updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", "),
  );

  // postgres.js's sql(items, ...cols) wants a writable array + literal cols.
  // Cast at the call site; values still flow through the library's parameter
  // binding so SQL injection via values is not a concern.
  const cols = [...columns] as string[];

  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize) as UpsertRow[];
    await sql`
      INSERT INTO ${tableRef} ${sql(chunk, ...cols)}
      ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateSql}
    `;
    total += chunk.length;
    logger.debug("postgres.upsert.chunk", {
      table,
      chunk_rows: chunk.length,
      cumulative: total,
    });
  }
  return total;
}
