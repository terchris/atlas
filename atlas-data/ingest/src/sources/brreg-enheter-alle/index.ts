/**
 * brreg-enheter-alle — the complete Enhetsregisteret, streamed into
 * `raw.brreg_enheter_snapshot`.
 *
 * One request to Brreg's daily bulk endpoint, gunzipped and parsed in flight,
 * upserted in batches on `organisasjonsnummer`. ~1.17M organisations, ~210 MB
 * over the wire, ~2.0 GB of JSON, in ~33 MB of resident memory (PLAN-001
 * phase 1, measured 2026-09-11).
 *
 * This is a *bootstrap* load, not a scheduled one. It exists to bring a fresh
 * install from zero to a complete register; keeping it current afterwards is the
 * change feed's job (PLAN-002), which reads `/oppdateringer/enheter` and touches
 * only what moved. Nothing here self-triggers — see the Dagster asset docstring
 * for why that is deliberate rather than unfinished.
 *
 * Parsing lives in `./parse.ts`; this file owns HTTP, decompression, Postgres
 * and the run lifecycle.
 *
 * ⚠️ NO NDJSON OUTPUT FILE. Every other source writes one under `output/` for
 * local inspection. At this volume that is a 2 GB file written on every run for
 * no reader, so this source does not. `--sample` prints the first few records to
 * stdout instead, which is what the output file was actually used for.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { getSql, upsert } from "../../lib/postgres.js";
import {
  parseEnheter,
  snapshotFileDate,
  streamArrayElements,
  type BrregEnhetRecord,
} from "./parse.js";

export const SOURCE_ID = "brreg-enheter-alle";

const DOWNLOAD_URL = "https://data.brreg.no/enhetsregisteret/api/enheter/lastned";

/**
 * ⚠️ Not `application/json` — that is answered with **HTTP 400**, verified
 * 2026-09-11. The endpoint is content-negotiated and this vendor type is the
 * contract.
 *
 * Pinning `.v2` rather than sending a wildcard Accept is deliberate: if Brreg
 * rolls a v3 record shape, a pinned Accept returns 406 and the run fails loudly.
 * A wildcard would quietly hand back a different structure, which `doc` would
 * store without complaint and dbt would then read wrongly.
 */
const ACCEPT = "application/vnd.brreg.enhetsregisteret.enhet.v2+gzip";

const TARGET_TABLE = "raw.brreg_enheter_snapshot";

const WRITE_COLUMNS = [
  "organisasjonsnummer",
  "doc",
  "snapshot_file_date",
  "loaded_at",
] as const;

/**
 * Rows per upsert statement batch. 2,000 × ~1.7 KB ≈ 3.4 MB of parameters per
 * flush — large enough that the 1.17M rows do not become a million round trips,
 * small enough that a failure re-does seconds of work rather than hours.
 */
const BATCH_ROWS = 2_000;

export interface BrregEnheterAlleSummary {
  recordsRead: number;
  rowsUpserted: number;
  snapshotFileDate: string | null;
  durationMs: number;
}

/**
 * Decode a byte stream as UTF-8 without splitting multi-byte characters at chunk
 * boundaries. Norwegian names are full of æ/ø/å; a naive `chunk.toString()` per
 * chunk corrupts whichever ones happen to straddle a 64 KB boundary, and it does
 * so rarely enough to survive a small test and fail in production.
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
  logger.info("brreg.download.start", { url: DOWNLOAD_URL, accept: ACCEPT });
  const response = await fetch(DOWNLOAD_URL, { headers: { Accept: ACCEPT } });
  if (!response.ok || !response.body) {
    throw new Error(
      `brreg bulk download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const fileDate = snapshotFileDate(response.headers.get("last-modified"));
  logger.info("brreg.download.open", {
    status: response.status,
    content_length: response.headers.get("content-length"),
    content_type: response.headers.get("content-type"),
    snapshot_file_date: fileDate,
  });

  // Gunzip explicitly rather than letting fetch do it: the endpoint serves
  // `Content-Type: application/gzip` as a payload, not as a transfer encoding,
  // so nothing decompresses it for us.
  const gunzip = createGunzip();
  const source = Readable.fromWeb(response.body as never);
  // Kept unawaited on purpose — the consumer drives the pipe by reading
  // `gunzip`; awaiting here would deadlock. Errors still surface, because a
  // failed pipeline destroys `gunzip` and the consumer's `for await` throws.
  void pipeline(source, gunzip).catch((err: unknown) => {
    logger.error("brreg.download.pipeline_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { bytes: gunzip as AsyncIterable<Buffer>, fileDate };
}

/**
 * Stream the register into Postgres.
 *
 * 🔴 IDEMPOTENCE (PLAN-001 task 2.6). This never truncates and never deletes.
 * Every batch is `INSERT … ON CONFLICT (organisasjonsnummer) DO UPDATE`, so a
 * second run over a populated table replaces rows in place and a run that dies
 * halfway leaves a register that is partially fresh rather than partially empty.
 *
 * The consequence, named because it is the honest one: an organisation Brreg has
 * *removed* since the last run stays in the table. Deletions arrive through the
 * change feed as `Sletting` and `Fjernet` events (PLAN-002); a bulk file cannot
 * express them, because absence from a 1.17M-record file is not a signal you can
 * distinguish from a truncated download.
 */
async function loadSnapshot(sampleOnly: number): Promise<BrregEnheterAlleSummary> {
  const startedAt = Date.now();
  const { bytes, fileDate } = await openSnapshot();
  const records = parseEnheter(streamArrayElements(decodeUtf8(bytes)));

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
    logger.debug("brreg.load.progress", { records_read: recordsRead, rows_upserted: rowsUpserted });
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
      // postgres.js serialises the object into the jsonb parameter. The doc is
      // whatever JSON.parse produced from the upstream bytes — no field is
      // dropped, renamed, re-encoded or escaped on the way through.
      doc: record.doc,
      snapshot_file_date: fileDate,
      loaded_at: new Date(),
    });

    if (batch.length >= BATCH_ROWS) await flush();

    if (recordsRead % 100_000 === 0) {
      logger.info("brreg.load.progress", {
        records_read: recordsRead,
        elapsed_s: Math.round((Date.now() - startedAt) / 1000),
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    }
  }
  await flush();

  return {
    recordsRead,
    rowsUpserted,
    snapshotFileDate: fileDate,
    durationMs: Date.now() - startedAt,
  };
}

function printSample(record: BrregEnhetRecord): void {
  process.stdout.write(`${JSON.stringify(record.doc)}\n`);
}

/**
 * Entry point. `--sample N` streams only the first N records and prints them,
 * writing nothing — the cheap way to see what the upstream currently ships
 * without a database or a 2 GB download to completion.
 */
export async function run(sampleOnly = 0): Promise<BrregEnheterAlleSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    const output = await loadSnapshot(sampleOnly);
    logger.info("brreg.load.finished", {
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
    logger.error("brreg.load.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
