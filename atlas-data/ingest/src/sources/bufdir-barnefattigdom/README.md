# bufdir-barnefattigdom

Bufdir **Barnefattigdom kommunemonitor** — annual child-poverty-related indicators at kommune resolution (and other geographic codes returned by the same API).

## What the script does

The script reads the monitor definition from Strapi (`https://statistikk.bufdir.no/api/…`), lists every published indicator for the Barnefattigdom monitor, builds the active 4-digit kommune code list from SSB Klass classification 131, then calls Bufdir's Azure APIM **indicator-data** endpoints to fetch overview keys and full time series (`detailsmultiple`) for each indicator × kommune × category tuple. Rows land in `raw.bufdir_barnefattigdom` and a local NDJSON snapshot under `atlas-data/ingest/output/`.

## Known quirks

The public Next.js bundle on `www.bufdir.no` shows that the browser calls Strapi at `statistikk.bufdir.no/api` for catalogue metadata and the **monitorApiUrl** from that payload for numeric series. The `data.bufdir.no` site is a separate CMS-backed dataset catalogue and does not list this monitor; treating Strapi plus APIM as the machine-readable surface matches how the official site loads.

The **overview** endpoint returns one object per request with a `regions` map whose keys are the subset of requested `regionCode` values that have data for that indicator. The script only runs **detailsmultiple** on those keys, which avoids hammering the API with empty kommune rows for indicators that do not exist at kommune level.

Bufdir's short description states that bydel and delbydel figures exist for Oslo and other cities. This ingest pass is driven by the Klass kommune list, so it primarily loads **4-digit kommune** cells. Rows with longer `region_code` values can still appear if the overview ever returns them for a batch; the dbt model maps 4-digit codes to `kommune_nr` and keeps longer codes in `region_code` only.

Category tuples (`barn`/`husholdning` × `prosent`/`antall`) mirror the **ChildPoverty** branch in Bufdir's own client code, not an ad hoc Atlas invention.

## Known issues / TODOs

Oslo **bydel** codes from this API are not yet aligned to Klass 103 or Atlas's FHI 6-digit `GEO` convention (see INVESTIGATE-new-norwegian-public-sources Q3). Until a vetted crosswalk exists, the mart does not emit `bydel_code` / `bydel_name` and does not add `relationships` tests on those columns.

## References

- Human monitor page: https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/
- Strapi API (metadata): https://statistikk.bufdir.no/api/monitors
- SSB Klass 131 (kommune codes): https://data.ssb.no/api/klass/v1/classifications/131
- Shared helpers: `atlas-data/ingest/src/lib/klass.ts`, `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
