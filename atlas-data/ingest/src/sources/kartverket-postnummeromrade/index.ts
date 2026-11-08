/**
 * Kartverket's Postnummerområder (Geonorge dataset
 * 462a5297-33ef-438a-82a5-07fff5799be3), verbatim, one row per upstream
 * GeoJSON feature. urb-agents #2098/#2099 (R3).
 *
 * Geonorge's "nedlasting" (download) API is order-based, not a static file
 * URL: POST an order naming the dataset, area ("0000" = landsdekkende, the
 * whole country), format and CRS; the response for this dataset comes back
 * synchronously (`status: "ReadyForDownload"`, no email wait) with a
 * one-time download URL for a ZIP containing one GeoJSON file.
 *
 * Discovered by querying the real API end to end (kartkatalog search ->
 * capabilities -> codelists -> order), not by guessing REST paths —
 * Geonorge publishes no single documented URL for "the postcode areas
 * file" the way FHI/SSB publish a stable table-id endpoint.
 */
import AdmZip from "adm-zip";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql } from "../../lib/postgres.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "kartverket-postnummeromrade";
const METADATA_UUID = "462a5297-33ef-438a-82a5-07fff5799be3";
const ORDER_URL = "https://nedlasting.geonorge.no/api/order";
const TARGET_TABLE = "raw.kartverket_postnummeromrade";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/kartverket-postnummeromrade.ndjson",
);

type UpstreamProps = {
  postnummer: string;
  poststed: string;
  kommune: string;
  lokalid: string;
  versjonid?: string | null;
  oppdateringsdato?: string | null;
};

type UpstreamFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: UpstreamProps;
};

type Row = {
  lokalid: string;
  postnummer: string;
  poststed: string;
  kommune_nr: string;
  oppdateringsdato: string | null;
  versjonid: string | null;
  geometryGeoJson: string;
};

type OrderResponse = {
  files: { downloadUrl: string; name: string }[];
};

async function placeOrder(): Promise<OrderResponse> {
  const res = await fetch(ORDER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "",
      orderLines: [
        {
          metadataUuid: METADATA_UUID,
          areas: [{ code: "0000", name: "Hele landet", type: "landsdekkende" }],
          formats: [{ name: "GeoJSON" }],
          projections: [
            {
              code: "4258",
              name: "EUREF 89 Geografisk (ETRS 89) 2d",
              codespace: "http://www.opengis.net/def/crs/EPSG/0/4258",
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`kartverket-postnummeromrade: order failed HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OrderResponse;
}

async function downloadAndExtract(downloadUrl: string): Promise<UpstreamFeature[]> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`kartverket-postnummeromrade: download failed HTTP ${res.status} ${res.statusText}`);
  }
  const zipBuffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".geojson"));
  if (entries.length !== 1) {
    throw new Error(
      `kartverket-postnummeromrade: expected exactly one .geojson entry in the ZIP, got ${entries.length} (${entries.map((e) => e.entryName).join(", ")})`,
    );
  }
  const text = entries[0]!.getData().toString("utf8");
  const parsed = JSON.parse(text) as Record<string, { features: UpstreamFeature[] }>;
  // Not a standard GeoJSON document: the file carries TWO SOSI-derived
  // namespace keys, not one — "postnummeromrader.postnummeromrade" (the
  // areas, what this ingest wants) and "postnummeromrader.postnummeromradegrense"
  // (the boundary LINES between areas, a separate layer). Measured
  // 2026-11-08 by actually inspecting the downloaded file's keys, not
  // assumed from the areas-only key this ingest first (wrongly) expected
  // exactly one of.
  const AREA_KEY_SUFFIX = ".postnummeromrade";
  const areaKey = Object.keys(parsed).find(
    (k) => k.endsWith(AREA_KEY_SUFFIX) && Array.isArray(parsed[k]?.features),
  );
  if (!areaKey) {
    throw new Error(
      `kartverket-postnummeromrade: no key ending in "${AREA_KEY_SUFFIX}" with a features array found, got ${JSON.stringify(Object.keys(parsed))}`,
    );
  }
  return parsed[areaKey]!.features;
}

function toRow(f: UpstreamFeature): Row {
  const p = f.properties;
  if (!p.lokalid || !p.postnummer || !p.poststed || !p.kommune) {
    throw new Error(`kartverket-postnummeromrade: missing required property on feature ${JSON.stringify(p)}`);
  }
  if (!/^\d{4}$/.test(p.postnummer)) {
    throw new Error(`kartverket-postnummeromrade: bad postnummer ${JSON.stringify(p.postnummer)}`);
  }
  if (!/^\d{4}$/.test(p.kommune)) {
    throw new Error(`kartverket-postnummeromrade: bad kommune ${JSON.stringify(p.kommune)} for postnummer ${p.postnummer}`);
  }
  if (f.geometry.type !== "Polygon") {
    // Loud, not silent: this ingest (and migration 076's column type) assumes
    // every feature is a single Polygon, measured true for all 3,450
    // features on 2026-11-08. A MultiPolygon or other type means the
    // upstream shape changed and the assumption needs re-checking, not
    // quietly accepting a different geometry type into a Polygon column.
    throw new Error(
      `kartverket-postnummeromrade: expected Polygon geometry, got ${f.geometry.type} for postnummer ${p.postnummer} (lokalid ${p.lokalid})`,
    );
  }
  return {
    lokalid: p.lokalid,
    postnummer: p.postnummer,
    poststed: p.poststed,
    kommune_nr: p.kommune,
    oppdateringsdato: p.oppdateringsdato ? isoDateFromCompact(p.oppdateringsdato) : null,
    versjonid: p.versjonid ?? null,
    geometryGeoJson: JSON.stringify(f.geometry),
  };
}

/** Kartverket's oppdateringsdato, where present, is "YYYYMMDD..." — only the date part is kept. */
function isoDateFromCompact(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, metadata_uuid: METADATA_UUID });
    const started = Date.now();

    const order = await placeOrder();
    const file = order.files[0];
    if (!file) {
      throw new Error("kartverket-postnummeromrade: order response had no files");
    }
    logger.info("order.placed", { file_name: file.name });

    const features = await downloadAndExtract(file.downloadUrl);
    const rows = features.map(toRow);

    await writeNdjson(OUTPUT_PATH, rows.map((r) => ({ ...r, geometry: JSON.parse(r.geometryGeoJson) })));

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      for (const row of rows) {
        await sql`
          insert into raw.kartverket_postnummeromrade
            (lokalid, postnummer, poststed, kommune_nr, oppdateringsdato, versjonid, geometry, loaded_at)
          values (
            ${row.lokalid}, ${row.postnummer}, ${row.poststed}, ${row.kommune_nr},
            ${row.oppdateringsdato}, ${row.versjonid},
            ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryGeoJson}), 4258),
            ${now}
          )
          on conflict (lokalid) do update set
            postnummer = excluded.postnummer,
            poststed = excluded.poststed,
            kommune_nr = excluded.kommune_nr,
            oppdateringsdato = excluded.oppdateringsdato,
            versjonid = excluded.versjonid,
            geometry = excluded.geometry,
            loaded_at = excluded.loaded_at
        `;
        rowsWritten += 1;
      }
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
