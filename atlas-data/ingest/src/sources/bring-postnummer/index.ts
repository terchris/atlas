/**
 * Posten Bring's Postnummerregister, verbatim, including the kategori
 * column dim_postnummer drops. urb-agents #2098/#2099 (R2) — see
 * atlas-data/migrations/075_raw_bring_postnummer.sql for why this is a
 * separate table from the existing dim_postnummer seed rather than a
 * replacement for it.
 *
 * Source: https://www.bring.no/postnummerregister-ansi.txt
 *   - Tab-separated, no header, ~5,100 rows.
 *   - Encoding: Windows-1252 (the .txt UTF-8 variant 404s — same quirk the
 *     existing seed-refresh script already found and documented).
 *   - 5 columns: postnummer, poststed, kommune_nr, kommune_navn, kategori.
 *   - No Last-Modified header (checked 2026-11-08) — loaded_at is the only
 *     date available, and it is a fetch date, not a publication date.
 */
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql, upsert } from "../../lib/postgres.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "bring-postnummer";
const ENDPOINT = "https://www.bring.no/postnummerregister-ansi.txt";
const TARGET_TABLE = "raw.bring_postnummer";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/bring-postnummer.ndjson",
);

const WRITE_COLUMNS = [
  "postnummer",
  "poststed",
  "kommune_nr",
  "kommune_navn",
  "kategori",
  "loaded_at",
] as const;
const CONFLICT_KEYS = ["postnummer"] as const;

type Row = {
  postnummer: string;
  poststed: string;
  kommune_nr: string;
  kommune_navn: string;
  kategori: string;
};

const KATEGORI = new Set(["G", "P", "B", "S", "F"]);

function parse(text: string): Row[] {
  const rows: Row[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields.length < 5) {
      throw new Error(`bring-postnummer: unexpected row (<5 fields): ${JSON.stringify(line)}`);
    }
    const [postnummer, poststed, kommune_nr, kommune_navn, kategori] = fields;
    if (!/^\d{4}$/.test(postnummer ?? "")) {
      throw new Error(`bring-postnummer: bad postnummer ${JSON.stringify(postnummer)}`);
    }
    if (!/^\d{4}$/.test(kommune_nr ?? "")) {
      throw new Error(`bring-postnummer: bad kommune_nr ${JSON.stringify(kommune_nr)} for postnummer ${postnummer}`);
    }
    // Loud, not silent: a category outside the five Bring documents means
    // the upstream shape changed, which is exactly what this project does
    // not assume away — see KATEGORI's own definition in R2's manifest.
    if (!KATEGORI.has(kategori ?? "")) {
      throw new Error(`bring-postnummer: unknown kategori ${JSON.stringify(kategori)} for postnummer ${postnummer}`);
    }
    rows.push({
      postnummer: postnummer ?? "",
      poststed: poststed ?? "",
      kommune_nr: kommune_nr ?? "",
      kommune_navn: kommune_navn ?? "",
      kategori: kategori ?? "",
    });
  }
  return rows;
}

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, url: ENDPOINT });
    const started = Date.now();

    const res = await fetch(ENDPOINT, {
      headers: { "User-Agent": "atlas-data/0.0 (https://atlas.helpers.no)" },
    });
    if (!res.ok) {
      throw new Error(`bring-postnummer: HTTP ${res.status} ${res.statusText}`);
    }
    const buffer = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder("windows-1252").decode(buffer);
    const rows = parse(text);

    await writeNdjson(OUTPUT_PATH, rows);

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      rowsWritten = await upsert(sql, {
        table: TARGET_TABLE,
        rows: rows.map((r) => ({ ...r, loaded_at: now })),
        columns: WRITE_COLUMNS,
        conflictKeys: CONFLICT_KEYS,
      });
    } else {
      logger.info("postgres.upsert.skipped", { reason: "DATABASE_URL not set" });
    }

    logger.info("source.done", {
      source_id: SOURCE_ID,
      row_count: rows.length,
      duration_ms: Date.now() - started,
      wrote_to_postgres: wroteToPostgres,
      rows_written: rowsWritten,
    });

    return {
      output: undefined,
      record: {
        rowsScraped: rows.length,
        rowsParsed: rows.length,
        upstreamUpdatedAt: null,
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: unknown) => {
    logger.error("source.failed", {
      source_id: SOURCE_ID,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  });
}
