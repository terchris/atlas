# fhi-ensomhet

FHI Folkehelsestatistikk table **348 — "Ensomhet_Ungdata_KH"**. Loneliness among 8th-10th graders
(Ungdata survey), per kommune, annual.

Added for urb-agents #2100/#2101 (T5): atlas-scraper/rcdotno asked Atlas to serve loneliness
itself, per municipality, if it's available at that grain — confirmed 2026-11-08 that the table
publishes at kommune grain, and ingested here. ⚠️ "Publishes a row" is not "publishes a value":
only 100 of the 357 kommuner carry a non-null figure (96 for each of the boys/girls breakdowns) —
the rest are suppressed for small sample size. Ingested anyway, suppression and all, same as
every other source.

## What the script does

POSTs a filtered data request to FHI's open API, parses the json-stat2 response, and upserts
~1,200 rows to `raw.fhi_ensomhet`.

## Known quirks

- **Only SMR is published, not RATE or TELLER.** Probed all three MEASURE_TYPE values directly
  against the live API 2026-11-08: RATE and TELLER both answer `"Measure types with Values X not
  found for datasetId 520"`; only SMR succeeds. This table is a standardised ratio against the
  national average, never a raw percentage and never a count — say so wherever it's surfaced.
- **MEASURE_TYPE must be requested as `item`, not `all`.** `all` is rejected outright
  (`"Filter must be specified for dimension MEASURE_TYPE"`), unlike fhi-bor-alene's table 187
  where `all` works for every dimension including this one.
- **ALDER, NIVA_PLAGET and SOES each resolve to exactly one category** at this table's grain
  (8-10.trinn / "ganske eller veldig mye plaget" / samlet) — requested as `all` anyway so a future
  upstream addition arrives rather than erroring against a hardcoded single value.
- **KJONN has three real values** (total/boys/girls) and is kept, unlike ALDER/NIVA_PLAGET/SOES —
  worth the extra ~3x rows for a breakdown that's genuinely there.
- **Most kommune cells are suppressed.** Measured 2026-11-08 against the real response: only 100
  of 357 kommuner carry a non-null `value` in the "total" (kjonn_code='0') slice, 96 each for
  boys/girls. The upstream marks a suppressed cell with `status: "."` and no numeric value —
  `parseJsonStat2` turns that into `value=NULL, status='.'`, which is correct, not a parsing bug.
  An earlier draft of this README and the manifest claimed "357 of 357 kommuner answer" based on
  a check that counted the literal string `"."` as a non-null value; that was wrong and is
  corrected here before anyone built on it.

## Known issues / TODOs

- Latest-year-only ingest, matching fhi-bor-alene's own choice.
- Named `fhi-ensomhet`, not after the upstream title, because `Ensomhet_Ungdata_KH` is not a usable
  identifier and every other FHI source in this repo is named for its subject, not its FHI title.

## References

- Upstream docs: https://github.com/folkehelseinstituttet/Fhi.Statistikk.OpenAPI
- Shared client: [`../../lib/fhi.ts`](../../lib/fhi.ts)
- Shared parser: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) (`parseJsonStat2`)
- Sibling source for the count half of T5: [`../fhi-bor-alene/README.md`](../fhi-bor-alene/README.md)
