# fhi-befolkning

FHI Folkehelsestatistikk table **338 — *Befolkningssammensetning_antall_andel***. Population counts by region × sex × age band, used as the demographic denominator across other indicators (per-capita rates, age structure).

## What the script does

POSTs a filtered data request (MEASURE_TYPE = TELLER only) to FHI's open API and upserts ~43 k rows to `raw.fhi_befolkning`. SMR / RATE are derivable downstream from the same counts.

## Known quirks

- **Cell budget forces a measure filter.** The full cartesian product (409 GEO × latest AAR × 3 KJONN × 35 ALDER × 3 MEASURE) is ~129 k cells, over FHI's 50 k cap. We pull TELLER only — RATE / SMR can be re-computed by the dbt indicator model from the count slices it needs (e.g. kids / total → child share).
- **ALDER bands overlap.** Codes include both `0_120` (everyone) and disjoint slices like `0_4`, `5_14`, `15_24`. Downstream queries must pick a single age-band partition; do not sum across the codes blindly.
- **GEO mixes levels.** Same FHI convention as bor-alene / mobbing — kommune (4-digit), fylke (2-digit), bydel (6-digit), national (`0`) all in the same dimension.

## Known issues / TODOs

- Latest-year-only ingest. AAR has 36 single-year values (1990 onwards); historical series would 36× the row count. Doable in chunks if needed; not required for v1.
- KJONN values: `0` (both), `1` (men), `2` (women) — confirm interpretation against an FHI dimension reference if anything drifts.

## References

- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
