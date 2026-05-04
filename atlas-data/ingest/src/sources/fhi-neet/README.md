# fhi-neet

FHI Folkehelsestatistikk table **809 — *NEET_UTDANN***. Share of young people Not in Education, Employment, or Training, broken down by age band × parents' education level.

## What the script does

POSTs a filtered data request (KJONN=0 combined sexes, MEASURE_TYPE=RATE only) to FHI's open API and upserts ~28k rows to `raw.fhi_neet`.

## Known quirks

- **NEET = Not in Education, Employment, or Training.** Standard youth-disengagement indicator. Numerator is youth in none of those three categories; denominator is the full population in the age band.
- **UTDANN here is parents' education**, not the youth's own. Reflects socioeconomic context — children of higher-educated parents have markedly lower NEET rates. Codes 0 (all), 1 (grunnskole), 2 (videregående), 3 (høgskole/universitet kort), 4 (høgskole/universitet lang).
- **Sex breakdown dropped at ingest.** KJONN filtered to "0" (both) to stay under FHI's 50k cap while keeping the by-age × by-parents-education resolution. Re-ingest with KJONN wildcard if a sex-stratified analysis is needed.
- **ALDER bands overlap.** Includes both the canonical NEET span `15_29` and finer-grained slices `15_19`, `20_24`, `25_29`. Pick a single non-overlapping partition downstream.

## Known issues / TODOs

- Latest year only. AAR has 17 values (2008–2024); historical series would 17× the row count and still fit if MEASURE_TYPE stays at RATE.
- Add a sex-stratified slice as a sibling source if downstream needs `kjonn` resolution.

## References

- Upstream API docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
