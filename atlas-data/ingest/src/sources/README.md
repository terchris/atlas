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
| [fhi-mobbing](./fhi-mobbing/) | FHI | Bullying share, 7th and 10th grade, 3-year averages | `npm run ingest:fhi-mobbing` | Substitute for `udir-elevundersokelsen` (bullying); FHI 377 |
| [fhi-trangbodd](./fhi-trangbodd/) | FHI | Overcrowded-housing share by region × age × education × housing-status | `npm run ingest:fhi-trangbodd` | Public substitute for Samfunnspuls's bespoke SSB extract; RATE measure only |
| [fhi-vgs-gjennomforing](./fhi-vgs-gjennomforing/) | FHI | Upper-secondary completion rate by region × sex × parents-ed × immigration-cat | `npm run ingest:fhi-vgs-gjennomforing` | Substitute for `udir-sluttet-vgs`; dropout = 100 − completion |
| [ssb-06083](./ssb-06083/) | SSB | Families by type (couple with/without kids, single parent, etc.) | `npm run ingest:ssb-06083` | 4 dims (adds FamilieType); single-parent share = vulnerability proxy |
| [ssb-06913](./ssb-06913/) | SSB | Population change — folketilvekst, fødsler, dødsfall, flyttinger, per kommune/fylke, annual | `npm run ingest:ssb-06913` | 3 dims, 8 ContentsCodes, includes projections in future years |
| [ssb-06944](./ssb-06944/) | SSB | Household income (median), income tax, household count by region × household type | `npm run ingest:ssb-06944` | First economy indicator; includes bydeler (delområder) |
| [ssb-07459](./ssb-07459/) | SSB | Population by region, sex and single-year age | `npm run ingest:ssb-07459` | 5 dims (adds Kjonn + Alder); ~210 k cells — largest pull so far |
| [ssb-06947](./ssb-06947/) | SSB | Whole-population low income (EU/OECD) — complements ssb-08764 (children) | `npm run ingest:ssb-06947` | Same 5 content codes as 08764; 1 036 regions × 20 years |
| [ssb-08764](./ssb-08764/) | SSB | Persons under 18 in low-income households (EU/OECD scale), per kommune, annual | `npm run ingest:ssb-08764` | Default response = latest year only; see README |
| [ssb-09429](./ssb-09429/) | SSB | Educational attainment by kommune × sex × level | `npm run ingest:ssb-09429` | 5 dims (Nivaa + Kjonn); sex mapped to male/female/all |
| [ssb-12063](./ssb-12063/) | SSB KOSTRA | Municipal leisure services / voluntary youth associations | `npm run ingest:ssb-12063` | KOSTRA pattern |
| [ssb-12131](./ssb-12131/) | SSB KOSTRA | Social-assistance monthly rates | `npm run ingest:ssb-12131` | KOSTRA pattern |
| [ssb-12132](./ssb-12132/) | SSB KOSTRA | Welfare benefit-income rules | `npm run ingest:ssb-12132` | KOSTRA pattern |
| [ssb-12292](./ssb-12292/) | SSB KOSTRA | Omsorgstjenester — nursing home + home care indicators | `npm run ingest:ssb-12292` | 49 content codes, KOSTRA region dim |
| [ssb-12944](./ssb-12944/) | SSB | Persons in households with persistent low income (EU-60), 3-year rolling periods, broken down by age group | `npm run ingest:ssb-12944` | 4 dims (adds Alder); Tid stored as period text like "2022-2024" |
| [ssb-13995](./ssb-13995/) | SSB | Social-assistance cases, amounts paid, support duration — 34 content codes | `npm run ingest:ssb-13995` | KOSTRA table with `KOKkommuneregion0000` dim; 2022-2025 only |
| [ssb-klass-fylker](./ssb-klass-fylker/) | SSB Klass | Canonical active-fylker list (classification 104) | `npm run ingest:ssb-klass-fylker` | Dimension source; feeds `dim_fylke`. Includes residual `"99 Uoppgitt"`. |
| [ssb-klass-kommuner](./ssb-klass-kommuner/) | SSB Klass | Canonical active-kommuner list (classification 131) | `npm run ingest:ssb-klass-kommuner` | Dimension source; feeds `dim_kommune`. REST API, not PxWebAPI. |
| [redcross-branches](./redcross-branches/) | Red Cross Organizations API | Branches (HQ + Distrikt + Lokalforening) with per-branch activities | `npm run ingest:redcross-branches` | First NGO supply source; static JSON dump in v1, live API deferred |

## Planned sources

The full roadmap of sources Atlas expects to ingest lives in [`docs/research/samfunnspuls/data-sources.md`](../../../../docs/research/samfunnspuls/data-sources.md) (24 entries from the Samfunnspuls investigation) and [`docs/research/data-sources.md`](../../../../docs/research/data-sources.md) (broader catalogue). Sources move into this folder as they get implemented. No tracking duplication here.

## Adding a new source

The contributor template (`index.ts` shape, README structure, scraping convention) lives in the public guide:

→ [website/docs/contributors/ingest-modules.md](../../../../website/docs/contributors/ingest-modules.md)

For the full end-to-end workflow that ties ingest into dbt and the catalogue:

→ [website/docs/contributors/adding-a-source.md](../../../../website/docs/contributors/adding-a-source.md)

This file stays as the **implemented-sources catalogue** — one row per source actually in the codebase (the table above) and the planned-sources roadmap (referenced from `docs/research/`).
