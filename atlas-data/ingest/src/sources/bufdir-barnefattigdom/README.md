# bufdir-barnefattigdom

Bufdir **Barnefattigdom kommunemonitor** — annual child-poverty-related indicators from the official **bulk ZIP** export (one monitor page request to discover the ZIP URL, one request to download ~20+ `Indikator_*.xlsx` workbooks).

## What the script does

1. `GET` [`https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/`](https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/) and parse the embedded Strapi media link whose path matches `…/uploads/YYYYMMDD_barnefattigdom_monitor_<hash>.zip`.
2. Download that ZIP (`Last-Modified` is recorded as ingest-run `upstream_updated_at` when present).
3. In memory, unzip and process every **`Indikator_*.xlsx`** (sheet **`Data`**) — header columns `Region`, `Regionnavn`, `Enhet`, `Tallformat`, then year columns; **`..`** and blanks become `NULL` in Postgres / JSON.
4. **Replace** `raw.bufdir_barnefattigdom` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`) so surrogate ids stay consistent with workbook filenames.
5. Mirror rows to `atlas-data/ingest/output/bufdir-barnefattigdom.ndjson`.

`indicator_api_id` is **`bf_zip_` + first 24 hex chars of SHA-256(filename stem)** — the XLSX files do not expose Strapi's old hex ids, so this id is stable across runs for a given workbook name inside the ZIP.

## Known quirks / fragility

- **Discovery regex is multi-tier** with progressive fallback (`canonical` → `loose-date-format` → `loose-monitor` → `loose-bare`); the matched tier is logged on each run and a `zip.discovery.fallback_tier` warn fires if anything other than `canonical` matches. See [`parse.ts`](./parse.ts) `discoverZipUrl`. Survives most upstream rearrangements (filename pattern, hostname, path) but a wholesale page restructure still throws.
- **Decimals**: `prosent` cells arrive as Norwegian strings (`9,2` with spaces); the parser normalises before casting.
- **Oslo bydel** rows can appear with longer `region_code` values; the dbt model still maps only **4-digit** codes to `kommune_nr` (see new-sources INVESTIGATE Q3).
- **Indikator_10 is absent from the bundle.** The numbering Bufdir publishes goes `1, 2, 3, 4, 5, 6, 7, 8, 9a, 9b, 11, …, 22` — likely either retired by Bufdir or split into the `9a` / `9b` innvandrerbakgrunn pair. Not a parser gap; not something we filter out. Don't waste time looking for it.
- **Surrogate `indicator_api_id`** is `bf_zip_<24 hex of SHA-256(filename stem)>`. If Bufdir renames a workbook (e.g. `Indikator_5b_X` → `Indikator_5_X`), every downstream row's id changes — consumers see a "new" indicator and the old one disappears. Open follow-up: investigate a more stable identity or add an alias table.

## Status — handoff for a wiped Postgres cluster

Atlas **resetting the Postgres cluster wipes all schemas**. This source needs no code changes to come back online; rerun the pipeline in order:

1. **Migrations** (creates `raw.bufdir_barnefattigdom` and refreshes column comments):
   - `atlas-data/migrations/048_raw_bufdir_barnefattigdom.sql` — table + original comments.
   - `atlas-data/migrations/049_bufdir_barnefattigdom_zip_comments.sql` — comment text aligned with ZIP/XLSX ingest (run after 048).

   From repo root / ingest env: `npm run migrate` under `atlas-data/ingest/` (reads `DATABASE_URL`; see `website/docs/contributors/setup.md`).

2. **Ingest** (fills `raw.bufdir_barnefattigdom` — full table replace each run):
   - `cd atlas-data/ingest && npm run ingest:bufdir-barnefattigdom`  
   Requires network; `DATABASE_URL` set like other raw sources.

3. **dbt downstream** (`marts.indicators__bufdir_barnefattigdom`, seeds, catalogue):
   - `cd atlas-data/dbt && uv run --env-file ../ingest/.env dbt seed` (if rebuilding catalogue seeds).
   - `uv run --env-file ../ingest/.env dbt run -s indicators__bufdir_barnefattigdom …` per your mart scope.

4. **Contributor gates** (before PR / after substantive doc changes):  
   `npm run typecheck` in ingest; `dbt parse`; `./check-osmosis.sh` in `atlas-data/dbt/` (`check-osmosis` needs a working DB introspection).

**Implementation snapshot (frozen at last edit):**

- **Ingest** is ZIP-only (`index.ts`); no Strapi/APIM loops. NPM deps used here: **`adm-zip`**, **`xlsx`** (see `ingest/package.json`).
- **`indicator_api_id`** is surrogate `bf_zip_*` (SHA-256 of workbook stem), not Bufdir Strapi ids — any workflow that depended on legacy hex ids must use **`contents_code`** / **`indicator_slug`** instead.
- **Breaking change vs first merge:** first deploy on empty DB loads only ZIP semantics; mart shape is unchanged, keys are surrogate.

## References

- Monitor + download link: https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
