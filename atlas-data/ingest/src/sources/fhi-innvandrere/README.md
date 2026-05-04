# fhi-innvandrere

FHI Folkehelsestatistikk table **175 — *Innvandrere og norskfødte med innvandrerforeldre, etter LANDBAK***. Population counts by country background — 1st-generation immigrants plus Norwegian-born with two immigrant parents — broken down by region × age band × landbakgrunn.

## What the script does

POSTs a filtered request (latest year, MEASURE_TYPE=TELLER) to FHI's open API and upserts ~33k rows to `raw.fhi_innvandrere`.

## Known quirks

- **The table covers two groups together.** "Innvandrere" (1st-gen immigrants) plus "norskfødte med innvandrerforeldre" (Norwegian-born with two immigrant parents). FHI's count semantics here are the standard SSB definition — exclude this group from native-Norwegian-only ratios elsewhere.
- **LANDBAK aggregates origin regions.** 8 codes spanning Norway-born background and broad world regions (Europe / Asia / Africa / Oceania / etc.), plus an aggregate. Verify the code list against FHI's docs — codes are not human-readable on their own (e.g. `456` is an aggregate group, `100` typically maps to "no immigrant background").
- **GEO mixes levels.** Standard FHI convention — kommune (4-digit), fylke (2-digit), bydel (6-digit), national (`0`).
- **No KJONN dimension.** This table aggregates across sex.

## Known issues / TODOs

- LANDBAK code-to-label mapping is missing. A reference seed with the 8 codes' Norwegian/English labels would help downstream analysts. Likely lives in FHI's dimension reference; needs hand-verification.
- Latest year only. AAR has 23 single-year values back to 2003; full backfill is doable (still under 50k).

## References

- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
