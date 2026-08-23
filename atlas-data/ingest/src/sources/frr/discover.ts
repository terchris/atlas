/**
 * NGO-folder discovery for the FRR ingest.
 *
 * Extracted from index.ts so it is unit-testable: index.ts invokes run() at
 * module scope, so nothing can be imported from it without triggering an
 * ingest.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * List the NGO slugs under `root` that have an `frr/` subdirectory.
 *
 * A **missing root** returns `[]` rather than throwing. atlas-private-data-repo/
 * is gitignored and deliberately not copied into the polyglot Dagster image, so
 * on a public deployment the directory does not exist. That is the agreed
 * contract, not a failure — see dbt/models/private_marts/sources.yml: "on
 * public deployments the table exists but is empty ... private_marts.frr_*
 * models materialize as empty tables". Without this guard the Dagster asset
 * dies on ENOENT in a cluster run pod.
 *
 * Any other error (EACCES, ENOTDIR, …) still throws — a permissions problem on
 * a root that DOES exist is a real failure and must not be silently read as
 * "no NGO data".
 *
 * @param onMissingRoot called when the root is absent, so the caller can log
 *   it. "No private data mounted" and "mounted but empty" are indistinguishable
 *   from the row count alone.
 */
export async function discoverNgoFolders(
  root: string,
  onMissingRoot?: () => void,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      onMissingRoot?.();
      return [];
    }
    throw err;
  }

  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const frrDir = join(root, entry.name, "frr");
    try {
      const s = await stat(frrDir);
      if (s.isDirectory()) slugs.push(entry.name);
    } catch {
      // No frr/ subdirectory — NGO has no FRR data, skip.
    }
  }
  return slugs.sort();
}
