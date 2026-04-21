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
| [ssb-08764](./ssb-08764/) | SSB | Persons under 18 in low-income households (EU/OECD scale), per kommune, annual | `npm run ingest:ssb-08764` | Default response = latest year only; see README for details |

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
