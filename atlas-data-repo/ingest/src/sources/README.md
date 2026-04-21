# Sources

One folder per upstream data source. Each folder is a self-contained unit: the code, a README, and any ancillary files the source needs (test fixtures, custom schema mappings, etc.).

## Conventions

- **One folder per source.** Folder name = source id (matches the id in `docs/research/samfunnspuls/data-sources.md`).
- **Entry point is `index.ts`.** Exports `SOURCE_ID`, `run()`, and any types callers need.
- **README.md alongside the code.** Implementation notes, observed quirks, known issues. Strategic/catalogue-level metadata stays in `docs/research/samfunnspuls/data-sources.md`, not duplicated here.
- **npm script per source**: `"ingest:<id>": "tsx src/sources/<id>/index.ts"` in [`../../package.json`](../../package.json).

## Implemented sources

| Source | Provider | What it is | Run | Notes |
|---|---|---|---|---|
| [fhi-bor-alene](./fhi-bor-alene/) | FHI | Share of adults (16+) living alone, per region, annual | `npm run ingest:fhi-bor-alene` | First non-SSB source. POST-only data endpoint, json-stat2 response |
| [ssb-06083](./ssb-06083/) | SSB | Families by type (couple with/without kids, single parent, etc.) | `npm run ingest:ssb-06083` | 4 dims (adds FamilieType); single-parent share = vulnerability proxy |
| [ssb-06913](./ssb-06913/) | SSB | Population change — folketilvekst, fødsler, dødsfall, flyttinger, per kommune/fylke, annual | `npm run ingest:ssb-06913` | 3 dims, 8 ContentsCodes, includes projections in future years |
| [ssb-06944](./ssb-06944/) | SSB | Household income (median), income tax, household count by region × household type | `npm run ingest:ssb-06944` | First economy indicator; includes bydeler (delområder) |
| [ssb-07459](./ssb-07459/) | SSB | Population by region, sex and single-year age | `npm run ingest:ssb-07459` | 5 dims (adds Kjonn + Alder); ~210 k cells — largest pull so far |
| [ssb-06947](./ssb-06947/) | SSB | Whole-population low income (EU/OECD) — complements ssb-08764 (children) | `npm run ingest:ssb-06947` | Same 5 content codes as 08764; 1 036 regions × 20 years |
| [ssb-08764](./ssb-08764/) | SSB | Persons under 18 in low-income households (EU/OECD scale), per kommune, annual | `npm run ingest:ssb-08764` | Default response = latest year only; see README |
| [ssb-12292](./ssb-12292/) | SSB KOSTRA | Omsorgstjenester — nursing home + home care indicators | `npm run ingest:ssb-12292` | 49 content codes, KOSTRA region dim |
| [ssb-12944](./ssb-12944/) | SSB | Persons in households with persistent low income (EU-60), 3-year rolling periods, broken down by age group | `npm run ingest:ssb-12944` | 4 dims (adds Alder); Tid stored as period text like "2022-2024" |
| [ssb-13995](./ssb-13995/) | SSB | Social-assistance cases, amounts paid, support duration — 34 content codes | `npm run ingest:ssb-13995` | KOSTRA table with `KOKkommuneregion0000` dim; 2022-2025 only |
| [ssb-klass-fylker](./ssb-klass-fylker/) | SSB Klass | Canonical active-fylker list (classification 104) | `npm run ingest:ssb-klass-fylker` | Dimension source; feeds `dim_fylke`. Includes residual `"99 Uoppgitt"`. |
| [ssb-klass-kommuner](./ssb-klass-kommuner/) | SSB Klass | Canonical active-kommuner list (classification 131) | `npm run ingest:ssb-klass-kommuner` | Dimension source; feeds `dim_kommune`. REST API, not PxWebAPI. |

## Planned sources

The full roadmap of sources Atlas expects to ingest lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../docs/research/samfunnspuls/data-sources.md) (24 entries from the Samfunnspuls investigation) and [`docs/research/data-sources.md`](../../../../docs/research/data-sources.md) (broader catalogue). Sources move into this folder as they get implemented. No tracking duplication here.

## Adding a new source — the template

1. Create `src/sources/<source-id>/` (folder name matches the `id` field in the catalogue).
2. Copy `ssb-08764/index.ts` and adapt: new `SOURCE_ID`, new `TABLE_ID` (or fetch logic for non-SSB sources), adjust `toIndicatorRow()` if the upstream dimensions differ.
3. Write `<source-id>/README.md` describing the upstream, the response shape, known quirks, how to run, and references back to the catalogue.
4. Add a row to the table in this file.
5. Add `"ingest:<source-id>": "tsx src/sources/<source-id>/index.ts"` to `package.json`.
6. Ensure the corresponding catalogue entry in `docs/research/samfunnspuls/data-sources.md` is up to date.

Typical per-source effort for an SSB table: ~30 minutes. HTML-scrape sources (Udir, IMDi) will need custom parsing and take longer.
