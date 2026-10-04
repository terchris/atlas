/**
 * brreg-underenheter — the complete underenheter register, streamed into
 * `raw.brreg_underenheter_snapshot`.
 *
 * One request to Brreg's daily bulk endpoint, gunzipped and parsed in flight,
 * upserted in batches on `organisasjonsnummer`. ~867,024 sub-units (live count,
 * 2026-10-04), ~85 MB over the wire gzipped. Mirrors
 * ../brreg-enheter-alle/index.ts exactly — see that file for the full reasoning
 * on streaming, batching and idempotence; this file only states what differs for
 * the underenheter register.
 *
 * This is a *bootstrap* load, not a scheduled one — same reasoning as
 * brreg-enheter-alle: re-running a bulk load against a populated database is the
 * one genuinely destructive-if-wrong operation in this design, so nothing
 * self-triggers it. Keeping it current afterwards is
 * brreg-underenheter-oppdateringer's job, which reads `/oppdateringer/underenheter`
 * and touches only what moved.
 *
 * Parsing lives in `./parse.ts`; this file owns HTTP, decompression, Postgres and
 * the run lifecycle.
 *
 * ⚠️ NO NDJSON OUTPUT FILE, for the same reason as brreg-enheter-alle. `--sample`
 * prints the first few records to stdout instead.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { getSql, upsert } from "../../lib/postgres.js";
import type postgres from "postgres";
import {
  parseUnderenheter,
  snapshotFileDate,
  streamArrayElements,
  type BrregUnderenhetRecord,
} from "./parse.js";

export const SOURCE_ID = "brreg-underenheter";

const DOWNLOAD_URL = "https://data.brreg.no/enhetsregisteret/api/underenheter/lastned";

/**
 * Verified live 2026-10-04: `application/json` is not tried here (the enheter
 * endpoint answers HTTP 400 for it; this vendor type is the contract for the
 * sibling register too, confirmed by a real 200 with this exact Accept).
 */
const ACCEPT = "application/vnd.brreg.enhetsregisteret.underenhet.v2+gzip";

const TARGET_TABLE = "raw.brreg_underenheter_snapshot";

const FEED_URL = "https://data.brreg.no/enhetsregisteret/api/oppdateringer/underenheter";

const WRITE_COLUMNS = [
  "organisasjonsnummer",
  "doc",
  "snapshot_file_date",
  "loaded_at",
] as const;

/** Same batch size as brreg-enheter-alle, for the same reason. */
const BATCH_ROWS = 2_000;

export interface BrregUnderenheterSummary {
  recordsRead: number;
  rowsUpserted: number;
  snapshotFileDate: string | null;
  durationMs: number;
}

/**
 * Decode a byte stream as UTF-8 without splitting multi-byte characters at chunk
 * boundaries. Identical to brreg-enheter-alle's decodeUtf8 — Norwegian names
 * appear here too (a sub-unit's own navn).
 */
async function* decodeUtf8(stream: AsyncIterable<Buffer>): AsyncGenerator<string> {
  const decoder = new StringDecoder("utf8");
  for await (const chunk of stream) {
    const text = decoder.write(chunk);
    if (text) yield text;
  }
  const tail = decoder.end();
  if (tail) yield tail;
}

/** Open the bulk download and return the gunzipped byte stream plus its date. */
async function openSnapshot(): Promise<{
  bytes: AsyncIterable<Buffer>;
  fileDate: string | null;
}> {
  logger.info("brreg_underenheter.download.start", { url: DOWNLOAD_URL, accept: ACCEPT });
  const response = await fetch(DOWNLOAD_URL, { headers: { Accept: ACCEPT } });
  if (!response.ok || !response.body) {
    throw new Error(
      `brreg underenheter bulk download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const fileDate = snapshotFileDate(response.headers.get("last-modified"));
  logger.info("brreg_underenheter.download.open", {
    status: response.status,
    content_length: response.headers.get("content-length"),
    content_type: response.headers.get("content-type"),
    snapshot_file_date: fileDate,
  });

  // Gunzip explicitly — the endpoint serves `Content-Type: ...+gzip` as a
  // payload, not as a transfer encoding, so nothing decompresses it for us.
  const gunzip = createGunzip();
  const source = Readable.fromWeb(response.body as never);
  void pipeline(source, gunzip).catch((err: unknown) => {
    logger.error("brreg_underenheter.download.pipeline_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { bytes: gunzip as AsyncIterable<Buffer>, fileDate };
}

/**
 * Seed the underenheter change feed's watermark from this snapshot, so
 * brreg-underenheter-oppdateringer knows where to start.
 *
 * Same reasoning as brreg-enheter-alle's seedFeedWatermark: anchor to the
 * snapshot file's own date, not the newest id at download time, and only seed
 * when there is no existing watermark. The one structural difference: this
 * feed's embedded key is `oppdaterteUnderenheter`, not `oppdaterteEnheter` —
 * verified live 2026-10-04, see this source's README.
 */
async function seedFeedWatermark(
  sql: postgres.Sql,
  fileDate: string | null,
): Promise<void> {
  if (!fileDate) {
    logger.warn("brreg_underenheter.watermark.not_seeded", {
      reason: "no snapshot_file_date — cannot anchor the feed without one",
    });
    return;
  }

  const existing = await sql<{ last_oppdateringsid: string }[]>`
    select last_oppdateringsid from raw.brreg_underenheter_feed_watermark where id = 1
  `;
  if (existing[0]) {
    logger.info("brreg_underenheter.watermark.left_alone", {
      existing: existing[0].last_oppdateringsid,
      reason: "a feed already ahead of this snapshot must not be moved",
    });
    return;
  }

  const url = `${FEED_URL}?dato=${fileDate}T00:00:00.000Z&size=1`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    logger.warn("brreg_underenheter.watermark.not_seeded", {
      reason: `feed returned HTTP ${response.status} for the snapshot date`,
    });
    return;
  }
  const body = (await response.json()) as {
    _embedded?: { oppdaterteUnderenheter?: { oppdateringsid?: number; dato?: string }[] };
  };
  const first = body._embedded?.oppdaterteUnderenheter?.[0];
  if (typeof first?.oppdateringsid !== "number") {
    logger.warn("brreg_underenheter.watermark.not_seeded", {
      reason: "the feed reported no change on the snapshot date",
    });
    return;
  }

  // Store one BELOW the first id of that day — the poller asks for
  // `watermark + 1` and the cursor is inclusive.
  const watermark = first.oppdateringsid - 1;
  await sql`
    insert into raw.brreg_underenheter_feed_watermark (id, last_oppdateringsid, last_dato, updated_at)
    values (1, ${watermark}, ${first.dato ?? null}, now())
    on conflict (id) do nothing
  `;
  logger.info("brreg_underenheter.watermark.seeded", {
    last_oppdateringsid: watermark,
    anchored_to: `${fileDate}T00:00:00.000Z`,
  });
}

/**
 * Stream the register into Postgres.
 *
 * Same idempotence design as brreg-enheter-alle: never truncates, never
 * deletes; every batch is `INSERT … ON CONFLICT (organisasjonsnummer) DO
 * UPDATE`. A sub-unit Brreg has removed since the last run stays in the table
 * until the change feed tombstones it via Sletting/Fjernet — a bulk file cannot
 * express a deletion.
 */
async function loadSnapshot(sampleOnly: number): Promise<BrregUnderenheterSummary> {
  const startedAt = Date.now();
  const { bytes, fileDate } = await openSnapshot();
  const records = parseUnderenheter(streamArrayElements(decodeUtf8(bytes)));

  const hasDb = Boolean(process.env["DATABASE_URL"]) && sampleOnly === 0;
  const sql = hasDb ? getSql() : null;

  let recordsRead = 0;
  let rowsUpserted = 0;
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
      chunkSize: batch.length,
    });
    batch = [];
    logger.debug("brreg_underenheter.load.progress", { records_read: recordsRead, rows_upserted: rowsUpserted });
  };

  for await (const record of records) {
    recordsRead += 1;

    if (sampleOnly > 0) {
      printSample(record);
      if (recordsRead >= sampleOnly) break;
      continue;
    }

    batch.push({
      organisasjonsnummer: record.organisasjonsnummer,
      doc: record.doc,
      snapshot_file_date: fileDate,
      loaded_at: new Date(),
    });

    if (batch.length >= BATCH_ROWS) await flush();

    if (recordsRead % 100_000 === 0) {
      logger.info("brreg_underenheter.load.progress", {
        records_read: recordsRead,
        elapsed_s: Math.round((Date.now() - startedAt) / 1000),
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    }
  }
  await flush();

  if (sql) await seedFeedWatermark(sql, fileDate);

  return {
    recordsRead,
    rowsUpserted,
    snapshotFileDate: fileDate,
    durationMs: Date.now() - startedAt,
  };
}

function printSample(record: BrregUnderenhetRecord): void {
  process.stdout.write(`${JSON.stringify(record.doc)}\n`);
}

/**
 * Entry point. `--sample N` streams only the first N records and prints them,
 * writing nothing.
 */
export async function run(sampleOnly = 0): Promise<BrregUnderenheterSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    const output = await loadSnapshot(sampleOnly);
    logger.info("brreg_underenheter.load.finished", {
      records_read: output.recordsRead,
      rows_upserted: output.rowsUpserted,
      snapshot_file_date: output.snapshotFileDate,
      duration_s: Math.round(output.durationMs / 1000),
    });
    return {
      output,
      record: {
        rowsScraped: output.recordsRead,
        rowsParsed: output.recordsRead,
        upstreamUpdatedAt: output.snapshotFileDate
          ? new Date(`${output.snapshotFileDate}T00:00:00Z`)
          : null,
        notes: `bulk snapshot; ${output.rowsUpserted} rows upserted in ${Math.round(output.durationMs / 1000)}s`,
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleFlag = process.argv.indexOf("--sample");
  const sample = sampleFlag >= 0 ? Number(process.argv[sampleFlag + 1] ?? 5) : 0;
  run(sample).catch((err: unknown) => {
    logger.error("brreg_underenheter.load.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
