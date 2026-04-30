import postgres from "postgres";

/**
 * Postgres client for the Atlas frontend. Reads `DATABASE_URL` from the env.
 * Role should be SELECT-only on `marts.*` (see `.env.example`). The module
 * caches a single connection pool per Next.js process.
 *
 * Usage in a server component:
 *
 *   import { sql } from "@/lib/db";
 *   const rows = await sql`select kommune_nr from marts.dim_kommune`;
 */
declare global {
  // eslint-disable-next-line no-var
  var __atlasSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Populate .env.local (see .env.example).",
    );
  }
  return postgres(url, {
    max: 8,
    idle_timeout: 20,
    prepare: true,
    onnotice: () => {},
  });
}

// Reuse the same client across Next.js's dev hot-reloads (which otherwise
// creates a new pool per edit and quickly exhausts Postgres connections).
export const sql: postgres.Sql =
  globalThis.__atlasSql ??
  (globalThis.__atlasSql = create());
