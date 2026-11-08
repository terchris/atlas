/**
 * Kartverket's current county boundaries (Geonorge dataset
 * 6093c8a8-fa80-11e6-bc64-92361f002671), verbatim, one row per fylke.
 * urb-agents #2098/#2099 (R4). Sibling to kartverket-kommune — see that
 * source's own header for the shared shape (BOM, mixed objtype values,
 * multi-language names array).
 */
import AdmZip from "adm-zip";
import { placeGeonorgeOrder, downloadGeonorgeZip } from "../../lib/geonorge.js";
import { recordIngestRun } from "../../lib/ingest_run.js";
import { logger } from "../../lib/logger.js";
import { writeNdjson } from "../../lib/output.js";
import { getSql } from "../../lib/postgres.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ID = "kartverket-fylke";
const METADATA_UUID = "6093c8a8-fa80-11e6-bc64-92361f002671";
const TARGET_TABLE = "raw.kartverket_fylke";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../output/kartverket-fylke.ndjson",
);

type NameEntry = { navn: string; rekkefolge: string; sprak: string };

type UpstreamProps = {
  objtype: string;
  fylkesnummer: string;
  fylkesnavn: string;
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
  fylke_nr: string;
  fylke_navn: string;
  names: NameEntry[];
  gyldig_fra: string | null;
  gyldig_til: string | null;
  geometryGeoJson: string;
};

function isoDateFromCompact(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function downloadAndExtractFylker(downloadUrl: string): Promise<UpstreamFeature[]> {
  const zipBuffer = await downloadGeonorgeZip(downloadUrl);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".geojson"));
  if (entries.length !== 1) {
    throw new Error(
      `kartverket-fylke: expected exactly one .geojson entry in the ZIP, got ${entries.length} (${entries.map((e) => e.entryName).join(", ")})`,
    );
  }
  let text = entries[0]!.getData().toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = JSON.parse(text) as { features: UpstreamFeature[] };
  if (!Array.isArray(parsed.features)) {
    throw new Error("kartverket-fylke: no features array at the document root");
  }
  const fylker = parsed.features.filter((f) => f.properties.objtype === "Fylke");
  if (fylker.length === 0) {
    throw new Error(
      `kartverket-fylke: zero features with objtype='Fylke' out of ${parsed.features.length} total — upstream shape may have changed`,
    );
  }
  return fylker;
}

function toRow(f: UpstreamFeature): Row {
  const p = f.properties;
  if (!p.fylkesnummer || !p.fylkesnavn || !Array.isArray(p.administrativenhetnavn)) {
    throw new Error(`kartverket-fylke: missing required property on feature ${JSON.stringify(p)}`);
  }
  if (!/^\d{2}$/.test(p.fylkesnummer)) {
    throw new Error(`kartverket-fylke: bad fylkesnummer ${JSON.stringify(p.fylkesnummer)}`);
  }
  if (f.geometry.type !== "MultiPolygon") {
    throw new Error(
      `kartverket-fylke: expected MultiPolygon geometry, got ${f.geometry.type} for fylke ${p.fylkesnummer}`,
    );
  }
  return {
    fylke_nr: p.fylkesnummer,
    fylke_navn: p.fylkesnavn,
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
      throw new Error("kartverket-fylke: order response had no files");
    }
    logger.info("order.placed", { file_name: file.name });

    const features = await downloadAndExtractFylker(file.downloadUrl);
    const rows = features.map(toRow);

    await writeNdjson(OUTPUT_PATH, rows.map((r) => ({ ...r, geometry: JSON.parse(r.geometryGeoJson) })));

    let rowsWritten = 0;
    const wroteToPostgres = Boolean(process.env["DATABASE_URL"]);
    if (wroteToPostgres) {
      const sql = getSql();
      const now = new Date();
      for (const row of rows) {
        await sql`
          insert into raw.kartverket_fylke
            (fylke_nr, fylke_navn, names, gyldig_fra, gyldig_til, geometry, loaded_at)
          values (
            ${row.fylke_nr}, ${row.fylke_navn}, ${sql.json(row.names)},
            ${row.gyldig_fra}, ${row.gyldig_til},
            ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryGeoJson}), 4258),
            ${now}
          )
          on conflict (fylke_nr) do update set
            fylke_navn = excluded.fylke_navn,
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
