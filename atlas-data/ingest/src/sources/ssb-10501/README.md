# ssb-10501

Ingestion module for SSB statistikkbanktabell **10501** — *Personer, etter jente- eller guttenavn* (persons by first name, per year).

Added for a name-scrubbing use case: identifying Norwegian first names inside freely scraped text. See `manifest.yml` for the strategic/catalogue fields; this README covers implementation-level notes.

## What the script does

Fetches the full response from SSB's PxWebAPI v2 with every dimension explicitly selected, parses the JSON-stat2 payload via the shared `lib/pxweb.ts` client, flattens it into one row per (name, year) cell, writes NDJSON to `output/ssb-10501.ndjson`, and upserts into `raw.ssb_10501` when `DATABASE_URL` is set.

## Known quirks and gotchas

### This table is NOT an exhaustive list of Norwegian first names

SSB's own table note: *"Tabellen har tall over fornavn som er brukt av 200 personer eller flere ved utgangen av året"* — the table only includes first names used by 200 persons or more at year-end. A name held by fewer than 200 people in Norway never appears as a row, in any year.

**This is the most important fact about this source for any downstream use.** For the name-scrubbing use case this module was added for: this list will catch common Norwegian first names and will not catch rare ones (many immigrant names, unusual spellings, less common traditional names). It is a useful floor, not a ceiling.

Within the 2,152 names that do appear, suppression is still per-year: a name can clear the 200-person threshold in some years and drop below it in others. Measured on a full pull (2026-10-04): 3,799 of 27,976 cells (13.6%) are suppressed (`value: null`, `status: "."`) — mostly early/late years for names whose popularity crossed the threshold, not a parsing artefact.

### The server silently returns a WRONG SUBSET when dimensions aren't explicitly filtered

Measured directly, twice, against the live v2 endpoint: `GET /tables/10501/data?lang=no&outputFormat=json-stat2` with **no filters at all** — the same call shape `ssb-08764/index.ts` uses — returns `size: [1134, 1, 13]`, i.e. **only the 1,134 girl-name codes, silently omitting all 1,018 boy names.** The request succeeds (200, valid JSON-stat2, a plausible-looking row count) with no error of any kind; nothing distinguishes it from a correct response except the row count being half of what it should be.

This module always passes `filters: { Fornavn: "*", ContentsCode: "*", Tid: "*" }` explicitly for exactly this reason. **Do not remove the filters as a "simplification" — verify the resulting row count against SSB's own metadata dimension sizes (`size` in `/tables/10501/metadata`) first.**

### The name code embeds gender as a leading digit; the label does not

SSB's `Fornavn` codes are a leading digit (`1` = girl name, `2` = boy name) followed by the uppercased name, e.g. `1ABIGAIL`. The paired label is properly cased with no prefix, e.g. `Abigail`. Both are stored verbatim in `raw.ssb_10501` (`name_code`, `name_label`) — the dbt layer derives `sex` from the code's leading character and uses the label as the display name, rather than reconstructing the label from the code (casing and diacritics in the label aren't always a mechanical transform of the all-caps code).

### 8 names are genuinely unisex — `(first_name, year)` alone is not unique

Measured on the first real build of `indicators__ssb_10501`: **Alaa, Inge, Isa, Kim, Marian, Nikola, Thanh, X** each appear as both a girl name and a boy name — SSB assigns each sex its own composite code (e.g. `1KIM` and `2KIM`) but the two share the same label (`Kim`). The dbt model's uniqueness test is keyed on `(source_id, first_name, sex, year, contents_code)` — `sex` is part of the natural key here, not metadata layered on top of it.

### `ContentsCode` is a degenerate single-value dimension

SSB exposes exactly one statistic for this table (`Personer`). Carried through to `raw.ssb_10501.contents_code`/`contents_label` anyway, for shape-consistency with every other SSB PxWebAPI source in this repo — a reader who already knows the `region_code, year, contents_code, contents_label, value, status` shape from any other `ssb-*` source does not have to learn a special case for this one.

## Known issues / TODOs

- No sub-national breakdown of any kind exists in this table — it is nationwide only (`tags.geo: national`). There is nothing to add here; SSB does not publish this at kommune or fylke resolution.
- Hyphenated names are excluded from the series for 2021–2024 specifically (per SSB's own table note: counted together with the name before the hyphen in that window). Not handled specially here — the raw table simply reflects whatever SSB's `Fornavn` dimension lists for each year, which is the correct behaviour for a verbatim raw layer.

## References

- Statistikkside: https://www.ssb.no/navn
- Definisjoner og forklaringer: https://www.ssb.no/navn#om-statistikken
- Table: https://www.ssb.no/statbank/table/10501
- Companion surname table: [`../ssb-12891/`](../ssb-12891/) — same shape, same 200+ coverage caveat, used together for the name-scrubbing use case
- Shared client: [`../../lib/pxweb.ts`](../../lib/pxweb.ts) — the PxWebAPI v2 client and JSON-stat2 parser used here
- Template this module was adapted from: [`../ssb-08764/`](../ssb-08764/)
