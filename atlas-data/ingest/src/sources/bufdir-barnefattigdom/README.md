# bufdir-barnefattigdom

Bufdir **Barnefattigdom kommunemonitor** — annual child-poverty-related indicators from the official **bulk ZIP** export (one monitor page request to discover the ZIP URL, one request to download ~20+ `Indikator_*.xlsx` workbooks).

## What the script does

1. `GET` [`https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/`](https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/) and parse the embedded Strapi media link whose path matches `…/uploads/YYYYMMDD_barnefattigdom_monitor_<hash>.zip`.
2. Download that ZIP (`Last-Modified` is recorded as ingest-run `upstream_updated_at` when present).
3. In memory, unzip and process every **`Indikator_*.xlsx`** (sheet **`Data`**) — header columns `Region`, `Regionnavn`, `Enhet`, `Tallformat`, then year columns; **`..`** and blanks become `NULL` in Postgres / JSON.
4. **Replace** `raw.bufdir_barnefattigdom` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`) so surrogate ids stay consistent with workbook filenames.
5. Mirror rows to `atlas-data/ingest/output/bufdir-barnefattigdom.ndjson`.

`indicator_api_id` is **`bf_zip_ind_<N>`** derived from the leading `Indikator_<N>` portion of each workbook's filename (e.g. `bf_zip_ind_5`, `bf_zip_ind_9a`, `bf_zip_ind_22`). Survives the most common upstream changes — slug refinements, year-suffix additions, methodology footnote rewrites — that don't renumber the indicator. For genuine renumbering events (the observed `Indikator 9` → `9a/9b` split; `Indikator 10` retired without successor), join on **`api_v1.bufdir_indicator_alias`** to bridge `historical_id` → `canonical_id`. Defensive fallback: filenames not matching `Indikator_<N>` produce `bf_zip_<24-hex SHA-256(stem)>` and the parser logs a warn so the operator notices. See [`parse.ts`](./parse.ts) `surrogateIndicatorApiId`.

## Known quirks / fragility

- **Discovery regex is multi-tier** with progressive fallback (`canonical` → `loose-date-format` → `loose-monitor` → `loose-bare`); the matched tier is logged on each run and a `zip.discovery.fallback_tier` warn fires if anything other than `canonical` matches. See [`parse.ts`](./parse.ts) `discoverZipUrl`. Survives most upstream rearrangements (filename pattern, hostname, path) but a wholesale page restructure still throws.
- **Decimals**: `prosent` cells arrive as Norwegian strings (`9,2` with spaces); the parser normalises before casting.
- **Oslo bydel** rows can appear with longer `region_code` values; the dbt model still maps only **4-digit** codes to `kommune_nr` (see new-sources INVESTIGATE Q3).
- **Indikator_10 is absent from the bundle.** The numbering Bufdir publishes goes `1, 2, 3, 4, 5, 6, 7, 8, 9a, 9b, 11, …, 22` — likely either retired by Bufdir or split into the `9a` / `9b` innvandrerbakgrunn pair. Not a parser gap; not something we filter out. Don't waste time looking for it.
- **Indicator id continuity** across renumbering events (e.g. the observed `Indikator 9` → `9a/9b` split, `Indikator 10` retirement) is handled by the `marts.bufdir_indicator_alias` table (auto-wrapped as `api_v1.bufdir_indicator_alias`). Consumers tracking a series across releases join on it explicitly. Maintenance: every new bundle release should diff filenames against `_sources_dimensions.csv` + the alias seed at [`atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv`](../../../../dbt/seeds/sources/bufdir_indicator_alias.csv) — see "Refresh checklist" below.

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
- **`indicator_api_id`** is surrogate `bf_zip_ind_<N>` (number-prefix from filename), not Bufdir Strapi ids — any workflow that depended on legacy ids must use **`contents_code`** / **`indicator_slug`** plus `api_v1.bufdir_indicator_alias` for cross-release continuity.
- **Breaking change vs first merge:** first deploy on empty DB loads only ZIP semantics; mart shape is unchanged, keys are surrogate.

## Refresh checklist — when Bufdir publishes a new bundle release

The ingest is fully automatic (one HTTP probe, one ZIP download, no manual steps), but the alias seed at `atlas-data/dbt/seeds/sources/bufdir_indicator_alias.csv` needs manual review whenever Bufdir updates the bundle. Renumbering events are rare but real (the observed `9 → 9a/9b` and `10 → retired` history is what the seed exists to record).

When a new bundle release is detected (`upstream_updated_at` advances on the next ingest run):

1. **Diff the filename set against the prior release.** From the new ZIP's `unzip -l` output, list `Indikator_<N>` codes and compare against the codes already present in the previous run's ingest (or in `marts.indicators__bufdir_barnefattigdom`'s distinct `indicator_api_id`).
2. **For each renumbering event** (a code disappears + a new one appears, or a code splits into multiple new ones): add a row to `bufdir_indicator_alias.csv` mapping the historical id to the canonical successor (or NULL when retired without successor). Include a one-sentence editorial note in the `note` column.
3. **Re-run** `dbt seed --select bufdir_indicator_alias && dbt run --select mart_bufdir_indicator_alias && ./apply-api-v1.sh` so consumers see the new mapping.
4. **No code changes needed for the parser** — the `bf_zip_ind_<N>` id derivation handles new codes automatically; the alias seed is purely for cross-release continuity.

Speculative pre-population is wasted maintenance; only add rows when an event is observed.

## References

- Monitor + download link: https://www.bufdir.no/statistikk-og-analyse/monitor/barnefattigdom/
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Surrogate-id design: [`PLAN-bufdir-surrogate-id-migration.md`](../../../../../website/docs/ai-developer/plans/completed/PLAN-bufdir-surrogate-id-migration.md), [`INVESTIGATE-bufdir-indicator-surrogate-id-stability.md`](../../../../../website/docs/ai-developer/plans/backlog/INVESTIGATE-bufdir-indicator-surrogate-id-stability.md)
