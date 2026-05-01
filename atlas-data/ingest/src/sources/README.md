# Sources

One folder per upstream data source. Each folder is a self-contained unit: the code, a README, and any ancillary files the source needs (test fixtures, custom schema mappings, etc.).

## Conventions

- **One folder per source.** Folder name = source id (matches the id in `docs/research/samfunnspuls/data-sources.md`).
- **Entry point is `index.ts`.** Exports `SOURCE_ID`, `run()`, and any types callers need.
- **README.md alongside the code.** Implementation notes, observed quirks, known issues. Strategic/catalogue-level metadata stays in `docs/research/samfunnspuls/data-sources.md`, not duplicated here.
- **manifest.yml alongside the code.** Catalogue-level metadata about the source (publisher, license, periodicity, tags). See [manifest.yml schema](#manifestyml-schema) below.
- **npm script per source**: `"ingest:<id>": "tsx src/sources/<id>/index.ts"` in [`../../package.json`](../../package.json).
- **`run()` wraps work in `recordIngestRun()`**. The wrapper inserts a row into `raw.ingest_runs` (start), executes the work, and updates the row with `rows_parsed` / `upstream_updated_at` / `exit_code` (finish). Source modules do NOT call `closeSql()` themselves — the wrapper owns sql lifecycle.

### manifest.yml schema

Every source folder ships a `manifest.yml` that drives the catalogue's `marts._sources_manifest` seed (PLAN-007 phase 2). After bootstrap, the file is human-authored — ingest runs do NOT modify it.

**Required top-level fields:**

| Field | Description |
|---|---|
| `source_id` | Folder name; primary key (e.g. `ssb-08764`). |
| `upstream_id` | The upstream's own identifier (SSB table number, FHI dataset slug, etc.). |
| `upstream_url` | Canonical link to the source on the upstream's site. |
| `upstream_title` | The source's authoritative title at the upstream (usually Norwegian). |
| `description` | One paragraph for the customer-facing catalogue. |
| `publisher` | Institution that publishes the data (often equals provider). |
| `license` | License token. Default `NLOD` for Norwegian public-sector sources. |
| `license_url` | URL to the license terms. |
| `periodicity` | ISO 8601 — `P1Y` annual, `P3M` quarterly, `P1M` monthly, `P1D` daily, or `irregular`. |

**Required `tags:` namespaces** (exactly one value per namespace):

| Namespace | Allowed values |
|---|---|
| `provider` | `ssb` / `fhi` / `redcross` / `brreg` |
| `topic` | `demographics` / `income` / `education` / `health` / `social` / `ngo-supply` / `reference` |
| `geo` | `kommune` / `fylke` / `national` / `bydel` |
| `cadence` | `annual` / `quarterly` / `monthly` / `irregular` / `one-shot` |

**Authoring workflow** (see [`contributors/ingest-modules.md`](../../../../website/docs/contributors/ingest-modules.md) for the full walkthrough):

1. `npm run sources:bootstrap-manifest -- <source_id>` — fetches upstream metadata + writes a skeleton.
2. `npm run sources:fill-manifest-todos` — auto-fills description + tags from this source's README.
3. Review the generated YAML; spot-check `tags.topic` (regex first-match-wins).
4. Commit alongside the source code.

After commit, future field changes happen via PR like any other code change. The seed CSV at `atlas-data/dbt/seeds/sources/_sources_manifest.csv` (and the `Implemented sources` table below) regenerate from these YAMLs via `uv run python atlas-data/dbt/scripts/build_sources_seed.py --readme`.

## Implemented sources

The table below is auto-generated from each source's `manifest.yml`. To regenerate after editing a manifest, run from the repo root:

```bash
uv run --directory atlas-data/dbt python scripts/build_sources_seed.py --readme atlas-data/ingest/src/sources/README.md
```

<!-- BEGIN auto-generated source table — do not edit; run `uv run python atlas-data/dbt/scripts/build_sources_seed.py --readme atlas-data/ingest/src/sources/README.md` -->
| Source | Provider | What it is | Topic | Geo | Cadence |
|---|---|---|---|---|---|
| [fhi-bor-alene](./fhi-bor-alene/) | fhi | FHI Folkehelsestatistikk table 187 — "Personer som bor alene". Share of adults (16+) living alone, per region, annual. | demographics | kommune | annual |
| [fhi-mobbing](./fhi-mobbing/) | fhi | FHI Folkehelsestatistikk table 377 — Mobbing, 7. og 10. klasse, 3-årige tall. Share of pupils reporting bullying in 7th and 10th grade, 3… | education | kommune | annual |
| [fhi-trangbodd](./fhi-trangbodd/) | fhi | FHI Folkehelsestatistikk table 794 — Trangbodd_UTDANN. Share of population living in overcrowded housing by region × age × education × ho… | education | kommune | annual |
| [fhi-vgs-gjennomforing](./fhi-vgs-gjennomforing/) | fhi | FHI Folkehelsestatistikk table 360 — Gjennomforing i videregående skole (utdann_3). Upper-secondary completion rate per region × sex × pa… | education | kommune | annual |
| [frr](./frr/) | redcross | Norges Røde Kors's internal Frivillig Resource Register (FRR) — operational data on volunteer resources, status, and positions. Private;… | ngo-supply | national | irregular |
| [redcross-branches](./redcross-branches/) | redcross | First NGO-supply ingest. Reads Norges Røde Kors's Organizations API data and writes it to two raw.* tables — chapters and per-chapter act… | ngo-supply | kommune | irregular |
| [ssb-06083](./ssb-06083/) | ssb | SSB statistikkbanktabell 06083 — Familier, etter familietype. Family counts by type per region and year. | demographics | kommune | annual |
| [ssb-06913](./ssb-06913/) | ssb | SSB statistikkbanktabell 06913 — Folkemengde 1. januar og endringer i kalenderåret (folketilvekst, fødsler, dødsfall, inn- og utflyttinger). | demographics | kommune | annual |
| [ssb-06944](./ssb-06944/) | ssb | SSB statistikkbanktabell 06944 — Inntekt for husholdninger, etter husholdningstype. Median household income, income-tax, and household co… | income | kommune | annual |
| [ssb-06947](./ssb-06947/) | ssb | SSB statistikkbanktabell 06947 — Personer i husholdninger med lavinntekt (EU- og OECD-skala). Whole-population complement to ssb-08764 (c… | income | kommune | annual |
| [ssb-07459](./ssb-07459/) | ssb | SSB statistikkbanktabell 07459 — Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning. | demographics | kommune | annual |
| [ssb-08764](./ssb-08764/) | ssb | Ingestion module for SSB statistikkbanktabell 08764 — Personer under 18 år i husholdninger med lavinntekt (EU- og OECD-skala). | income | kommune | annual |
| [ssb-09429](./ssb-09429/) | ssb | SSB statistikkbanktabell 09429 — Utdanningsnivå, etter kommune og kjønn. Educational attainment distribution per kommune × education leve… | education | kommune | annual |
| [ssb-12063](./ssb-12063/) | ssb | SSB KOSTRA 12063 — Kommunale fritidstilbud. Municipal leisure services for children/youth and counts of volunteer youth associations rece… | ngo-supply | kommune | annual |
| [ssb-12131](./ssb-12131/) | ssb | SSB KOSTRA 12131 — Stønadssatser for sosialhjelp. Monthly social-assistance rates set by each kommune. Same KOSTRA pattern as ssb-12292/1… | social | kommune | annual |
| [ssb-12132](./ssb-12132/) | ssb | SSB KOSTRA 12132 — Utgifter som inngår i stønadssatsene for økonomisk sosialhjelp. Per-kommune rules showing whether child benefit / chil… | social | kommune | annual |
| [ssb-12292](./ssb-12292/) | ssb | SSB KOSTRA 12292 — Omsorgstjenester (supplerende grunnlagstall). Nursing-home and home-care service indicators per kommune. | health | kommune | annual |
| [ssb-12944](./ssb-12944/) | ssb | Ingestion module for SSB statistikkbanktabell 12944 — Personer i husholdninger med vedvarende lavinntekt (EU-60), 3-årsperiode. | income | kommune | annual |
| [ssb-13995](./ssb-13995/) | ssb | SSB statistikkbanktabell 13995 — Sosialhjelpstilfeller, utbetalt beløp og stønadstid. Per-kommune counts of social-assistance cases and r… | social | kommune | annual |
| [ssb-klass-fylker](./ssb-klass-fylker/) | ssb | SSB Klass classification 104 — Fylker. The canonical active-fylker list. Feeds dim_fylke. | reference | fylke | irregular |
| [ssb-klass-kommuner](./ssb-klass-kommuner/) | ssb | SSB Klass classification 131 — Kommuner. The canonical active-kommuner list. Sourced from SSB's classification registry (Klass), not from… | reference | kommune | irregular |
<!-- END auto-generated source table -->

## Planned sources

The full roadmap of sources Atlas expects to ingest lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../docs/research/samfunnspuls/data-sources.md) (24 entries from the Samfunnspuls investigation) and [`docs/research/data-sources.md`](../../../../docs/research/data-sources.md) (broader catalogue). Sources move into this folder as they get implemented. No tracking duplication here.

## Adding a new source

The contributor template (`index.ts` shape, README structure, scraping convention) lives in the public guide:

→ [website/docs/contributors/ingest-modules.md](../../../../website/docs/contributors/ingest-modules.md)

For the full end-to-end workflow that ties ingest into dbt and the catalogue:

→ [website/docs/contributors/adding-a-source.md](../../../../website/docs/contributors/adding-a-source.md)

This file stays as the **implemented-sources catalogue** — one row per source actually in the codebase (the table above) and the planned-sources roadmap (referenced from `docs/research/`).
