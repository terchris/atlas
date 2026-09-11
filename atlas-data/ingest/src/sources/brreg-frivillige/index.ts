/**
 * brreg-frivillige — Frivillighetsregisteret, walked in full.
 *
 * PLAN-003 phase 3. Pure decisions live in `./parse.ts`, including the table
 * comparing this API's pagination with the change feed's — they are opposites,
 * and the opposite mistake is available in each.
 *
 * 🔴 This is NOT where Atlas learns which organisations are voluntary. That flag
 * is on 100% of Enhetsregisteret's bulk records and true for ~72,798, so
 * `marts.dim_brreg_enhet` has membership from the snapshot alone. This module
 * exists only for the attributes Enhetsregisteret does not carry — above all
 * `icnpoKategorier`, the registrant's own classification of itself.
 *
 * There is no change feed and no bulk download for this register (verified
 * 2026-09-12: `/oppdateringer`, `/oppdateringer/frivillige-organisasjoner` and
 * `/frivillige-organisasjoner/lastned` all 404), so a full re-walk is the only
 * option. ~727 requests at the `size` cap of 100. The load upserts, so a walk
 * that finds nothing new is a no-op.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { parseFrivilligPage, primaryIcnpo } from "./parse.js";

export const SOURCE_ID = "brreg-frivillige";

const START_URL =
  "https://data.brreg.no/frivillighetsregisteret/api/frivillige-organisasjoner?size=100";

const TARGET_TABLE = "raw.brreg_frivillige";

const WRITE_COLUMNS = [
  "organisasjonsnummer",
  "icnpo_nummer",
  "icnpo_kategori",
  "doc",
  "loaded_at",
] as const;

/**
 * 🔴 `size=100` is the maximum, not a choice. Verified 2026-09-12: `size=101`
 * returns HTTP 400. Raising it does not make the walk faster, it stops the walk.
 */
const PAGE_SIZE = 100;

/**
 * A walk of ~72,800 records at 100 a page is ~728 requests. This bounds a runaway
 * — a `next` link that never terminates would otherwise loop forever against a
 * public-sector API. 2,000 is ~2.7× the expected walk: generous for growth,
 * nowhere near unbounded.
 */
const MAX_REQUESTS = 2_000;

const BATCH_ROWS = 1_000;

export interface BrregFrivilligeSummary {
  recordsRead: number;
  rowsUpserted: number;
  withIcnpo: number;
  requests: number;
  stoppedAtCap: boolean;
}

async function walk(): Promise<BrregFrivilligeSummary> {
  const sql = process.env["DATABASE_URL"] ? getSql() : null;

  let url: string | null = START_URL;
  let recordsRead = 0;
  let rowsUpserted = 0;
  let withIcnpo = 0;
  let requests = 0;
  let stoppedAtCap = false;
  let batch: Array<Record<string, unknown>> = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0 || !sql) {
      batch = [];
      return;
    }
    rowsUpserted += await upsert(sql, {
      table: TARGET_TABLE,
      rows: batch,
      columns: WRITE_COLUMNS as unknown as string[],
      conflictKeys: ["organisasjonsnummer"],
      chunkSize: 500,
    });
    batch = [];
  };

  while (url) {
    if (requests >= MAX_REQUESTS) {
      stoppedAtCap = true;
      logger.warn("brreg_frivillige.stopped_at_cap", {
        requests,
        records_read: recordsRead,
        note: "the walk did not terminate — upstream paging may have changed shape",
      });
      break;
    }

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    requests += 1;
    if (!response.ok) {
      throw new Error(
        `frivillighetsregisteret: HTTP ${response.status} ${response.statusText} for ${url}`,
      );
    }
    const { items, nextHref } = parseFrivilligPage(await response.json());

    for (const item of items) {
      recordsRead += 1;
      const icnpo = primaryIcnpo(item.icnpoKategorier);
      if (icnpo) withIcnpo += 1;
      batch.push({
        organisasjonsnummer: item.organisasjonsnummer,
        icnpo_nummer: icnpo?.nummer ?? null,
        icnpo_kategori: icnpo?.kategori ?? null,
        doc: item.doc,
        loaded_at: new Date(),
      });
    }
    if (batch.length >= BATCH_ROWS) await flush();

    if (recordsRead % 10_000 === 0 && items.length > 0) {
      logger.info("brreg_frivillige.progress", { records_read: recordsRead, requests });
    }

    // Following `next` is correct HERE and wrong for the change feed — see
    // parse.ts. This link carries `searchAfter=`, which is keyset pagination with
    // no cap; `page=` is rejected outright by this endpoint.
    url = nextHref;
  }
  await flush();

  return { recordsRead, rowsUpserted, withIcnpo, requests, stoppedAtCap };
}

export async function run(): Promise<BrregFrivilligeSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    const output = await walk();
    logger.info("brreg_frivillige.finished", {
      records_read: output.recordsRead,
      rows_upserted: output.rowsUpserted,
      with_icnpo: output.withIcnpo,
      requests: output.requests,
      stopped_at_cap: output.stoppedAtCap,
    });
    return {
      output,
      record: {
        rowsScraped: output.recordsRead,
        rowsParsed: output.recordsRead,
        warningsCount: output.stoppedAtCap ? 1 : 0,
        notes:
          `${output.withIcnpo} of ${output.recordsRead} carry an ICNPO category; ` +
          `${output.requests} requests` +
          (output.stoppedAtCap ? "; STOPPED AT REQUEST CAP — paging may have changed" : ""),
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: unknown) => {
    logger.error("brreg_frivillige.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
