/**
 * Generic table viewer for any endpoint across api_v1 / marts / raw schemas.
 *
 * URL: /data/<schema>/<table>
 *   - schema: "api_v1" | "marts" | "raw" — passed to PostgREST as
 *     `Accept-Profile: <schema>`. The api_v1 case omits the header (default).
 *   - table:  the unqualified table or view name within that schema.
 *
 * URL-driven query state (all server-rendered, no client JS):
 *   - ?page=N&pageSize=M             pagination
 *   - ?sort=col.asc | ?sort=col.desc click column header to cycle
 *   - ?q=text                        global search across string columns
 *                                    (PostgREST `or=` ilike across the
 *                                    string-typed columns from the spec)
 *
 * Adding a new model under `models/marts/api/` + regenerating api_v1 makes
 * a new browseable table appear at `/data/api_v1/<endpoint>` automatically.
 * Adding any new model anywhere in `models/` makes one appear at
 * `/data/marts/<endpoint>` (or `/data/raw/<endpoint>` for ingest tables).
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchSpec, fetchCount, fetchRows, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Always-fresh: rows + counts come from no-store fetches; the page has
// dynamic params + query string so caching at the route level would be
// pointless. See src/lib/api.ts fetchRows comment for the rationale.
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;

const VALID_SCHEMAS = new Set(["api_v1", "marts", "raw"]);

type Spec = {
  paths: Record<string, unknown>;
  definitions?: Record<
    string,
    {
      type?: string;
      properties?: Record<
        string,
        { type?: string; format?: string; description?: string }
      >;
    }
  >;
};

type Column = {
  name: string;
  type: string;
  format: string;
  description: string;
};

function loadColumns(spec: Spec, table: string): Column[] {
  const def = spec.definitions?.[table];
  if (!def?.properties) return [];
  return Object.entries(def.properties).map(([name, meta]) => ({
    name,
    type: meta.type ?? "unknown",
    format: meta.format ?? "",
    description: meta.description ?? "",
  }));
}

function tableExists(spec: Spec, table: string): boolean {
  return Object.prototype.hasOwnProperty.call(spec.paths, `/${table}`);
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return (
      <code className="font-mono text-xs">{JSON.stringify(value)}</code>
    );
  }
  return String(value);
}

/** Strip characters that have meaning in PostgREST `or=()` filter syntax. */
function escapeForIlike(input: string): string {
  return input.replace(/[*(),]/g, "");
}

/** Build a `&`-joined PostgREST query string (no leading `?`). */
function buildFilterQueryParts(
  q: string,
  sort: string,
  columns: Column[],
): string[] {
  const parts: string[] = [];
  if (q) {
    const stringCols = columns
      .filter((c) => c.type === "string")
      .map((c) => c.name);
    if (stringCols.length > 0) {
      const safe = escapeForIlike(q);
      const orClause = stringCols.map((c) => `${c}.ilike.*${safe}*`).join(",");
      parts.push(`or=(${orClause})`);
    }
  }
  if (sort) parts.push(`order=${sort}`);
  return parts;
}

function basePath(schema: string, table: string): string {
  return `/data/${schema}/${table}`;
}

/**
 * Build the URL for a sort-toggle link on a column header. Cycles
 * unsorted → asc → desc → unsorted. Always resets page=1.
 */
function buildSortHref(
  schema: string,
  table: string,
  colName: string,
  currentSort: string,
  q: string,
  pageSize: number,
): string {
  const [currentCol, currentDir] = currentSort
    ? currentSort.split(".")
    : ["", ""];
  let nextSort = "";
  if (currentCol !== colName) {
    nextSort = `${colName}.asc`;
  } else if (currentDir === "asc") {
    nextSort = `${colName}.desc`;
  } else {
    nextSort = "";
  }
  const params = new URLSearchParams();
  if (nextSort) params.set("sort", nextSort);
  if (q) params.set("q", q);
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return `${basePath(schema, table)}${qs ? `?${qs}` : ""}`;
}

function buildPageHref(
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort: string,
  q: string,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  if (sort) params.set("sort", sort);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `${basePath(schema, table)}${qs ? `?${qs}` : ""}`;
}

function sortIndicator(colName: string, sort: string): string {
  if (!sort) return "";
  const [col, dir] = sort.split(".");
  if (col !== colName) return "";
  return dir === "asc" ? "▲" : "▼";
}

export default async function EndpointTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ schema: string; table: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { schema, table } = await params;
  const sp = await searchParams;

  if (!VALID_SCHEMAS.has(schema)) {
    notFound();
  }

  const page = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const requestedPageSize =
    parseInt(String(sp.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  const sort = String(sp.sort ?? "");
  const q = String(sp.q ?? "").trim();

  const spec = (await fetchSpec({ acceptProfile: schema })) as Spec;
  if (!tableExists(spec, table)) {
    notFound();
  }

  const columns = loadColumns(spec, table);
  const filterParts = buildFilterQueryParts(q, sort, columns);
  const filterQuery = filterParts.length ? `?${filterParts.join("&")}` : "";
  const offset = (page - 1) * pageSize;
  const sep = filterQuery ? "&" : "?";
  const pagedQuery = `${filterQuery}${sep}limit=${pageSize}&offset=${offset}`;

  const [rowsRaw, totalRaw] = await Promise.all([
    fetchRows(table, pagedQuery, { acceptProfile: schema }).catch((err) => {
      if (err instanceof ApiError) return [];
      throw err;
    }),
    fetchCount(table, filterQuery, { acceptProfile: schema }).catch(() => null),
  ]);
  const rows = rowsRaw;
  const total = totalRaw;

  const totalPages =
    total !== null ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const hasFilter = q.length > 0;
  const hasSort = sort.length > 0;
  const stringColumnCount = columns.filter((c) => c.type === "string").length;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/data"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Back to catalog
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <Link
            href={`${basePath(schema, table)}/spec`}
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            View spec
          </Link>
        </nav>

        <header className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {schema}
            </span>
            <h1 className="font-mono text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {table}
            </h1>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {total !== null ? (
              <>
                {hasFilter ? "Matched" : "Total"}:{" "}
                <strong>{total.toLocaleString()}</strong> rows
                {hasFilter && (
                  <>
                    {" "}filtered by{" "}
                    <code className="font-mono text-xs">{q}</code>
                  </>
                )}
                . Showing {Math.min(rows.length, total).toLocaleString()} on
                this page ({columns.length} columns).
              </>
            ) : (
              <>Showing {rows.length.toLocaleString()} rows.</>
            )}
          </p>
        </header>

        <form
          method="GET"
          action={basePath(schema, table)}
          className="flex gap-2"
        >
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={
              stringColumnCount > 0
                ? `Search ${stringColumnCount} string column${stringColumnCount === 1 ? "" : "s"}…`
                : "(no string columns to search)"
            }
            disabled={stringColumnCount === 0}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
          />
          {sort && <input type="hidden" name="sort" value={sort} />}
          {pageSize !== DEFAULT_PAGE_SIZE && (
            <input type="hidden" name="pageSize" value={pageSize} />
          )}
          <button
            type="submit"
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href={buildPageHref(schema, table, 1, pageSize, sort, "")}
              className="flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Clear
            </Link>
          )}
        </form>

        {(hasFilter || hasSort) && (
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {hasSort && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-900">
                sort: <code className="font-mono">{sort}</code>{" "}
                <Link
                  href={buildPageHref(schema, table, 1, pageSize, "", q)}
                  className="text-zinc-700 hover:underline dark:text-zinc-300"
                >
                  ✕
                </Link>
              </span>
            )}
          </div>
        )}

        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {hasFilter
                ? "No rows match the search."
                : "No rows returned."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => {
                    const indicator = sortIndicator(col.name, sort);
                    return (
                      <TableHead key={col.name}>
                        <Link
                          href={buildSortHref(
                            schema,
                            table,
                            col.name,
                            sort,
                            q,
                            pageSize,
                          )}
                          className="group flex flex-col gap-0.5 hover:text-zinc-950 dark:hover:text-zinc-50"
                          title={`Sort by ${col.name}`}
                        >
                          <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                            {col.name}
                            {indicator && (
                              <span className="text-zinc-500 dark:text-zinc-400">
                                {indicator}
                              </span>
                            )}
                          </span>
                          <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                            {col.type}
                            {col.format ? ` (${col.format})` : ""}
                          </span>
                        </Link>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={offset + idx}>
                    {columns.map((col) => (
                      <TableCell
                        key={col.name}
                        className="font-mono text-xs"
                      >
                        {renderCell(
                          (row as Record<string, unknown>)[col.name],
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {total !== null && totalPages > 1 && (
          <nav className="flex items-center justify-between gap-2 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">
              Page <strong>{page}</strong> of{" "}
              <strong>{totalPages.toLocaleString()}</strong> · {pageSize}{" "}
              rows per page
            </div>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={buildPageHref(
                    schema,
                    table,
                    page - 1,
                    pageSize,
                    sort,
                    q,
                  )}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  ← Prev
                </Link>
              ) : (
                <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                  ← Prev
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={buildPageHref(
                    schema,
                    table,
                    page + 1,
                    pageSize,
                    sort,
                    q,
                  )}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Next →
                </Link>
              ) : (
                <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                  Next →
                </span>
              )}
            </div>
          </nav>
        )}

        <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Source:{" "}
          <code className="font-mono">
            curl{schema !== "api_v1" ? ` -H 'Accept-Profile: ${schema}'` : ""}{" "}
            {process.env.NEXT_PUBLIC_API_URL ?? "http://api-atlas.localhost"}
            /{table}
            {pagedQuery}
          </code>
        </footer>
      </main>
    </div>
  );
}
