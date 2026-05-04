# fhi-bor-alene

FHI Folkehelsestatistikk table **187 — "Personer som bor alene"**. Share of adults (16+) living alone, per region, annual.

**First non-SSB source in Atlas.** Proves the ingest framework works against a second public-stats provider. Catalogue entry exists in `docs/research/data-sources.md` as part of FHI Folkehelsestatistikk (entry 5).

## What the script does

POSTs a filtered data request to FHI's open API, parses the json-stat2 response (same format as SSB — our shared `parseJsonStat2` handles it), and upserts ~4 000 rows to `raw.fhi_bor_alene`.

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
