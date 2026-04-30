/**
 * Generic table viewer for any api_v1.* endpoint.
 *
 * Reads two things from PostgREST:
 *   - The OpenAPI spec at `/`, for column metadata (names, types, descriptions)
 *   - The endpoint rows themselves
 *
 * No per-endpoint code. Adding a new mart_* view + regenerating api_v1
 * makes a new browseable table appear at /data/<endpoint> automatically.
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
import type { components } from "@/lib/api-types";

export const revalidate = 60;

const PAGE_SIZE = 50;

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

function loadColumns(spec: Spec, endpoint: string): Column[] {
  const def = spec.definitions?.[endpoint];
  if (!def?.properties) return [];
  return Object.entries(def.properties).map(([name, meta]) => ({
    name,
    type: meta.type ?? "unknown",
    format: meta.format ?? "",
    description: meta.description ?? "",
  }));
}

function endpointExists(spec: Spec, endpoint: string): boolean {
  return Object.prototype.hasOwnProperty.call(spec.paths, `/${endpoint}`);
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

export default async function EndpointTablePage({
  params,
}: {
  params: Promise<{ endpoint: string }>;
}) {
  const { endpoint } = await params;
  const spec = (await fetchSpec()) as Spec;

  if (!endpointExists(spec, endpoint)) {
    notFound();
  }

  const columns = loadColumns(spec, endpoint);

  // Fetch first page of rows + total count in parallel.
  const [rows, total] = await Promise.all([
    fetchRows(
      endpoint as keyof components["schemas"],
      `?limit=${PAGE_SIZE}`,
    ).catch((err) => {
      if (err instanceof ApiError) return [];
      throw err;
    }),
    fetchCount(endpoint).catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <nav className="text-sm">
          <Link
            href="/data"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Back to catalog
          </Link>
        </nav>

        <header className="flex flex-col gap-2">
          <h1 className="font-mono text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            /{endpoint}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {total !== null ? (
              <>
                Showing {Math.min(rows.length, total).toLocaleString()} of{" "}
                <strong>{total.toLocaleString()}</strong> rows.
              </>
            ) : (
              <>Showing {rows.length.toLocaleString()} rows.</>
            )}{" "}
            {columns.length > 0 && (
              <>
                {columns.length} columns. Source:{" "}
                <code className="font-mono">
                  {process.env.NEXT_PUBLIC_API_URL ??
                    "http://api-atlas.localhost"}
                  /{endpoint}
                </code>
                .
              </>
            )}
          </p>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No rows returned.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.name}>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                          {col.name}
                        </span>
                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                          {col.type}
                          {col.format ? ` (${col.format})` : ""}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx}>
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

        <footer className="text-xs text-zinc-500 dark:text-zinc-400">
          {total !== null && total > rows.length ? (
            <>
              Showing the first {rows.length} of {total.toLocaleString()}{" "}
              rows. Pagination is not implemented yet — for now, use{" "}
              <code className="font-mono">?limit=N&amp;offset=M</code>{" "}
              query parameters directly against the API.
            </>
          ) : (
            <>All rows displayed.</>
          )}
        </footer>
      </main>
    </div>
  );
}
