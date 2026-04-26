# ssb-klass-kommuner

SSB Klass classification **131 — Kommuner**. The canonical active-kommuner list. Sourced from SSB's classification registry (Klass), not from a statbank table.

## What the script does

Fetches a snapshot of currently-active kommune codes from `https://data.ssb.no/api/klass/v1/classifications/131/codesAt.json` at the ingest date, maps each code into a flat row, writes NDJSON, and (if `DATABASE_URL` is set) upserts to `raw.ssb_klass_kommuner`.

The downstream dbt model `dim_kommune` reads this raw table and is the source of truth for all kommune-level joins in the marts schema.

## Upstream

| Field | Value |
|---|---|
| Provider | Statistisk sentralbyrå (SSB) |
| Classification | `131` (Kommuner) |
| URL | https://data.ssb.no/api/klass/v1/classifications/131/codesAt.json |
| Auth | None |
| Format | JSON (Klass-specific, not JSON-stat2) |
| Rate limits | SSB's general 30 req/min/IP |
| Licence | NLOD 2.0 |
| Attribution | *Kilde: Statistisk sentralbyrå, Klass (classification 131)* |

## Response shape

Flat list — unlike statbank tables, there are no dimensions to unflatten:

| Field | Type | Notes |
|---|---|---|
| `code` | string | 4-digit kommune code, e.g. `"0301"` (Oslo) |
| `name` | string | Kommune name, bokmål |
| `parentCode` | string \| null | Typically null for a `codesAt` snapshot; fylke relationship is encoded in the first 2 digits of `code` |
| `level` | string | Always `"1"` for this classification |
| `shortName` | string | Often empty |
| `presentationName` | string | Often empty |
| `validFrom`, `validTo` | string \| null | Both null in a `codesAt` snapshot |
| `notes` | string \| null | Historical context (boundary changes, Sámi name variants, etc.) |

Row count: ~358 at time of writing.

## Row shape emitted

```json
{
  "code": "0301",
  "name": "Oslo - Oslove",
  "parent_code": null,
  "level": "1",
  "short_name": null,
  "valid_from": null,
  "valid_to": null,
  "notes": "I 1980 ble del av 0231 Skedsmo overført til 0301 Oslo ..."
}
```

## How to run locally

```bash
npm run ingest:ssb-klass-kommuner
```

Expected: ~2 seconds end-to-end. ~358 rows.

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
