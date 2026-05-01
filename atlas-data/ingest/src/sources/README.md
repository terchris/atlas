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
| `upstream_url` | Link to the data — typically the API endpoint or machine-readable URL Atlas's ingest module fetches. |
| `upstream_landing_page` *(optional)* | Human-browsable web page describing the dataset (DCAT-AP `dcat:landingPage`). Use when the data URL is JSON-only (e.g. FHI's `/api/open/v1/...`); leave empty when `upstream_url` is already browsable (e.g. SSB statbank tables). Frontend falls back to `upstream_url` when this is empty. |
| `upstream_title` | The source's authoritative title at the upstream (usually Norwegian). |
| `description` | One paragraph for the customer-facing catalogue. |
| `publisher` | Institution that publishes the data (often equals provider). |
| `license` | License token. Default `NLOD` for Norwegian public-sector sources. |
| `license_url` | URL to the license terms. |
| `periodicity` | ISO 8601 — `P1Y` annual, `P3M` quarterly, `P1M` monthly, `P1D` daily, or `irregular`. |
| `eu_theme` | EU Publications Office Data Theme code (one of: `AGRI`, `ECON`, `EDUC`, `ENER`, `ENVI`, `GOVE`, `HEAL`, `INTR`, `JUST`, `REGI`, `SOCI`, `TECH`, `TRAN`). Coarser than `tags.topic`; aligns Atlas with Felles datakatalog + DCAT-AP. Auto-derived from `topic` by `fill-manifest-todos.ts`. |
| `attribution` | Citation string for academic / legal compliance (e.g. `Kilde: Statistisk sentralbyrå, tabell 08764`). Surfaced via `mart_meta_sources` so external developers can attribute Atlas data correctly. |

**Required `tags:` namespaces** (exactly one value per namespace):

| Namespace | Allowed values |
|---|---|
| `provider` | `ssb` / `fhi` / `redcross` / `brreg` |
| `topic` | `demographics` / `income` / `education` / `health` / `social` / `ngo-supply` / `reference` |
| `geo` | `kommune` / `fylke` / `national` / `bydel` |
| `cadence` | `annual` / `quarterly` / `monthly` / `irregular` / `one-shot` |

**Required `dimensions:` block** — list each upstream dimension the source delivers, with editorial semantic context the catalogue can't compute:

```yaml
dimensions:
  - code: Region                  # upstream's own dimension code
    meaning: Region (kommune / fylke / nasjon / bydel / historical)
    value_format: "Numeric code: 0 national, 2-digit fylke, 4-digit kommune, 6-digit bydel"
    notes: "~1036 codes when pulling full range"
  - code: ContentsCode
    meaning: Statistic measure
    value_format: 5 codes
    notes: "Personer (count), EUskala50/60 (% below 50%/60% of median, EU scale), …"
```

`code` and `meaning` are required per dimension; `value_format` and `notes` may be empty strings. The catalogue's Phase-3 `mart_meta_dimensions` joins this editorial seed with computed cardinality + example values from `raw.*` tables, so shoppers see "what each column means" + "what values it actually contains" in one view.

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
| Source | Provider | What it is | Topic | EU theme | Geo | Cadence |
|---|---|---|---|---|---|---|
| [fhi-befolkning](./fhi-befolkning/) | fhi | FHI Folkehelsestatistikk table 338 — Befolkningssammensetning. Population counts by region × sex × age band, used as the demographic deno… | demographics | SOCI | kommune | annual |
| [fhi-bor-alene](./fhi-bor-alene/) | fhi | FHI Folkehelsestatistikk table 187 — "Personer som bor alene". Share of adults (16+) living alone, per region, annual. | demographics | SOCI | kommune | annual |
| [fhi-mobbing](./fhi-mobbing/) | fhi | FHI Folkehelsestatistikk table 377 — Mobbing, 7. og 10. klasse, 3-årige tall. Share of pupils reporting bullying in 7th and 10th grade, 3… | education | EDUC | kommune | annual |
| [fhi-trangbodd](./fhi-trangbodd/) | fhi | FHI Folkehelsestatistikk table 794 — Trangbodd_UTDANN. Share of population living in overcrowded housing by region × age × education × ho… | education | EDUC | kommune | annual |
| [fhi-vgs-gjennomforing](./fhi-vgs-gjennomforing/) | fhi | FHI Folkehelsestatistikk table 360 — Gjennomforing i videregående skole (utdann_3). Upper-secondary completion rate per region × sex × pa… | education | EDUC | kommune | annual |
| [frr](./frr/) | redcross | Norges Røde Kors's internal Frivillig Resource Register (FRR) — operational data on volunteer resources, status, and positions. Private;… | ngo-supply | SOCI | national | irregular |
| [redcross-branches](./redcross-branches/) | redcross | First NGO-supply ingest. Reads Norges Røde Kors's Organizations API data and writes it to two raw.* tables — chapters and per-chapter act… | ngo-supply | SOCI | kommune | irregular |
| [ssb-06083](./ssb-06083/) | ssb | SSB statistikkbanktabell 06083 — Familier, etter familietype. Family counts by type per region and year. | demographics | SOCI | kommune | annual |
| [ssb-06913](./ssb-06913/) | ssb | SSB statistikkbanktabell 06913 — Folkemengde 1. januar og endringer i kalenderåret (folketilvekst, fødsler, dødsfall, inn- og utflyttinger). | demographics | SOCI | kommune | annual |
| [ssb-06944](./ssb-06944/) | ssb | SSB statistikkbanktabell 06944 — Inntekt for husholdninger, etter husholdningstype. Median household income, income-tax, and household co… | income | SOCI | kommune | annual |
| [ssb-06947](./ssb-06947/) | ssb | SSB statistikkbanktabell 06947 — Personer i husholdninger med lavinntekt (EU- og OECD-skala). Whole-population complement to ssb-08764 (c… | income | SOCI | kommune | annual |
| [ssb-07459](./ssb-07459/) | ssb | SSB statistikkbanktabell 07459 — Alders- og kjønnsfordeling i kommuner, fylker og hele landets befolkning. | demographics | SOCI | kommune | annual |
| [ssb-08764](./ssb-08764/) | ssb | Ingestion module for SSB statistikkbanktabell 08764 — Personer under 18 år i husholdninger med lavinntekt (EU- og OECD-skala). | income | SOCI | kommune | annual |
| [ssb-09429](./ssb-09429/) | ssb | SSB statistikkbanktabell 09429 — Utdanningsnivå, etter kommune og kjønn. Educational attainment distribution per kommune × education leve… | education | EDUC | kommune | annual |
| [ssb-12063](./ssb-12063/) | ssb | SSB KOSTRA 12063 — Kommunale fritidstilbud. Municipal leisure services for children/youth and counts of volunteer youth associations rece… | ngo-supply | SOCI | kommune | annual |
| [ssb-12131](./ssb-12131/) | ssb | SSB KOSTRA 12131 — Stønadssatser for sosialhjelp. Monthly social-assistance rates set by each kommune. Same KOSTRA pattern as ssb-12292/1… | social | SOCI | kommune | annual |
| [ssb-12132](./ssb-12132/) | ssb | SSB KOSTRA 12132 — Utgifter som inngår i stønadssatsene for økonomisk sosialhjelp. Per-kommune rules showing whether child benefit / chil… | social | SOCI | kommune | annual |
| [ssb-12292](./ssb-12292/) | ssb | SSB KOSTRA 12292 — Omsorgstjenester (supplerende grunnlagstall). Nursing-home and home-care service indicators per kommune. | health | HEAL | kommune | annual |
| [ssb-12944](./ssb-12944/) | ssb | Ingestion module for SSB statistikkbanktabell 12944 — Personer i husholdninger med vedvarende lavinntekt (EU-60), 3-årsperiode. | income | SOCI | kommune | annual |
| [ssb-13995](./ssb-13995/) | ssb | SSB statistikkbanktabell 13995 — Sosialhjelpstilfeller, utbetalt beløp og stønadstid. Per-kommune counts of social-assistance cases and r… | social | SOCI | kommune | annual |
| [ssb-klass-fylker](./ssb-klass-fylker/) | ssb | SSB Klass classification 104 — Fylker. The canonical active-fylker list. Feeds dim_fylke. | reference | GOVE | fylke | irregular |
| [ssb-klass-kommuner](./ssb-klass-kommuner/) | ssb | SSB Klass classification 131 — Kommuner. The canonical active-kommuner list. Sourced from SSB's classification registry (Klass), not from… | reference | GOVE | kommune | irregular |
<!-- END auto-generated source table -->

## Planned sources

The full roadmap of sources Atlas expects to ingest lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../docs/research/samfunnspuls/data-sources.md) (24 entries from the Samfunnspuls investigation) and [`docs/research/data-sources.md`](../../../../docs/research/data-sources.md) (broader catalogue). Sources move into this folder as they get implemented. No tracking duplication here.

## Adding a new source

The contributor template (`index.ts` shape, README structure, scraping convention) lives in the public guide:

→ [website/docs/contributors/ingest-modules.md](../../../../website/docs/contributors/ingest-modules.md)

For the full end-to-end workflow that ties ingest into dbt and the catalogue:

→ [website/docs/contributors/adding-a-source.md](../../../../website/docs/contributors/adding-a-source.md)

This file stays as the **implemented-sources catalogue** — one row per source actually in the codebase (the table above) and the planned-sources roadmap (referenced from `docs/research/`).
