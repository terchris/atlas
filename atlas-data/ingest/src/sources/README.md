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

## Adding a new source — the template

1. Create `src/sources/<source-id>/` (folder name matches the `id` field in the catalogue).
2. Copy `ssb-08764/index.ts` and adapt: new `SOURCE_ID`, new `TABLE_ID` (or fetch logic for non-SSB sources), adjust `toIndicatorRow()` if the upstream dimensions differ.
3. Write `<source-id>/README.md` describing the upstream, the response shape, known quirks, how to run, and references back to the catalogue.
4. Add a row to the table in this file.
5. Add `"ingest:<source-id>": "tsx src/sources/<source-id>/index.ts"` to `package.json`.
6. Ensure the corresponding catalogue entry in `docs/research/samfunnspuls/data-sources.md` is up to date.

Typical per-source effort for an SSB table: ~30 minutes. API ingests from NGOs (e.g. Red Cross) land on a similar effort. Scraping ingests (Folkehjelp and other NGOs without an API) follow a separate folder convention — see below.

---

## Scraping sources — additional convention

NGO scraping sources (those that fetch and parse HTML) follow an **extended folder layout** on top of the baseline above. Design rationale and the full decision log live in [`INVESTIGATE-ngo-scraping-infrastructure.md`](../../../../docs/ai-developer/plans/completed/INVESTIGATE-ngo-scraping-infrastructure.md); this section is the practical checklist.

### Folder layout

```
sources/<source-slug>/
├── README.md          — source overview, refresh cadence, owner contact, known quirks
├── index.ts           — orchestration: ingest_runs start/end, Crawlee, discover → parse → upsertRecord
├── discover.ts        — sitemap or HTML-index enumeration; reads/writes raw.sitemap_log; returns fetch/skip decisions and orphans
├── parse.ts           — **pure function** `(html, url) → Record`; NFC normalization here; no I/O
├── overrides.json     — manual overrides (slug → kommune, name → orgnr, etc.)
├── types.ts           — TS types for the source's record shape
└── __tests__/
    ├── parse.test.ts  — golden-file tests: `parse(fixture.html)` deep-equals `fixture.expected.json`
    └── fixtures/
        ├── <case-a>.html
        ├── <case-a>.expected.json
        └── …          — aim for 2–3 fixtures per source (§G.3 of the investigation)
```

### File responsibilities (from §B.3 / [Q25])

- **`parse.ts`** is pure: no DB, no HTTP, no filesystem. Takes raw HTML + URL, returns a typed record. All Unicode NFC normalization (§C.3 / [Q21]) happens here at the parser boundary.
- **`discover.ts`** owns discovery I/O: fetches sitemap(s) or HTML index; calls `readPriorState` and `upsertDiscovered` against `raw.sitemap_log`; returns the list of URLs to fetch and the list of orphans.
- **`index.ts`** orchestrates end-to-end: `startRun` to acquire the concurrent-run lock, creates the Crawlee crawler, drives discover → Crawlee fetch loop → `parse.ts` → `upsertRecord` (from `src/lib/scraping/`), propagates orphans to `is_active=false`, writes the `finishRun` row.
- **`overrides.json`** and **`types.ts`** carry source-specific configuration and types.

### Mandatory raw-table columns (§C.5 / [Q20])

Every scraper's `raw.<source>_*` **parent** table must include these columns on top of source-specific fields:

| Column | Type | Purpose |
|---|---|---|
| `url` | `TEXT NOT NULL UNIQUE` (or PK) | Join key against `raw.sitemap_log.url`. Store verbatim; no normalization. |
| `record_hash` | `TEXT NOT NULL` | sha256 of canonical JSON of the extracted record. Skip signal. |
| `html_raw_hash` | `TEXT` (nullable) | Audit-only; for template-drift forensics via `mart_ingest_health`. |
| `is_active` | `BOOLEAN NOT NULL DEFAULT true` | Flipped to `false` on fetch-time 404 or sitemap orphan. |
| `loaded_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Project convention; see [`CONTRIBUTING.md`](../../../CONTRIBUTING.md). |

Child tables (activities under a chapter, sub-locations under a branch) do **not** carry these columns — they're owned by the parent row and delete-and-reinserted when the parent's `record_hash` changes.

### Migration naming

- Per-source tables: `NNN_raw_<source_slug>.sql` — e.g. `NNN_raw_folkehjelp_chapters.sql`.
- Shared infrastructure tables already live at `raw.ingest_runs` and `raw.sitemap_log`. Don't re-create them.
- NNN is a repository-wide sequential counter; take the next free number (see `ls atlas-data/migrations/`).

### Environment variables

Scraping sources read three env vars from the ingest `.env` — documented in [`../../README.md`](../../README.md) under "Environment variables":

- `ATLAS_SCRAPE_CONTACT_EMAIL` (required; hard-fails if unset)
- `CRAWLEE_STORAGE_DIR` (optional; dev uses repo-local `.crawlee-cache/`, prod uses an ephemeral in-pod path)
- `CRAWLEE_LOG_LEVEL` (optional; dev `INFO`, prod `WARNING`, `DEBUG` for troubleshooting)

### Checklist for a new scraping source

1. Confirm the investigation doctrine: check native API → check sitemap → check `robots.txt` → optional outreach email (§A).
2. Create the folder under `src/sources/<slug>/` with the layout above.
3. Add the migration `NNN_raw_<slug>.sql`; include the mandatory columns.
4. Build the Crawlee-based pipeline using the shared library at `src/lib/scraping/` (UA, hashers, robots, sitemap_log, ingest_runs, upsertRecord, kv).
5. Add 2–3 golden-file fixtures under `__tests__/fixtures/`; the parser test runs via `vitest`.
6. Add an `"ingest:<slug>"` script to `package.json`; add a row to the table above.
7. The corresponding `supply__<slug>_*.sql` dbt staging model is outside this PLAN — each per-NGO PLAN handles its own staging and activity-to-category mapping.
