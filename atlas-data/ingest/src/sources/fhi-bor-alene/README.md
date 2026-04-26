# fhi-bor-alene

FHI Folkehelsestatistikk table **187 — "Personer som bor alene"**. Share of adults (16+) living alone, per region, annual.

**First non-SSB source in Atlas.** Proves the ingest framework works against a second public-stats provider. Catalogue entry exists in `docs/research/data-sources.md` as part of FHI Folkehelsestatistikk (entry 5).

## What the script does

POSTs a filtered data request to FHI's open API, parses the json-stat2 response (same format as SSB — our shared `parseJsonStat2` handles it), and upserts ~4 000 rows to `raw.fhi_bor_alene`.

## Upstream

| Field | Value |
|---|---|
| Provider | Folkehelseinstituttet (FHI) |
| Source | `nokkel` (Folkehelsestatistikk) |
| Table id | `187` |
| URL | https://statistikk-data.fhi.no/api/open/v1/nokkel/table/187 |
| Auth | None |
| Format | json-stat2 (response), JSON (request body) |
| Request method | **POST** (unlike SSB's GET) |
| Row cap | 50 000 per request |
| Licence | NLOD / CC BY (FHI publishes under open terms; verify per-table) |
| Attribution | *Kilde: Folkehelseinstituttet, Folkehelsestatistikk — tabell 187* |

## Response shape

Four dimensions, FHI's standard vocabulary:

| FHI dim | Atlas meaning | Codes |
|---|---|---|
| `GEO` | Region (mixed kommune/fylke/bydel/nasjon) | `0` (national), `03` (Oslo fylke), `0301` (Oslo kommune), `030101` (bydel) |
| `AAR` | Year or period | `"2025_2025"` for single-year, `"2023_2025"` for 3-year averages |
| `ALDER` | Age band, `min_max` format | `"16_120"` (all adults 16+), `"16_29"`, `"65_74"`, `"75_84"`, `"85_120"` etc. |
| `MEASURE_TYPE` | Which number | `RATE` (percent), `SMR` (standardised ratio vs national), `TELLER` (absolute count) |

## Query used

```json
{
  "dimensions": [
    { "code": "AAR",          "filter": "bottom", "values": ["1"] },
    { "code": "ALDER",        "filter": "all",    "values": ["*"] },
    { "code": "GEO",          "filter": "all",    "values": ["*"] },
    { "code": "MEASURE_TYPE", "filter": "all",    "values": ["*"] }
  ],
  "response": { "format": "json-stat2", "maxRowCount": 50000 }
}
```

`bottom: "1"` returns the **latest** AAR value (FHI's `bottom` = end of list). Approximate cell count: 1 year × ~10 age groups × ~400 regions × 3 measure types ≈ 12 000.

## Row shape emitted

```json
{
  "geo_code": "0301",
  "aar_code": "2025_2025",
  "alder_code": "16_120",
  "measure_type": "RATE",
  "value": 34.37,
  "status": null
}
```

Oslo, 2025, all adults 16+, share living alone = 34.4 %.

## How to run locally

```bash
npm run ingest:fhi-bor-alene
```

## Known quirks

- **POST-only data endpoint.** FHI's `/data` requires a POST with a JSON body; unlike SSB's GET-based PxWebAPI. Our `lib/fhi.ts` client handles this. A GET to `/data` returns HTTP 405.
- **Filter vocabulary differs from intuition.** FHI's `top` = **first N** of the dimension order (earliest for time). `bottom` = **last N** (latest for time). Counterintuitive until you see it.
- **GEO mixes levels without type markers.** Same problem as SSB's Region dimension — our indicator model filters to 4-digit codes for `kommune_nr`.
- **AAR codes are ranges.** Even single-year tables use `"YYYY_YYYY"` form. Parse as `aar_code.split("_")[0]` for start year.
- **Three measures per cell.** Every (geo × year × age) combination yields 3 rows (RATE, SMR, TELLER). The fact model picks the one(s) it wants per feature.

## Known issues / TODOs

- Latest-year-only ingest. Historical series would roughly 20× the row count — doable (still well under 50 000) but not needed for v1.
- No ALDER aggregation done at ingest — that's a downstream concern. The dbt indicator model filters to `alder_code = '16_120'` to expose the "all adults" headline.

## References

- Catalogue (broad): [`docs/research/data-sources.md`](../../../../../docs/research/data-sources.md) entry 5 (FHI Folkehelsestatistikk).
- Upstream docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2` — used for FHI's json-stat2 too)
