# kartverket-matrikkel-adresse

Kartverket's **national address file** (Matrikkelen — Adresse), via Geonorge. urb-agents #2098/#2099
(R5). Same order-based download API as the other `kartverket-*` sources, CSV format instead of
GeoJSON — this dataset has no geometry layer to extract.

## What the script does

Places a Geonorge order for the whole country in CSV/EPSG:4258, downloads the ZIP (~152 MB), opens
the single CSV entry with `yauzl` as a true Readable (not buffered into one Buffer/string the way
`adm-zip` does for the other `kartverket-*` sources), reads it line by line, and upserts every row
into `raw.kartverket_matrikkel_adresse` as a verbatim jsonb `doc`, keyed by `adresseId`.

## Known quirks

- **Streamed, not buffered — deliberately, unlike every sibling source.** The CSV decompresses to
  ~812 MB. `kartverket-kommune`/`-fylke`/`-postnummeromrade` all use `adm-zip`'s
  `getData().toString("utf8")`, which is fine at their tens-of-MB scale but risks V8's
  string-length ceiling at this one's. `yauzl`'s `openReadStreamPromise` inflates the entry on
  demand; nothing here ever holds the whole decompressed CSV in memory at once. Same class of risk
  `brreg-enheter-alle`'s own header calls "a requirement, not a preference" for its 2 GB feed.
- **A UTF-8 BOM on the header's first field** (`lokalid`), same as some of the GeoJSON exports.
  Stripped explicitly before splitting the line.
- **46 columns; this request's field list uses a dozen.** The other ~34 (access-route ids and
  coordinates, uuids, extraction timestamps) are access-route metadata nothing here touches — kept
  verbatim in `doc`, same reasoning as `raw.brreg_enheter_snapshot`.
- **No quoting in the CSV.** Every row measured 2026-11-08 splits cleanly into exactly 46 fields on
  a bare `split(";")` — no field contains a literal semicolon. The parser throws if a row's field
  count ever disagrees with the header's, rather than silently misaligning columns.
- **`adresseId` and `lokalid` are the same value.** Confirmed byte-identical across a 100,000-row
  sample, 2026-11-08. `adresseId` is used as the primary key because it is the name the request's
  own field list gives.
- **`Nord`/`Øst` are latitude/longitude in EPSG:4258, not a projected northing/easting.** Norway
  spans ~58-71°N, which is what `Nord`'s values look like. `ST_MakePoint` takes (x, y) =
  (longitude, latitude), so the dbt model's arguments are `(øst, nord)`, not the upstream column
  order.
- **`oppdateringsdato`'s fractional seconds vary in width** — absent, 2, 3 or 6 digits, all measured
  2026-11-08. `to_timestamp(..., 'DD.MM.YYYY HH24:MI:SS')` stops consuming once its format is
  satisfied and silently drops whatever follows; verified directly against all four shapes rather
  than assumed.
- **Two address types, both carrying gardsnummer/bruksnummer.** `vegadresse` (2,570,525 rows) and
  `matrikkeladresse` (34,411 rows), measured 2026-11-08. `gardsnummer`/`bruksnummer` are populated
  on both — not matrikkeladresse-exclusive, which the request's own lookup pattern (c) relies on.

## Served as indexed point lookups, not a bulk file

The request asks explicitly which: "an index for each, or a bulk file atlas-scraper matches
locally, as it does today." Served as PostgREST point lookups, backed by two composite btree
indexes on `dim_kartverket_matrikkel_adresse` — see that model's own header. A bulk file for 2.6M
rows is exactly the shape the request's own three lookup patterns don't need: a consumer wants one
address, not all of them.

## References

- Geonorge dataset: `f7df7a18-b30f-4745-bd64-d0863812350c` (Matrikkelen - Adresse)
- Shared order/download helper: [`../../lib/geonorge.ts`](../../lib/geonorge.ts)
