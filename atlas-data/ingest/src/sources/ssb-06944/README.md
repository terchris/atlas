# ssb-06944

SSB statistikkbanktabell **06944** — *Inntekt for husholdninger, etter husholdningstype*. Median household income, income-tax, and household count per region × household type × year.

The first **economy** source in Atlas.

## What the script does

Fetches the PxWebAPI v2 default response (latest year, all regions, all household types, all content codes), unflattens, upserts to `raw.ssb_06944`.

## Known quirks

- **Includes bydeler (delområder).** Region codes like `030101` (6-digit Gamle Oslo) appear alongside 4-digit kommune codes. Our indicator model filters to `^[0-9]{4}$` for `kommune_nr`.
- **Household types need lookup.** `0000`..`0004` codes aren't self-documenting. The `ContentsLabel` column carries human labels from SSB; UI should prefer those.
- **Values in NOK** (not thousands). Oslo's `SamletInntekt` for all-households will be something like 598 000 (kr), not 598 (thousand kr).

## Known issues / TODOs

- Latest-year-only by default. Historical comparison view would need an explicit Tid filter.
- `household_type` codes not semantically mapped in the indicator model yet. When we need a UI showing "alle husholdninger vs. enslige vs. par med barn etc." the dbt layer will decode the codes.

## References

- Catalogue: to be added to the appropriate top-level `data-sources.md` entry under SSB statbank sources.
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
