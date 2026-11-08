# kartverket-postnummeromrade

Kartverket's **Postnummerområder** (postcode-area polygons), via Geonorge. urb-agents #2098/#2099
(R3). Atlas's first real PostGIS source — PostGIS 3.6.2 was already installed on the production
cluster (migration 069) but genuinely unused until this one.

## Finding the actual download, not guessing a URL

Geonorge publishes no single documented "the postcode areas file" URL. Discovered end to end by
calling the real API: `kartkatalog.geonorge.no/api/search` to find the dataset's metadata UUID,
`nedlasting.geonorge.no/api/capabilities/<uuid>` + `.../codelists/{format,projection,area}/<uuid>`
to see what's offered (GeoJSON at EPSG:4258, the whole country as area code `0000`
"landsdekkende"), then `POST nedlasting.geonorge.no/api/order` to place an order. For this
dataset the order comes back synchronously (`status: "ReadyForDownload"`, no email wait) with a
one-time ZIP download URL.

## What the script does

Places the order, downloads the ZIP, extracts the one `.geojson` file inside, and upserts into
`raw.kartverket_postnummeromrade` — one row per upstream GeoJSON feature, with the geometry stored
as a real PostGIS `geometry(Polygon, 4258)` column via `ST_GeomFromGeoJSON`.

## Known quirks

- **The file is not one FeatureCollection — it's two, under namespaced keys.** First attempt
  assumed exactly one top-level key and broke immediately: the ZIP actually contains
  `postnummeromrader.postnummeromrade` (the areas, what this ingest wants) AND
  `postnummeromrader.postnummeromradegrense` (the boundary *lines* between areas, a separate
  layer). Selected by matching the key suffix, not by assuming there's only one.
- **A postnummer can be more than one row.** 57 of 3,382 postnummer (measured 2026-11-08) have
  disjoint polygon pieces — each upstream feature is its own row here; the per-postnummer union
  (`ST_Union`) happens in dbt (`dim_kartverket_postnummeromrade`), not in this ingest.
- **No genuine multi-kommune postnummer found**, despite the request's own field list anticipating
  one ("kommunenummer — every municipality the area touches"). Checked directly: every one of the
  57 split postnummer stayed within a single kommune across all its pieces. Modelled as an array
  downstream anyway, per the spec's own anticipated shape.
- **Every geometry measured 2026-11-08 was a Polygon, never a MultiPolygon.** The raw table's
  column type and this ingest's own validation both assume Polygon; a MultiPolygon feature would
  be a loud error here, not a silent cast.

## References

- Geonorge dataset: `462a5297-33ef-438a-82a5-07fff5799be3` (Postnummerområder)
- Simplification method (50m tolerance, why it needs a projected CRS): see
  `atlas-data/dbt/models/dimensions/dim_kartverket_postnummeromrade.sql`'s own header.
