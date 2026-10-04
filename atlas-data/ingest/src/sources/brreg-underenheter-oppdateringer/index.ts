/**
 * brreg-underenheter-oppdateringer — the underenheter change feed poller.
 *
 * Reads Atlas's durable watermark, walks `oppdateringer/underenheter` forward by
 * cursor, records every change in `raw.brreg_underenheter_oppdateringer`,
 * fetches each changed sub-unit's current document into
 * `raw.brreg_underenheter_versions`, and advances the watermark only after a
 * batch is committed. Mirrors `../brreg-oppdateringer/index.ts` exactly — see
 * that file for the full reasoning behind every design choice below.
 *
 * 🔴 WHAT THIS MODULE MUST NOT DO, same three traps as the enheter poller:
 *
 * - **No `page` parameter, and no following `_links.next`.** Same cap-at-20,
 *   page-built `next` link, verified live on this feed 2026-10-04 too.
 * - **No `lib/brreg/client.ts` `paginate()`.**
 * - **No writes to `raw.brreg_underenheter_snapshot`.** The bootstrap owns that
 *   table; a bug here cannot damage it.
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

export const SOURCE_ID = "brreg-underenheter-oppdateringer";

const FEED_URL = "https://data.brreg.no/enhetsregisteret/api/oppdateringer/underenheter";

/** Same batch size as the enheter feed, verified to behave the same way live. */
const FEED_BATCH = 10_000;

/**
 * Same safety-bound reasoning as the enheter feed's DEFAULT_MAX_CHANGES — see
 * that file. A real bootstrap run against live data on 2026-10-04 seeded this
 * feed's watermark at 21,390,729 — its own id space, not comparable to
 * enheter's — but the same principle applies regardless of scale: a stale
 * watermark must not turn one run into an unbounded hammering of a
 * public-sector API.
 */
const DEFAULT_MAX_CHANGES = 50_000;

/** Concurrent entity fetches. Deliberately small — see the note on FEED_BATCH. */
const ENTITY_CONCURRENCY = 4;

export interface BrregUnderenheterOppdateringerSummary {
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
    throw new Error(`brreg underenheter feed: HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

/**
 * Read the watermark. Absent means the bootstrap has not seeded one — an
 * error, not a reason to start at 1, which would walk the feed's entire
 * history (its id space runs past 21.3M, seeded live 2026-10-04) through a
 * register Atlas already holds as a snapshot.
 */
async function readWatermark(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ last_oppdateringsid: string }[]>`
    select last_oppdateringsid from raw.brreg_underenheter_feed_watermark where id = 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(
      "raw.brreg_underenheter_feed_watermark has no row. Run the brreg-underenheter bootstrap " +
        "first — it seeds the watermark from the snapshot's own date. Starting the feed from id 1 " +
        "would walk the feed's entire history through a register Atlas already holds.",
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
    update raw.brreg_underenheter_feed_watermark
       set last_oppdateringsid = ${oppdateringsid},
           last_dato           = ${dato},
           updated_at          = now()
     where id = 1
  `;
}

/** Fetch sub-unit documents for a batch, bounded concurrency, failures recorded not thrown. */
async function fetchDocuments(
  changes: readonly FeedChange[],
): Promise<Map<number, Record<string, unknown> | null>> {
  const out = new Map<number, Record<string, unknown> | null>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < changes.length) {
      const change = changes[cursor++]!;
      if (!change.underenhetHref) {
        out.set(change.oppdateringsid, null);
        continue;
      }
      try {
        out.set(change.oppdateringsid, (await fetchJson(change.underenhetHref)) as Record<string, unknown>);
      } catch (err) {
        logger.warn("brreg_underenheter_feed.entity_fetch_failed", {
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

async function poll(maxChanges: number): Promise<BrregUnderenheterOppdateringerSummary> {
  const sql = getSql();
  let cursor = (await readWatermark(sql)) + 1;

  const byEndringstype: Record<string, number> = {};
  let changesProcessed = 0;
  let versionsWritten = 0;
  let tombstones = 0;
  let highest: number | null = null;
  let backlog: number | null = null;
  let stoppedAtCap = false;

  logger.info("brreg_underenheter_feed.start", { from_oppdateringsid: cursor, max_changes: maxChanges });

  for (;;) {
    // 🔴 The only URL this module builds. No page, no _links.next.
    const body = await fetchJson(`${FEED_URL}?oppdateringsid=${cursor}&size=${FEED_BATCH}`);
    const { changes, backlog: remaining } = parseFeedPage(body);
    backlog = remaining;

    if (changes.length === 0) {
      logger.info("brreg_underenheter_feed.caught_up", { at_oppdateringsid: cursor });
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
        doc,
        fetched_at: new Date(),
      };
    });

    // Order matters — versions references oppdateringer. `do nothing` on both,
    // so a re-run of the same batch after an interrupted commit is a no-op.
    await upsert(sql, {
      table: "raw.brreg_underenheter_oppdateringer",
      rows: changeRows,
      columns: ["oppdateringsid", "dato", "organisasjonsnummer", "endringstype", "processed_at", "process_status"],
      conflictKeys: ["oppdateringsid"],
      chunkSize: 500,
    });
    versionsWritten += await upsert(sql, {
      table: "raw.brreg_underenheter_versions",
      rows: versionRows,
      columns: ["oppdateringsid", "organisasjonsnummer", "endringstype", "doc", "fetched_at"],
      conflictKeys: ["oppdateringsid"],
      chunkSize: 500,
    });

    const last = changes[changes.length - 1]!;
    highest = last.oppdateringsid;
    // Only now — an interrupted run leaves the watermark where it was and
    // re-processes this batch, which the `on conflict` above makes harmless.
    await advanceWatermark(sql, last.oppdateringsid, last.dato);

    changesProcessed += changes.length;
    cursor = nextCursor(changes, cursor);

    logger.info("brreg_underenheter_feed.batch", {
      changes: changes.length,
      through_oppdateringsid: last.oppdateringsid,
      through_dato: last.dato,
      backlog_remaining: remaining,
    });

    if (changesProcessed >= maxChanges) {
      stoppedAtCap = true;
      logger.warn("brreg_underenheter_feed.stopped_at_cap", {
        changes_processed: changesProcessed,
        max_changes: maxChanges,
        backlog_remaining: remaining,
        note: "raise BRREG_UNDERENHETER_FEED_MAX_CHANGES deliberately; the next run resumes from the watermark",
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

export async function run(): Promise<BrregUnderenheterOppdateringerSummary> {
  const raw = process.env["BRREG_UNDERENHETER_FEED_MAX_CHANGES"];
  const parsed = raw ? Number(raw) : Number.NaN;
  const maxChanges = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CHANGES;

  return recordIngestRun(SOURCE_ID, async () => {
    const output = await poll(maxChanges);
    logger.info("brreg_underenheter_feed.finished", {
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
    logger.error("brreg_underenheter_feed.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
