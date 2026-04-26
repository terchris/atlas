/**
 * Norges Røde Kors branches + activities — first NGO-supply ingest.
 *
 * Source for v1: static JSON dump at
 *   atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json
 * (the file lives in atlas-private-data-repo/, gitignored, because it is
 * Red Cross-specific organisational data — not appropriate for public docs.)
 * Live API polling (api.redcross.no/nrx/v1/organizations, requires
 * subscription key) is deferred to a separate workstream — see
 * INVESTIGATE-ngo-supply-data-model Q39.
 *
 * Writes:
 *   raw.redcross_branches             (392 rows in current dump)
 *   raw.redcross_branch_activities    (~2 400 rows)
 *
 * Downstream dbt models (PLAN-002 phases 2-4):
 *   supply__redcross_branches          (reshape → dim_chapter)
 *   supply__redcross_branch_activities (reshape + 50→22 category mapping)
 *   dim_chapter, dim_activity, fact_chapter_activities
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../lib/logger.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";

export const SOURCE_ID = "redcross-branches";
const BRANCHES_TABLE = "raw.redcross_branches";
const ACTIVITIES_TABLE = "raw.redcross_branch_activities";

// The dump lives in atlas-private-data-repo/redcross/organisations/ (gitignored).
// Resolved relative to this file.
const DUMP_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../atlas-private-data-repo/redcross/organisations/api-getOrganizations-output-21apr26.json",
);

const BRANCH_COLUMNS = [
  "branch_id", "branch_number", "organization_number", "branch_type", "branch_name",
  "is_active", "is_terminated", "creation_date",
  "parent_branch_id", "parent_branch_number", "parent_branch_name", "parent_branch_type",
  "municipality", "county", "region",
  "postal_address_line1", "postal_code", "post_office",
  "street_address_line1", "street_postal_code", "street_post_office",
  "phone", "email", "web",
  "loaded_at",
] as const;

const ACTIVITY_COLUMNS = [
  "branch_id", "global_activity_name", "local_activity_name", "loaded_at",
] as const;

type DumpBranch = {
  branchId: string;
  branchNumber?: string;
  organizationNumber?: string;
  branchType: string;
  branchName: string;
  branchStatus: { isActive: boolean; isTerminated: boolean; creationDate?: string | null };
  branchParent?: {
    branchId?: string;
    branchNumber?: string;
    branchName?: string;
    branchType?: string;
  };
  branchLocation?: {
    municipality?: string;
    county?: string;
    region?: string;
    postalAddress?: { addressLine1?: string; postalCode?: string; postOffice?: string };
    streetAddress?: { addressLine1?: string; postalCode?: string; postOffice?: string };
  };
  communicationChannels?: { phone?: string; email?: string; web?: string };
  branchActivities?: Array<{ globalActivityName?: string; localActivityName?: string }>;
};

type Dump = { data: { branches: DumpBranch[] }; metadata: { totalCount: number; timestamp: string } };

type BranchRow = {
  branch_id: string;
  branch_number: string | null;
  organization_number: string | null;
  branch_type: string;
  branch_name: string;
  is_active: boolean;
  is_terminated: boolean;
  creation_date: string | null;
  parent_branch_id: string | null;
  parent_branch_number: string | null;
  parent_branch_name: string | null;
  parent_branch_type: string | null;
  municipality: string | null;
  county: string | null;
  region: string | null;
  postal_address_line1: string | null;
  postal_code: string | null;
  post_office: string | null;
  street_address_line1: string | null;
  street_postal_code: string | null;
  street_post_office: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
};

type ActivityRow = {
  branch_id: string;
  global_activity_name: string;
  local_activity_name: string | null;
};

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function run(): Promise<void> {
  logger.info("source.start", { source_id: SOURCE_ID, dump_path: DUMP_PATH });
  const started = Date.now();

  const text = await readFile(DUMP_PATH, "utf8");
  const dump = JSON.parse(text) as Dump;
  if (!dump.data?.branches?.length) {
    throw new Error(`Dump at ${DUMP_PATH} has no branches`);
  }
  logger.info("dump.parsed", {
    total_count: dump.metadata?.totalCount,
    timestamp: dump.metadata?.timestamp,
    branches: dump.data.branches.length,
  });

  const branchRows: BranchRow[] = [];
  const activityRows: ActivityRow[] = [];
  const seenBranchIds = new Set<string>();
  const seenActivityKeys = new Set<string>();

  for (const b of dump.data.branches) {
    if (!b.branchId || !b.branchType || !b.branchName) {
      throw new Error(`Branch missing required identity fields: ${JSON.stringify(b).slice(0, 200)}`);
    }
    // The dump occasionally contains exact-duplicate branch rows (Red Cross-side
    // data quirk; e.g. L192 Stryn appears twice in the 2026-04-21 dump). The
    // table PK is branch_id, so we take the first occurrence and skip the rest.
    if (seenBranchIds.has(b.branchId)) {
      logger.warn("branch.duplicate_skipped", { branch_id: b.branchId, branch_name: b.branchName });
      continue;
    }
    seenBranchIds.add(b.branchId);
    branchRows.push({
      branch_id: b.branchId,
      branch_number: emptyToNull(b.branchNumber),
      organization_number: emptyToNull(b.organizationNumber),
      branch_type: b.branchType,
      branch_name: b.branchName,
      is_active: Boolean(b.branchStatus?.isActive),
      is_terminated: Boolean(b.branchStatus?.isTerminated),
      creation_date: emptyToNull(b.branchStatus?.creationDate),
      parent_branch_id: emptyToNull(b.branchParent?.branchId),
      parent_branch_number: emptyToNull(b.branchParent?.branchNumber),
      parent_branch_name: emptyToNull(b.branchParent?.branchName),
      parent_branch_type: emptyToNull(b.branchParent?.branchType),
      municipality: emptyToNull(b.branchLocation?.municipality),
      county: emptyToNull(b.branchLocation?.county),
      region: emptyToNull(b.branchLocation?.region),
      postal_address_line1: emptyToNull(b.branchLocation?.postalAddress?.addressLine1),
      postal_code: emptyToNull(b.branchLocation?.postalAddress?.postalCode),
      post_office: emptyToNull(b.branchLocation?.postalAddress?.postOffice),
      street_address_line1: emptyToNull(b.branchLocation?.streetAddress?.addressLine1),
      street_postal_code: emptyToNull(b.branchLocation?.streetAddress?.postalCode),
      street_post_office: emptyToNull(b.branchLocation?.streetAddress?.postOffice),
      phone: emptyToNull(b.communicationChannels?.phone),
      email: emptyToNull(b.communicationChannels?.email),
      web: emptyToNull(b.communicationChannels?.web),
    });

    for (const a of b.branchActivities ?? []) {
      const global = emptyToNull(a.globalActivityName);
      if (!global) continue; // skip rows missing the canonical name
      // Dedup at (branch_id, global_activity_name) — the table's PK.
      const key = `${b.branchId}\u0000${global}`;
      if (seenActivityKeys.has(key)) continue;
      seenActivityKeys.add(key);
      activityRows.push({
        branch_id: b.branchId,
        global_activity_name: global,
        local_activity_name: emptyToNull(a.localActivityName),
      });
    }
  }

  logger.info("rows.shaped", {
    branches: branchRows.length,
    activities: activityRows.length,
  });

  const sql = getSql();
  const now = new Date();
  try {
    const branchUpsertStart = Date.now();
    const branchesWritten = await upsert(sql, {
      table: BRANCHES_TABLE,
      rows: branchRows.map((r) => ({ ...r, loaded_at: now })),
      columns: BRANCH_COLUMNS,
      conflictKeys: ["branch_id"],
    });
    logger.info("postgres.upsert.done", {
      table: BRANCHES_TABLE,
      rows_written: branchesWritten,
      duration_ms: Date.now() - branchUpsertStart,
    });

    const actUpsertStart = Date.now();
    const activitiesWritten = await upsert(sql, {
      table: ACTIVITIES_TABLE,
      rows: activityRows.map((r) => ({ ...r, loaded_at: now })),
      columns: ACTIVITY_COLUMNS,
      conflictKeys: ["branch_id", "global_activity_name"],
    });
    logger.info("postgres.upsert.done", {
      table: ACTIVITIES_TABLE,
      rows_written: activitiesWritten,
      duration_ms: Date.now() - actUpsertStart,
    });

    logger.info("source.done", {
      source_id: SOURCE_ID,
      duration_ms: Date.now() - started,
      branches: branchRows.length,
      activities: activityRows.length,
    });
  } finally {
    await closeSql();
  }
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
