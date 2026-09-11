# brreg-enheter-alle

The **complete Enhetsregisteret** — every legal entity registered in Norway (~1.17 million) —
streamed from Brønnøysundregistrene's daily bulk export into `raw.brreg_enheter_snapshot`.

PLAN-001 phase 2. This is the bootstrap load; keeping the register current is the change feed's
job (PLAN-002).

## What the script does

1. `GET https://data.brreg.no/enhetsregisteret/api/enheter/lastned` — one gzipped, pretty-printed
   JSON array, regenerated daily. `Last-Modified` becomes `snapshot_file_date` and the ingest run's
   `upstream_updated_at`.
2. Gunzip in flight, decode UTF-8 across chunk boundaries, and frame one top-level array element at
   a time with a depth-aware scanner ([`parse.ts`](./parse.ts)).
3. `JSON.parse` each element, read `organisasjonsnummer`, keep the rest verbatim as `doc`.
4. Upsert in batches of 2,000 on `organisasjonsnummer`. **Never truncates, never deletes.**

No NDJSON output file — at this volume that is a 2 GB write per run with no reader. Use
`npm run ingest:brreg-enheter-alle -- --sample 5` to see records without touching the database.

## Measured (2026-09-11, PLAN-001 phase 1)

| | |
|---|---|
| download | 210,132,682 bytes in 52 s |
| uncompressed | 2,005,028,121 bytes — gzip ratio 9.5× |
| records | 1,173,878 — avg 1,708 bytes each |
| peak RSS | 33 MB to stream the whole 2 GB |
| storage | 1,651 bytes/row jsonb; 2,340 with a GIN index (+42%) |

## Things that are easy to get wrong

- **The file is not newline-delimited.** It is one JSON array across 2 GB. `JSON.parse` on the whole
  body, or a line-based reader, both fail — the first on memory, the second silently on framing.
- **🔴 No delimited format anywhere.** `terchris/shadow-brreg` wrote pipe-delimited CSV and ran
  `awk '{gsub(/\|/,"")}1'` over the source first, deleting every `|` in the data. Atlas has no
  delimiter in the path, and [`__tests__/parse.test.ts`](./__tests__/parse.test.ts) asserts a record
  containing a pipe, a newline and a double quote survives byte-identical. That test has been made
  to fail on purpose by reintroducing the strip; it is not decorative.
- **`organisasjonsnummer` is text, not a number.** Leading zeros are significant.
- **Counting by grep over-counts, and not by a fixed amount.** `grep -c '"organisasjonsnummer"'`
  returns 1,173,879 against 1,173,878 actual records. The extra hit is **not** a duplicated key —
  it is the literal appearing as a *value*, in one organisation's free-text `aktivitet`:

  ```
  "aktivitet" : [ "Drift av gatelys. Skal også drifte Eggum vannverk med samme", "organisasjonsnummer" ],
  ```

  So the proxy is wrong by however many times the public types that word into a registration form,
  and it can drift any morning. Fine as a 2-second smoke check, never as the load's row-count
  assertion. (Corrected 2026-09-12 after imac's colon-aware scan on urb-agents #711; this file
  previously gave the duplicated-key explanation, which was wrong.)
- **The bulk file is pretty-printed; the live API is compact.** `"organisasjonsnummer" : "810034882"`
  with spaces around the colon, against `{"organisasjonsnummer":"810034882"}`. Any string matching
  written against the API's shape silently matches **zero** in the bulk file — imac hit exactly that.
  Another reason the loader parses rather than pattern-matches.
- **The bulk file and the live API disagree by design.** 1,173,878 in the file against the API's
  1,174,098 on the same day: the churn between the file's generation and the query. PLAN-002 closes
  it; neither number is wrong.
- **Deletions cannot arrive this way.** An organisation Brreg removed since the last run stays in
  the table, because absence from a 1.17M-record file is indistinguishable from a truncated
  download. `Sletting` / `Fjernet` events come through the change feed.

## Running it

```bash
cd atlas-data/ingest
npm run migrate                              # applies 052_raw_brreg_enheter_snapshot.sql
npm run ingest:brreg-enheter-alle            # the full load; needs DATABASE_URL
npm run ingest:brreg-enheter-alle -- --sample 5   # first 5 records to stdout, no writes
```

Re-running is safe on a populated table: every batch is `INSERT … ON CONFLICT
(organisasjonsnummer) DO UPDATE`, so a second run replaces rows in place and an interrupted run
leaves a register that is partially fresh rather than partially empty.

## Validation

`select count(*) from raw.brreg_enheter_snapshot` should equal the `totalElements` reported by
`https://data.brreg.no/enhetsregisteret/api/enheter?size=1` on the same day, ± that day's churn.
