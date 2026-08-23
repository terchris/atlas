import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverNgoFolders } from "../discover.js";

async function tmpRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "atlas-frr-"));
}

describe("discoverNgoFolders", () => {
  // The regression this file exists for: atlas-private-data-repo/ is not in
  // the polyglot Dagster image, so a cluster run pod hits a missing root. It
  // must materialise zero rows, not die on ENOENT.
  it("returns [] when the private-data root does not exist", async () => {
    const missing = join(await tmpRoot(), "definitely-not-here");
    await expect(discoverNgoFolders(missing)).resolves.toEqual([]);
  });

  it("calls onMissingRoot exactly once when the root is absent", async () => {
    const missing = join(await tmpRoot(), "definitely-not-here");
    let calls = 0;
    await discoverNgoFolders(missing, () => {
      calls += 1;
    });
    expect(calls).toBe(1);
  });

  it("does not call onMissingRoot when the root exists", async () => {
    const root = await tmpRoot();
    let calls = 0;
    await discoverNgoFolders(root, () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it("returns only NGO dirs that have an frr/ subdirectory, sorted", async () => {
    const root = await tmpRoot();
    await mkdir(join(root, "sample-ngo", "frr"), { recursive: true });
    await mkdir(join(root, "another-ngo", "frr"), { recursive: true });
    await mkdir(join(root, "no-frr-ngo"), { recursive: true });
    await writeFile(join(root, "README.md"), "not a directory");

    await expect(discoverNgoFolders(root)).resolves.toEqual([
      "another-ngo",
      "sample-ngo",
    ]);
  });

  it("skips dot-directories", async () => {
    const root = await tmpRoot();
    await mkdir(join(root, ".git", "frr"), { recursive: true });
    await mkdir(join(root, "real-ngo", "frr"), { recursive: true });

    await expect(discoverNgoFolders(root)).resolves.toEqual(["real-ngo"]);
  });

  // A permissions failure on a root that DOES exist is a real error. Reading
  // it as "no NGO data" would silently empty private_raw.frr_resources.
  it("rethrows non-ENOENT errors", async () => {
    const root = await tmpRoot();
    const locked = join(root, "locked");
    await mkdir(locked);
    await chmod(locked, 0o000);
    try {
      await expect(discoverNgoFolders(locked)).rejects.toThrow();
    } finally {
      await chmod(locked, 0o700);
    }
  });
});
