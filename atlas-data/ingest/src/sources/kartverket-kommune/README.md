# kartverket-kommune

Kartverket's **current municipality boundaries**, via Geonorge. urb-agents #2098/#2099 (R4).
Sibling to `kartverket-postnummeromrade` (R3) — same order-based download API, now factored into
a shared helper (`atlas-data/ingest/src/lib/geonorge.ts`).

## What the script does

Places a Geonorge order for the whole country in GeoJSON/EPSG:4258, downloads the ZIP, extracts
the one `.geojson` file, filters to `objtype='Kommune'` (the file also carries 27,380 boundary-LINE
features under `objtype='Grense'` — a different layer, discarded), and upserts into
`raw.kartverket_kommune` with the geometry as a real PostGIS column.

## Known quirks

- **The file has a UTF-8 BOM.** `Buffer#toString('utf8')` does not strip it; a leading U+FEFF is
  stripped explicitly before `JSON.parse`, or the parse throws. `kartverket-postnummeromrade`'s
  file did not have one — not a shared assumption across every Geonorge GeoJSON export.
- **One array mixes two feature types.** `objtype='Kommune'` (357, what this ingest wants) and
  `objtype='Grense'` (27,380, boundary lines) are both in the same top-level `features` array —
  unlike `kartverket-postnummeromrade`, which splits them into two separate top-level keys instead.
  Two different Kartverket products, two different ways of mixing in the layer you don't want.
- **`kommunenavn` is NOT the primary/rekkefolge=1 name — it's already combined.** For a kommune
  with more than one official name (22 of 357, measured 2026-11-08), Kartverket's own
  `kommunenavn` field is already the hyphenated combination (e.g. `"Loabák - Lavangen"`), in
  rekkefolge order — and rekkefolge is not always Norwegian-first (kommune 5518's rekkefolge=1 is
  Loabák, Sami). Caught by actually reading a multi-name feature's values side by side before
  writing the column comment, not by assuming the field meant what its name suggested.
- **Every whole-country pull returns current units only.** `gyldigTil` was null on all 357
  features measured 2026-11-08 — this table has no retired-kommune history. `dim_kommune` (built
  from SSB Klass) is the one with history; this one is current-state geometry only.

## References

- Geonorge dataset: `041f1e6e-bdbc-4091-b48f-8a5990f3cc5b` (Administrative enheter kommuner)
- Shared order/download helper: [`../../lib/geonorge.ts`](../../lib/geonorge.ts)
- Simplification method: see `atlas-data/dbt/models/dimensions/dim_kartverket_kommune.sql`'s header
