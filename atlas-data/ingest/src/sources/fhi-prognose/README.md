# fhi-prognose

FHI Folkehelsestatistikk table **171 — *Befolkningsframskriving***. Population projections by region × age band × forecast year. Pairs with `fhi-befolkning` (table 338, observed counts) so trajectories splice naturally.

## What the script does

POSTs a filtered request (latest published year, KJONN=0 combined, MEASURE_TYPE=TELLER, 3 forecast horizons: 2030 / 2040 / 2050) to FHI's open API and upserts ~38k rows to `raw.fhi_prognose`.

## Known quirks

- **Cell budget forces aggressive filtering.** Full cartesian product is ~990k cells — over 25× FHI's 50k cap. We pull KJONN=0 only and 3 canonical 10-year horizons (2030/2040/2050). Sex-stratified or 5-year-step slices can be added as sibling sources later if downstream needs them.
- **AAR is the *base* year of the projection** (the year on which the forecast is anchored), not the year being projected. PROGNOSEAAR is the year being projected to. Joining `fhi-befolkning` (observed) and `fhi-prognose` (projected) requires aligning `AAR` (observed) with `PROGNOSEAAR` (projected) — *not* AAR-to-AAR.
- **ALDER bands overlap.** 31 codes including 5-year disjoint slices (`0_4`, `5_9`, …, `100_120`), aggregates (`0_17`, `45_64`, `80_120`), and the universal `0_120`. Pick a single non-overlapping partition downstream.
- **PROGNOSEAAR codes go to 2050** (and a bit beyond). Atlas keeps 3 horizons; full set is per-year codes from the AAR base + 1 through 2050+.

## Known issues / TODOs

- Add intermediate horizons (2025 / 2035 / 2045) if downstream wants 5-year resolution; would push cells past the 50k cap unless KJONN is also wildcarded across two ingests.
- Sex-stratified slice (`fhi-prognose-kjonn`?) for analyses that need male/female trajectories.

## References

- Companion source: [`../fhi-befolkning/`](../fhi-befolkning/) (table 338 — observed counts on the same dimension shape)
- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
