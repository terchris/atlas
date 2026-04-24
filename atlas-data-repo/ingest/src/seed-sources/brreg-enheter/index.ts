/**
 * Refresh raw.brreg_enheter from Brreg's Enhetsregister.
 *
 * Generic across all NGOs. Reads ../atlas-ngo-landscape/landscape.json,
 * picks up every NGO that has a `brreg_query` block, calls
 * `fetchNgoUnits()` for each, and upserts the combined result into one
 * shared table: raw.brreg_enheter.
 *
 * To add a new NGO: add a `brreg_query` object to its entry in
 * landscape.json (navn, organisasjonsform, nameStartsWith). No new code,
 * no new migration, no new npm script.
 *
 * Upsert key is `orgnr` — re-running merges new rows and updates stale
 * columns. We do NOT delete rows: Brreg itself carries konkurs,
 * under_avvikling, and under_tvangsavvikling flags for entities winding
 * down, and those flow into the columns of the same names here.
 * Downstream consumers that care about "active NGOs" filter on those
 * flags instead of expecting a synthetic is_active signal.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../lib/logger.js";
import { closeSql, getSql, upsert } from "../../lib/postgres.js";
import {
  fetchNgoUnits,
  type FetchNgoUnitsOpts,
} from "../../lib/brreg/ngo-units.js";
import type { Enhet } from "../../lib/brreg/client.js";

export const SOURCE_ID = "brreg-enheter";
const TABLE = "raw.brreg_enheter";

const LANDSCAPE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../atlas-ngo-landscape/landscape.json",
);

const COLUMNS = [
  "orgnr",
  "navn",
  "organisasjonsform",
  "registrert_dato",
  "i_frivillighetsreg",
  "antall_ansatte",
  "konkurs",
  "under_avvikling",
  "under_tvangsavvikling",
  "raw_payload",
  "loaded_at",
] as const;

type Row = {
  orgnr: string;
  navn: string;
  organisasjonsform: string;
  registrert_dato: string | null;
  i_frivillighetsreg: boolean;
  antall_ansatte: number | null;
  konkurs: boolean;
  under_avvikling: boolean;
  under_tvangsavvikling: boolean;
  raw_payload: string;
  loaded_at: Date;
};

// Subset of the landscape.json shape we rely on. Only the fields this ingest
// needs — ignore the rest (tier, focus, etc. live on dim_ngo, not here).
type LandscapeNgo = {
  orgnr: string;
  slug: string;
  name: string;
  brreg_query?: FetchNgoUnitsOpts;
};

type Landscape = {
  ngos: LandscapeNgo[];
};

function shape(enhet: Enhet, now: Date): Row | null {
  const orgnr = enhet.organisasjonsnummer?.trim();
  const navn = enhet.navn?.trim();
  const orgform = enhet.organisasjonsform?.kode?.trim();
  if (!orgnr || !navn || !orgform) {
    logger.warn("brreg.skip_malformed_enhet", {
      source_id: SOURCE_ID,
      orgnr: orgnr ?? null,
      navn: navn ?? null,
      organisasjonsform: orgform ?? null,
    });
    return null;
  }
  return {
    orgnr,
    navn,
    organisasjonsform: orgform,
    registrert_dato: enhet.registreringsdatoEnhetsregisteret ?? null,
    i_frivillighetsreg: Boolean(enhet.registrertIFrivillighetsregisteret),
    antall_ansatte: enhet.antallAnsatte ?? null,
    konkurs: Boolean(enhet.konkurs),
    under_avvikling: Boolean(enhet.underAvvikling),
    under_tvangsavvikling: Boolean(enhet.underTvangsavviklingEllerTvangsopplosning),
    raw_payload: JSON.stringify(enhet),
    loaded_at: now,
  };
}

export async function run(): Promise<void> {
  logger.info("source.start", { source_id: SOURCE_ID });
  const started = Date.now();

  const landscapeText = await readFile(LANDSCAPE_PATH, "utf8");
  const landscape = JSON.parse(landscapeText) as Landscape;

  const ngosWithQuery = landscape.ngos.filter(
    (n): n is LandscapeNgo & { brreg_query: FetchNgoUnitsOpts } =>
      Boolean(n.brreg_query),
  );
  if (ngosWithQuery.length === 0) {
    throw new Error(
      `No NGOs in ${LANDSCAPE_PATH} have a brreg_query block — nothing to fetch. Add one to the NGO's entry in landscape.json to include it.`,
    );
  }
  logger.info("landscape.loaded", {
    source_id: SOURCE_ID,
    ngos_total: landscape.ngos.length,
    ngos_with_brreg_query: ngosWithQuery.length,
  });

  const now = new Date();
  const rows: Row[] = [];
  const seenOrgnrs = new Set<string>();

  for (const ngo of ngosWithQuery) {
    const ngoStarted = Date.now();
    const { enheter, pages, scanned, fuzzyNoiseFiltered } = await fetchNgoUnits(
      ngo.brreg_query,
    );
    logger.info("brreg.ngo_fetched", {
      source_id: SOURCE_ID,
      ngo_slug: ngo.slug,
      pages,
      scanned,
      matched: enheter.length,
      fuzzy_noise_filtered: fuzzyNoiseFiltered,
      duration_ms: Date.now() - ngoStarted,
    });
    if (enheter.length === 0) {
      logger.warn("brreg.ngo_zero_matches", {
        source_id: SOURCE_ID,
        ngo_slug: ngo.slug,
        brreg_query: ngo.brreg_query,
      });
      continue;
    }
    for (const enhet of enheter) {
      const row = shape(enhet, now);
      if (!row) continue;
      if (seenOrgnrs.has(row.orgnr)) continue; // same orgnr across NGOs (unlikely but defensive)
      seenOrgnrs.add(row.orgnr);
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error(
      `No rows across ${ngosWithQuery.length} NGO(s). Verify landscape.json brreg_query entries and Brreg status at data.brreg.no.`,
    );
  }

  logger.info("rows.shaped", {
    source_id: SOURCE_ID,
    rows: rows.length,
    ngos_fetched: ngosWithQuery.length,
  });

  const sql = getSql();
  try {
    const upsertStarted = Date.now();
    const written = await upsert(sql, {
      table: TABLE,
      rows,
      columns: COLUMNS,
      conflictKeys: ["orgnr"],
    });
    logger.info("postgres.upsert.done", {
      table: TABLE,
      rows_written: written,
      duration_ms: Date.now() - upsertStarted,
    });

    logger.info("source.done", {
      source_id: SOURCE_ID,
      duration_ms: Date.now() - started,
      rows: rows.length,
      in_frivillighetsreg: rows.filter((r) => r.i_frivillighetsreg).length,
      konkurs: rows.filter((r) => r.konkurs).length,
      under_avvikling: rows.filter((r) => r.under_avvikling).length,
    });
  } finally {
    await closeSql();
  }
}

run().catch((err) => {
  logger.error("source.failed", {
    source_id: SOURCE_ID,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
