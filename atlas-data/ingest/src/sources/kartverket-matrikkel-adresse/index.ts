/**
 * Kartverket's national address file (Matrikkelen — Adresse), verbatim, one
 * row per address. urb-agents #2098/#2099 (R5).
 *
 * 2,604,785 addresses per the request; 2,604,936 measured 2026-11-08
 * (ordinary drift between the two dates). 46 columns, semicolon-delimited,
 * EPSG:4258. Confirmed 2026-11-08 against the real downloaded file:
 *   - exactly 46 fields on every line, no quoting — a naive split(";") is
 *     safe;
 *   - a UTF-8 BOM on the first header ("lokalid");
 *   - exactly two `adressetype` values, matrikkeladresse and vegadresse;
 *   - `adresseId` and `lokalid` are byte-identical (checked on a 100,000-row
 *     sample).
 *
 * ⚠️ STREAMED, NOT BUFFERED, UNLIKE kartverket-kommune/-fylke/-postnummeromrade.
 * Those decompress to tens of MB and `AdmZip#getData()` (one Buffer, one
 * `.toString()`) is fine. This file decompresses to ~812 MB — large enough to
 * risk V8's string-length ceiling on `.toString("utf8")`, the same class of
 * risk brreg-enheter-alle's own header calls "a requirement, not a
 * preference" for its 2 GB feed. `yauzl` opens the one entry as a true
 * Readable that inflates on demand; nothing here ever holds the whole
 * decompressed CSV in memory at once.
 */
import { createInterface } from "node:readline";
import yauzl from "yauzl";
import { placeGeonorgeOrder, downloadGeonorgeZip } from "../../lib/geonorge.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { getSql, upsert } from "../../lib/postgres.js";

export const SOURCE_ID = "kartverket-matrikkel-adresse";
const METADATA_UUID = "f7df7a18-b30f-4745-bd64-d0863812350c";
const TARGET_TABLE = "raw.kartverket_matrikkel_adresse";

const WRITE_COLUMNS = ["adresse_id", "doc", "loaded_at"] as const;

/** Same batch size as brreg-enheter-alle, for the same reason: large enough
 * that 2.6M rows is not 2.6M round trips, small enough that a failure
 * re-does seconds of work rather than minutes. */
const BATCH_ROWS = 2_000;

export interface MatrikkelAdresseSummary {
  rowsRead: number;
  rowsUpserted: number;
  durationMs: number;
}

/** Split one CSV data line, stripping a leading UTF-8 BOM if present (the
 * header row carries one on its first field; data rows do not, but the check
 * is cheap and correctness should not depend on which row it is). */
function splitLine(line: string): string[] {
  const text = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line;
  return text.split(";");
}

async function openCsvStream(): Promise<NodeJS.ReadableStream> {
  const order = await placeGeonorgeOrder({
    metadataUuid: METADATA_UUID,
    areaCode: "0000",
    areaName: "Hele landet",
    areaType: "landsdekkende",
    formatName: "CSV",
    projectionCode: "4258",
    projectionName: "EUREF 89 Geografisk (ETRS 89) 2d",
    projectionCodespace: "http://www.opengis.net/def/crs/EPSG/0/4258",
  });
  const file = order.files[0];
  if (!file) {
    throw new Error("kartverket-matrikkel-adresse: order response had no files");
  }
  logger.info("order.placed", { file_name: file.name });

  const zipBuffer = await downloadGeonorgeZip(file.downloadUrl);
  const zipfile = await yauzl.fromBufferPromise(zipBuffer);

  let csvEntry: yauzl.Entry | undefined;
  for await (const entry of zipfile.eachEntry()) {
    if (entry.fileName.endsWith(".csv")) {
      csvEntry = entry;
      break;
    }
  }
  if (!csvEntry) {
    throw new Error("kartverket-matrikkel-adresse: no .csv entry found in the ZIP");
  }
  logger.info("zip.entry_found", { entry_name: csvEntry.fileName, uncompressed_size: csvEntry.uncompressedSize });

  const readStream = await zipfile.openReadStreamPromise(csvEntry);
  readStream.setEncoding("utf8");
  return readStream;
}

async function loadMatrikkel(sampleOnly: number): Promise<MatrikkelAdresseSummary> {
  const startedAt = Date.now();
  const csvStream = await openCsvStream();
  const rl = createInterface({ input: csvStream });

  const hasDb = Boolean(process.env["DATABASE_URL"]) && sampleOnly === 0;
  const sql = hasDb ? getSql() : null;

  let header: string[] | null = null;
  let rowsRead = 0;
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
      conflictKeys: ["adresse_id"],
      chunkSize: batch.length,
    });
    batch = [];
  };

  for await (const line of rl) {
    if (!line) continue;

    if (!header) {
      header = splitLine(line);
      continue;
    }

    const fields = splitLine(line);
    if (fields.length !== header.length) {
      throw new Error(
        `kartverket-matrikkel-adresse: row ${rowsRead + 1} has ${fields.length} fields, header has ${header.length}`,
      );
    }

    rowsRead += 1;

    const doc: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) {
      doc[header[i]!] = fields[i]!;
    }

    if (sampleOnly > 0) {
      process.stdout.write(`${JSON.stringify(doc)}\n`);
      if (rowsRead >= sampleOnly) break;
      continue;
    }

    const adresseId = doc["adresseId"];
    if (!adresseId) {
      throw new Error(`kartverket-matrikkel-adresse: row ${rowsRead} has no adresseId`);
    }

    batch.push({
      adresse_id: adresseId,
      doc,
      loaded_at: new Date(),
    });

    if (batch.length >= BATCH_ROWS) await flush();

    if (rowsRead % 200_000 === 0) {
      logger.info("matrikkel.load.progress", {
        rows_read: rowsRead,
        rows_upserted: rowsUpserted,
        elapsed_s: Math.round((Date.now() - startedAt) / 1000),
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    }
  }
  await flush();

  return {
    rowsRead,
    rowsUpserted,
    durationMs: Date.now() - startedAt,
  };
}

export async function run(sampleOnly = 0): Promise<MatrikkelAdresseSummary> {
  return recordIngestRun(SOURCE_ID, async () => {
    const output = await loadMatrikkel(sampleOnly);
    logger.info("matrikkel.load.finished", {
      rows_read: output.rowsRead,
      rows_upserted: output.rowsUpserted,
      duration_s: Math.round(output.durationMs / 1000),
    });
    return {
      output,
      record: {
        rowsScraped: output.rowsRead,
        rowsParsed: output.rowsRead,
        upstreamUpdatedAt: null,
        notes: `bulk load; ${output.rowsUpserted} rows upserted in ${Math.round(output.durationMs / 1000)}s`,
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleFlag = process.argv.indexOf("--sample");
  const sample = sampleFlag >= 0 ? Number(process.argv[sampleFlag + 1] ?? 5) : 0;
  run(sample).catch((err: unknown) => {
    logger.error("source.failed", {
      source_id: SOURCE_ID,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
