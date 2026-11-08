/**
 * Kartverket's current municipality boundaries (Geonorge dataset
 * 041f1e6e-bdbc-4091-b48f-8a5990f3cc5b), verbatim, one row per kommune.
 * urb-agents #2098/#2099 (R4).
 *
 * Unlike kartverket-postnummeromrade's file, this one is a standard
 * single-FeatureCollection GeoJSON document — but it MIXES two feature
 * types in one array: objtype='Kommune' (357 features, what this ingest
 * wants) and objtype='Grense' (27,380 features — the boundary LINES between
 * kommuner, a different layer). Filtered by objtype, not assumed to be
 * homogeneous.
 */
import AdmZip from "adm-zip";
import { placeGeonorgeOrder, downloadGeonorgeZip } from "../../lib/geonorge.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql } from "../../lib/postgres.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "kartverket-kommune";
const METADATA_UUID = "041f1e6e-bdbc-4091-b48f-8a5990f3cc5b";
const TARGET_TABLE = "raw.kartverket_kommune";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/kartverket-kommune.ndjson",
);

type NameEntry = { navn: string; rekkefolge: string; sprak: string };

type UpstreamProps = {
  objtype: string;
  kommunenummer: string;
  kommunenavn: string;
  administrativenhetnavn: NameEntry[];
  gyldigFra?: string | null;
  gyldigTil?: string | null;
};

type UpstreamFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: UpstreamProps;
};

type Row = {
  kommune_nr: string;
  kommune_navn: string;
  names: NameEntry[];
  gyldig_fra: string | null;
  gyldig_til: string | null;
  geometryGeoJson: string;
};

/** Upstream dates are "YYYYMMDD". */
function isoDateFromCompact(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function downloadAndExtractKommuner(downloadUrl: string): Promise<UpstreamFeature[]> {
  const zipBuffer = await downloadGeonorgeZip(downloadUrl);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".geojson"));
  if (entries.length !== 1) {
    throw new Error(
      `kartverket-kommune: expected exactly one .geojson entry in the ZIP, got ${entries.length} (${entries.map((e) => e.entryName).join(", ")})`,
    );
  }
  // The file carries a UTF-8 BOM (measured 2026-11-08) — Buffer#toString
  // does not strip it the way TextDecoder would, so a leading U+FEFF is
  // stripped explicitly before JSON.parse rather than assumed away.
  let text = entries[0]!.getData().toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = JSON.parse(text) as { features: UpstreamFeature[] };
  if (!Array.isArray(parsed.features)) {
    throw new Error("kartverket-kommune: no features array at the document root");
  }
  const kommuner = parsed.features.filter((f) => f.properties.objtype === "Kommune");
  if (kommuner.length === 0) {
    throw new Error(
      `kartverket-kommune: zero features with objtype='Kommune' out of ${parsed.features.length} total — upstream shape may have changed`,
    );
  }
  return kommuner;
}

function toRow(f: UpstreamFeature): Row {
  const p = f.properties;
  if (!p.kommunenummer || !p.kommunenavn || !Array.isArray(p.administrativenhetnavn)) {
    throw new Error(`kartverket-kommune: missing required property on feature ${JSON.stringify(p)}`);
  }
  if (!/^\d{4}$/.test(p.kommunenummer)) {
    throw new Error(`kartverket-kommune: bad kommunenummer ${JSON.stringify(p.kommunenummer)}`);
  }
  if (f.geometry.type !== "MultiPolygon") {
    throw new Error(
      `kartverket-kommune: expected MultiPolygon geometry, got ${f.geometry.type} for kommune ${p.kommunenummer}`,
    );
  }
  return {
    kommune_nr: p.kommunenummer,
    kommune_navn: p.kommunenavn,
    names: p.administrativenhetnavn,
    gyldig_fra: isoDateFromCompact(p.gyldigFra),
    gyldig_til: isoDateFromCompact(p.gyldigTil),
    geometryGeoJson: JSON.stringify(f.geometry),
  };
}

export async function run() {
  return recordIngestRun(SOURCE_ID, async () => {
    logger.info("source.start", { source_id: SOURCE_ID, metadata_uuid: METADATA_UUID });
    const started = Date.now();

    const order = await placeGeonorgeOrder({
      metadataUuid: METADATA_UUID,
      areaCode: "0000",
      areaName: "Hele landet",
      areaType: "landsdekkende",
      formatName: "GeoJSON",
      projectionCode: "4258",
      projectionName: "EUREF 89 Geografisk (ETRS 89) 2d",
      projectionCodespace: "http://www.opengis.net/def/crs/EPSG/0/4258",
    });
    const file = order.files[0];
    if (!file) {
      throw new Error("kartverket-kommune: order response had no files");
    }
    logger.info("order.placed", { file_name: file.name });

    const features = await downloadAndExtractKommuner(file.downloadUrl);
    const rows = features.map(toRow);

    await writeNdjson(OUTPUT_PATH, rows.map((r) => ({ ...r, geometry: JSON.parse(r.geometryGeoJson) })));

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      for (const row of rows) {
        await sql`
          insert into raw.kartverket_kommune
            (kommune_nr, kommune_navn, names, gyldig_fra, gyldig_til, geometry, loaded_at)
          values (
            ${row.kommune_nr}, ${row.kommune_navn}, ${sql.json(row.names)},
            ${row.gyldig_fra}, ${row.gyldig_til},
            ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryGeoJson}), 4258),
            ${now}
          )
          on conflict (kommune_nr) do update set
            kommune_navn = excluded.kommune_navn,
            names = excluded.names,
            gyldig_fra = excluded.gyldig_fra,
            gyldig_til = excluded.gyldig_til,
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
