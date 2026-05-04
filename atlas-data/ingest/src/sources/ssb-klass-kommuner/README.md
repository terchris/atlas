# ssb-klass-kommuner

SSB Klass classification **131 — Kommuner**. The canonical active-kommuner list. Sourced from SSB's classification registry (Klass), not from a statbank table.

## What the script does

Fetches a snapshot of currently-active kommune codes from `https://data.ssb.no/api/klass/v1/classifications/131/codesAt.json` at the ingest date, maps each code into a flat row, writes NDJSON, and (if `DATABASE_URL` is set) upserts to `raw.ssb_klass_kommuner`.

The downstream dbt model `dim_kommune` reads this raw table and is the source of truth for all kommune-level joins in the marts schema.

## Known quirks

- **No temporal history in a `codesAt` snapshot.** `validFrom` and `validTo` are both null — the server is saying "these codes are active at the date you asked for." When we need full history (for reconciling historical kommune codes in older SSB data), switch to the `/codes.json?from=YYYY-MM-DD` endpoint. Out of scope for v1.
- **Kommune name includes Sámi variants for some municipalities**. `"Oslo - Oslove"`, `"Kautokeino - Guovdageaidnu"`. Preserve verbatim; UI can split on " - " if only one form is wanted.
- **`parent_code` is null.** The fylke relationship is not expressed as a parent here. The first two digits of `code` encode fylke: `0301` → fylke `03`, `5601` → fylke `56`. The `dim_kommune` dbt model derives `fylke_nr` this way.
- **No `elimination=false` issue** — this API is a plain REST call, not PxWebAPI. No dimension filters needed.

## Known issues / TODOs

- No historical kommuner ingested. A separate ingest (ssb-klass-kommuner-history?) can pull from `/codes.json` when we need to reconcile older data against merged/renamed kommuner.
- `presentationName` and `shortName` are discarded — they were empty in sampled responses. Revisit if we see useful values.

## References

- Catalogue: this source will be promoted to the main `data-sources.md` catalogue once that document adopts the schema from `docs/research/samfunnspuls/data-source-schema.md`.
- Downstream: [`../../../../dbt/models/dimensions/dim_kommune.sql`](../../../../dbt/models/dimensions/dim_kommune.sql)
- Shared client: [`../../lib/klass.ts`](../../lib/klass.ts)
