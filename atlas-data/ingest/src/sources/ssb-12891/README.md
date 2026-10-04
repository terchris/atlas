# ssb-12891

Ingestion module for SSB statistikkbanktabell **12891** — *Etternavn brukt av 200 personer eller flere* (surnames used by 200 persons or more, per year).

Companion to [`ssb-10501`](../ssb-10501/) (first names), added for the same name-scrubbing use case: identifying Norwegian surnames inside freely scraped text. See `manifest.yml` for the strategic/catalogue fields; this README covers implementation-level notes.

## What the script does

Fetches the full response from SSB's PxWebAPI v2 with every dimension explicitly selected, parses the JSON-stat2 payload via the shared `lib/pxweb.ts` client, flattens it into one row per (surname, year) cell, writes NDJSON to `output/ssb-12891.ndjson`, and upserts into `raw.ssb_12891` when `DATABASE_URL` is set.

## Known quirks and gotchas

### This table is NOT an exhaustive list of Norwegian surnames

Same caveat as `ssb-10501`, and the same reason it matters for this source's actual use: SSB's table title says it plainly — surnames used by **200 persons or more**. A surname held by fewer than 200 people in Norway never appears as a row. Per the public background on this table (SSB's naming-law article on surnames): this threshold exists because Norwegian naming law protects surnames held by 200 or fewer people from being freely adopted by others — so the 200-person floor here is not an arbitrary disclosure-avoidance cutoff, it is the exact legal threshold the statistic itself is built around.

**For the name-scrubbing use case**: this list will catch common Norwegian surnames and will not catch rarer ones — including many protected (sub-200) surnames and most non-Norwegian surnames.

### The server silently returns a WRONG SUBSET when dimensions aren't explicitly filtered

Same defect shape as `ssb-10501`, independently confirmed for this table: an unfiltered `GET /tables/12891/data?lang=no&outputFormat=json-stat2` call returns `size: [911, 1, 8]` — **911 of 3,706 Etternavn codes**, roughly a quarter of the full list, with no error or warning of any kind. This module always passes `filters: { Etternavn: "*", ContentsCode: "*", Tid: "*" }` explicitly. **Do not remove the filters without verifying the resulting row count against SSB's own metadata dimension sizes first.**

### No gender prefix

Unlike `ssb-10501`'s `Fornavn` codes, `Etternavn` codes carry no leading digit — surnames aren't gendered in this table. `name_code` is simply the uppercased surname (e.g. `ABBAS`); `name_label` is the properly-cased label (e.g. `Abbas`), stored verbatim rather than reconstructed.

### `ContentsCode` is a degenerate single-value dimension

Same as `ssb-10501` — SSB exposes exactly one statistic (`Personer`). Carried through for shape-consistency with every other SSB PxWebAPI source.

### Shorter time series than ssb-10501

Years available: 2018–2025 (8 years), against `ssb-10501`'s 2013–2025 (13 years). Not an ingest defect — SSB simply started publishing this particular table later.

## Known issues / TODOs

- No sub-national breakdown — nationwide only (`tags.geo: national`); SSB does not publish this at kommune or fylke resolution.

## References

- Statistikkside: https://www.ssb.no/navn
- Background on the 200-person threshold and naming law: https://www.ssb.no/befolkning/navn/statistikk/navn/artikler/etternavn
- Table: https://www.ssb.no/statbank/table/12891
- Companion first-name table: [`../ssb-10501/`](../ssb-10501/) — same shape, used together for the name-scrubbing use case
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) — the PxWebAPI v2 client and JSON-stat2 parser used here
