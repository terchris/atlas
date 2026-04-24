/**
 * Generic upsert into a scraper raw table, with skip-on-hash-match.
 *
 * Implements the §C.3 skip logic: if the new `record_hash` matches the stored
 * one for this URL, skip the DB write entirely. Otherwise insert/update.
 *
 * Callers (per-source `index.ts`) pass the full row object including the
 * mandatory §C.5 columns (`url`, `record_hash`, `html_raw_hash`, `is_active`,
 * `loaded_at`) plus source-specific columns. The helper doesn't compute
 * `record_hash` itself — that's the caller's responsibility, since the caller
 * knows which fields are semantic.
 */

import type postgres from "postgres";

export type UpsertRecordResult = "inserted" | "updated" | "skipped";

export type UpsertRecordOpts = {
  /** Fully-qualified table name, e.g. `"raw.folkehjelp_chapters"`. */
  tableName: string;
  /** Full row data; must include `url` and `record_hash`. */
  row: Record<string, unknown>;
  /** Columns present in `row`, in the order INSERT will use. */
  columns: readonly string[];
};

export async function upsertRecord(
  sql: postgres.Sql,
  opts: UpsertRecordOpts,
): Promise<UpsertRecordResult> {
  const { tableName, row, columns } = opts;
  const url = row["url"];
  const recordHash = row["record_hash"];

  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      `upsertRecord: row.url must be a non-empty string (got ${typeof url})`,
    );
  }
  if (typeof recordHash !== "string" || recordHash.length === 0) {
    throw new Error(
      `upsertRecord: row.record_hash must be a non-empty string (got ${typeof recordHash})`,
    );
  }
  if (!columns.includes("url") || !columns.includes("record_hash")) {
    throw new Error(
      "upsertRecord: columns must include 'url' and 'record_hash'",
    );
  }

  const existing = await sql<{ record_hash: string }[]>`
    select record_hash
    from ${sql.unsafe(tableName)}
    where url = ${url}
    limit 1
  `;
  const existingRow = existing[0];

  if (existingRow && existingRow.record_hash === recordHash) {
    return "skipped";
  }

  // Direct single-row upsert. We don't delegate to the bulk `upsert()` helper
  // from src/lib/postgres.ts because pg-mem's postgres.js adapter hangs on
  // the `sql(items, ...cols)` bulk-value-helper form; inline SQL sidesteps it
  // and is clearer for the single-row case anyway.
  const cols = [...columns] as string[];
  const values = cols.map((c) => row[c]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const updateSet = cols
    .filter((c) => c !== "url")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");

  await sql.unsafe(
    `INSERT INTO ${tableName} (${colList}) VALUES (${placeholders}) ` +
      `ON CONFLICT (url) DO UPDATE SET ${updateSet}`,
    values as postgres.ParameterOrJSON<never>[],
  );

  return existingRow ? "updated" : "inserted";
}
