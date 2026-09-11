/**
 * brreg-oppdateringer — the Brreg change feed poller.
 *
 * Reads Atlas's durable watermark, walks `oppdateringer/enheter` forward by
 * cursor, records every change in `raw.brreg_oppdateringer`, fetches each
 * changed organisation's current document into `raw.brreg_enheter_versions`, and
 * advances the watermark only after a batch is committed.
 *
 * PLAN-002 phase 2. Pure decisions live in `./parse.ts`.
 *
 * 🔴 WHAT THIS MODULE MUST NOT DO, AND WHY EACH IS TEMPTING
 *
 * - **No `page` parameter, and no following `_links.next`.** Brreg caps `page` at
 *   20 and builds its HAL `next` link with `page=`, so the idiomatic "follow the
 *   next link" walks into HTTP 400 after 20 hops — having seen only the oldest
 *   10,000 changes, all of them `Ukjent`, and not one deletion. A poller built
 *   that way passes every test that checks change-type handling. Guarded by a
 *   source-text assertion in `__tests__`, because what makes this correct is the
 *   absence of a parameter.
 * - **No `lib/brreg/client.ts` `paginate()`.** That helper increments `page`; it
 *   is right for every other Brreg endpoint and wrong for this one.
 * - **No writes to `raw.brreg_enheter_snapshot`.** The bootstrap owns that table.
 *   Keeping the feed off it means a bug here cannot damage the 1.17M rows that
 *   are expensive to rebuild; dbt reconciles the two (PLAN-003).
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { getSql, upsert } from "../../lib/postgres.js";
import type postgres from "postgres";
import {
  classify,
  looksDeleted,
  nextCursor,
  parseFeedPage,
  type ChangeAction,
  type FeedChange,
} from "./parse.js";

export const SOURCE_ID = "brreg-oppdateringer";

const FEED_URL = "https://data.brreg.no/enhetsregisteret/api/oppdateringer/enheter";

/**
 * Verified 2026-09-12: 500, 1000, 5000 and 10000 all return 200 with that many
 * records. The `page` cap has no bearing on `size`. 10,000 makes a full history
 * walk ~1,650 requests instead of ~33,000.
 */
const FEED_BATCH = 10_000;

/**
 * 🔴 A safety bound, not a tuning knob.
 *
 * Each change costs one entity fetch. A daily run sees ~3,300 changes. A run that
 * starts from a watermark of 1 would see 16.4 MILLION, i.e. 16.4M requests
 * against a public-sector API Atlas depends on staying welcome at — and it would
 * start doing so without complaint.
 *
 * So the run stops at this many changes and reports how far it got. Falling
 * behind is visible and recoverable; hammering Brreg for a week is neither.
 * Raise it deliberately with `BRREG_FEED_MAX_CHANGES` when a real catch-up is
 * intended and someone is watching.
 */
const DEFAULT_MAX_CHANGES = 50_000;

/** Concurrent entity fetches. Deliberately small — see the note on FEED_BATCH. */
const ENTITY_CONCURRENCY = 4;

export interface BrregOppdateringerSummary {
  changesProcessed: number;
  highestOppdateringsid: number | null;
  backlogRemaining: number | null;
  byEndringstype: Record<string, number>;
  versionsWritten: number;
  tombstones: number;
  stoppedAtCap: boolean;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`brreg feed: HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

/**
 * Read the watermark. Absent means the bootstrap has not seeded one, and that is
 * an error rather than a reason to start at 1: starting at 1 would silently
 * begin a 16.4M-change walk through history Atlas already holds as a snapshot.
 */
async function readWatermark(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ last_oppdateringsid: string }[]>`
    select last_oppdateringsid from raw.brreg_feed_watermark where id = 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(
      "raw.brreg_feed_watermark has no row. Run the brreg-enheter-alle bootstrap first — " +
        "it seeds the watermark from the snapshot's own date. Starting the feed from id 1 " +
        "would walk 16.4M historical changes Atlas already holds.",
    );
  }
  return Number(row.last_oppdateringsid);
}

async function advanceWatermark(
  sql: postgres.Sql,
  oppdateringsid: number,
  dato: string | null,
): Promise<void> {
  await sql`
    update raw.brreg_feed_watermark
       set last_oppdateringsid = ${oppdateringsid},
           last_dato           = ${dato},
           updated_at          = now()
     where id = 1
  `;
}

/** Fetch entity documents for a batch, bounded concurrency, failures recorded not thrown. */
async function fetchDocuments(
  changes: readonly FeedChange[],
): Promise<Map<number, Record<string, unknown> | null>> {
  const out = new Map<number, Record<string, unknown> | null>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < changes.length) {
      const change = changes[cursor++]!;
      if (!change.enhetHref) {
        out.set(change.oppdateringsid, null);
        continue;
      }
      try {
        out.set(change.oppdateringsid, (await fetchJson(change.enhetHref)) as Record<string, unknown>);
      } catch (err) {
        // One unreachable entity must not abandon the batch — the change is
        // still recorded, with a null doc, and the run reports it. Losing the
        // whole batch would also lose the watermark advance and re-fetch
        // everything next time.
        logger.warn("brreg_feed.entity_fetch_failed", {
          organisasjonsnummer: change.organisasjonsnummer,
          oppdateringsid: change.oppdateringsid,
          error: err instanceof Error ? err.message : String(err),
        });
        out.set(change.oppdateringsid, null);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ENTITY_CONCURRENCY, changes.length) }, worker),
  );
  return out;
}

async function poll(maxChanges: number): Promise<BrregOppdateringerSummary> {
  const sql = getSql();
  let cursor = (await readWatermark(sql)) + 1;

  const byEndringstype: Record<string, number> = {};
  let changesProcessed = 0;
  let versionsWritten = 0;
  let tombstones = 0;
  let highest: number | null = null;
  let backlog: number | null = null;
  let stoppedAtCap = false;

  logger.info("brreg_feed.start", { from_oppdateringsid: cursor, max_changes: maxChanges });

  for (;;) {
    // 🔴 The only URL this module builds. No page, no _links.next.
    const body = await fetchJson(`${FEED_URL}?oppdateringsid=${cursor}&size=${FEED_BATCH}`);
    const { changes, backlog: remaining } = parseFeedPage(body);
    backlog = remaining;

    // Absent `_embedded` (not an empty array) is how "caught up" arrives, and it
    // is the normal end of a healthy run.
    if (changes.length === 0) {
      logger.info("brreg_feed.caught_up", { at_oppdateringsid: cursor });
      break;
    }

    const docs = await fetchDocuments(changes);

    const changeRows = changes.map((c) => {
      const action = classify(c.endringstype);
      byEndringstype[c.endringstype] = (byEndringstype[c.endringstype] ?? 0) + 1;
      return {
        oppdateringsid: c.oppdateringsid,
        dato: c.dato,
        organisasjonsnummer: c.organisasjonsnummer,
        endringstype: c.endringstype,
        processed_at: new Date(),
        process_status: statusFor(action),
      };
    });

    const versionRows = changes.map((c) => {
      const action = classify(c.endringstype);
      const doc = docs.get(c.oppdateringsid) ?? null;
      if (action === "tombstone" || looksDeleted(doc)) tombstones += 1;
      return {
        oppdateringsid: c.oppdateringsid,
        organisasjonsnummer: c.organisasjonsnummer,
        endringstype: c.endringstype,
        // Stored for every action, including a tombstone: Brreg's deletion stub
        // carries `slettedato`, which is the only record of WHEN it went.
        doc,
        fetched_at: new Date(),
      };
    });

    // Order matters — versions references oppdateringer. `do nothing` on both, so
    // a re-run of the same batch after an interrupted commit is a no-op rather
    // than a conflict.
    await upsert(sql, {
      table: "raw.brreg_oppdateringer",
      rows: changeRows,
      columns: ["oppdateringsid", "dato", "organisasjonsnummer", "endringstype", "processed_at", "process_status"],
      conflictKeys: ["oppdateringsid"],
      chunkSize: 500,
    });
    versionsWritten += await upsert(sql, {
      table: "raw.brreg_enheter_versions",
      rows: versionRows,
      columns: ["oppdateringsid", "organisasjonsnummer", "endringstype", "doc", "fetched_at"],
      conflictKeys: ["oppdateringsid"],
      chunkSize: 500,
    });

    const last = changes[changes.length - 1]!;
    highest = last.oppdateringsid;
    // Only now. An interrupted run leaves the watermark where it was and
    // re-processes this batch, which the `on conflict` above makes harmless.
    await advanceWatermark(sql, last.oppdateringsid, last.dato);

    changesProcessed += changes.length;
    cursor = nextCursor(changes, cursor);

    logger.info("brreg_feed.batch", {
      changes: changes.length,
      through_oppdateringsid: last.oppdateringsid,
      through_dato: last.dato,
      backlog_remaining: remaining,
    });

    if (changesProcessed >= maxChanges) {
      stoppedAtCap = true;
      logger.warn("brreg_feed.stopped_at_cap", {
        changes_processed: changesProcessed,
        max_changes: maxChanges,
        backlog_remaining: remaining,
        note: "raise BRREG_FEED_MAX_CHANGES deliberately; the next run resumes from the watermark",
      });
      break;
    }
  }

  return {
    changesProcessed,
    highestOppdateringsid: highest,
    backlogRemaining: backlog,
    byEndringstype,
    versionsWritten,
    tombstones,
    stoppedAtCap,
  };
}

function statusFor(action: ChangeAction): string {
  switch (action) {
    case "apply":
      return "applied";
    case "tombstone":
      return "tombstoned";
    default:
      return "skipped_unknown";
  }
}

export async function run(): Promise<BrregOppdateringerSummary> {
  const raw = process.env["BRREG_FEED_MAX_CHANGES"];
  const parsed = raw ? Number(raw) : Number.NaN;
  const maxChanges = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CHANGES;

  return recordIngestRun(SOURCE_ID, async () => {
    const output = await poll(maxChanges);
    logger.info("brreg_feed.finished", {
      changes_processed: output.changesProcessed,
      highest_oppdateringsid: output.highestOppdateringsid,
      backlog_remaining: output.backlogRemaining,
      by_endringstype: output.byEndringstype,
      tombstones: output.tombstones,
      stopped_at_cap: output.stoppedAtCap,
    });
    return {
      output,
      record: {
        rowsScraped: output.changesProcessed,
        rowsParsed: output.versionsWritten,
        warningsCount: output.stoppedAtCap ? 1 : 0,
        notes:
          `backlog_remaining=${output.backlogRemaining ?? "?"}; ` +
          `types=${JSON.stringify(output.byEndringstype)}; ` +
          `tombstones=${output.tombstones}` +
          (output.stoppedAtCap ? "; STOPPED AT CAP — run again to continue" : ""),
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: unknown) => {
    logger.error("brreg_feed.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
