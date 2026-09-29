---
title: Map boundaries
description: Simplified kommune boundaries, keyed to join straight onto dim_kommune.
---

# Map boundaries

Atlas publishes a **simplified** kommune boundary file so you can draw a map without
finding, projecting and key-matching geometry yourself.

```
https://atlas.sovereignsky.no/geo/kommuner.geojson
```

| | |
|---|---|
| format | GeoJSON `FeatureCollection`, EPSG:4326 (WGS 84 lon/lat) |
| features | 357 — every active, non-sentinel kommune in `dim_kommune` |
| size | ~1.7 MB |
| join key | `properties.kommune_nr` — the same zero-padded text as `api_v1.dim_kommune.kommune_nr` |
| also carries | `properties.kommune_name`, `properties.fylke_nr` |
| source | Kartverket / Geonorge, open data |

## 🔴 It is not what Kartverket published

The boundaries are simplified with Douglas–Peucker to a tolerance of **0.0003°, about 33 m**,
which keeps **8.5%** of the original points — 997,962 down to 84,521. That is what turns 38.6 MB
into 1.7 MB.

**Fit for:** a choropleth or a locator map at national or county scale.

⚠️ **Not fit for:** area calculation, cadastral work, or deciding which side of a border a point
falls on. Near a boundary the simplified line can be tens of metres from the real one, and small
islands may be dropped entirely.

🔵 **The authoritative geometry is Kartverket's**, at
[Administrative enheter kommuner](https://kartkatalog.geonorge.no/metadata/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b).
If the position of a boundary matters to your answer, use that, not this.

The file states all of this in its own `atlas` block, so it travels with the data rather than
living only on this page.

## Why it is a file and not an endpoint

Full-resolution boundaries are about 38 MB. Serving them through the API would be worse than not
having them at all. The file is static, cacheable and downloaded once.

## Drawing a map

`kommune_nr` needs no cleanup on either side — that is the whole point of taking the kommune list
from `dim_kommune` when the file is built.

```js
const [geo, rows] = await Promise.all([
  fetch('https://atlas.sovereignsky.no/geo/kommuner.geojson').then(r => r.json()),
  fetch('https://api-atlas.urbalurba.com/coverage_gap_barnefattigdom?select=kommune_nr,value_pct')
    .then(r => r.json()),
]);

const byKommune = new Map(rows.map(r => [r.kommune_nr, r.value_pct]));
for (const f of geo.features) {
  f.properties.value = byKommune.get(f.properties.kommune_nr) ?? null;
}
// -> hand `geo` to Leaflet, MapLibre, D3, deck.gl …
```

⚠️ A `null` here means the API had no row for that kommune, which is usually **suppression, not
zero** — see `indicator_missing_kommuner`. Colour those differently from a real low value rather
than filling them as 0.

## Attribution

> Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Kartverket.

## Refreshing it

Kommune boundaries change when municipalities merge, which is rare and known in advance.

```
cd website && node scripts/generate-kommune-geometry.mjs
```

It reads the active kommune list from Atlas's own `dim_kommune`, then fetches each boundary from
Kartverket. 🔴 If Kartverket cannot serve a kommune that `dim_kommune` lists, the script **fails
and writes nothing** — a map with silent holes is worse than no map.
