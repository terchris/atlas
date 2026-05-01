# ssb-07459

SSB statistikkbanktabell **07459** — *Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning*.

Catalogue entry: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md).

## Run locally

```bash
npm run ingest:ssb-07459
```

Expect a longer runtime than other sources — roughly 30–60 seconds end-to-end (network-dominated fetch, plus ~420 upsert chunks of 500 rows each).

## Known quirks

- **Age stored as text.** SSB's Alder codes are three-digit strings with a `"105+"` catch-all. Preserving verbatim avoids ambiguity; dbt casts to int where needed.
- **Sex codes are digits, not letters.** SSB uses `"1"` for men and `"2"` for women — not `"M"`/`"F"` or `"M"`/`"K"`. We pass through verbatim.
- **Latest-year-only default** (like every v2-beta source so far). Historical series reachable by adding a Tid filter in `lib/pxweb.ts` when needed.
- **Large payload.** A dim-name typo (e.g. expecting `"Kjønn"` vs the actual code `"Kjonn"` without the ø) would crash the `toRow()` mapping on every cell. We check all five dimensions at the start of each mapping.

## References

- Catalogue: [`docs/research/samfunnspuls/data-sources.md`](../../../../../docs/research/samfunnspuls/data-sources.md)
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts)
