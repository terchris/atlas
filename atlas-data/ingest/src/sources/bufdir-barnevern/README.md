# bufdir-barnevern

Bufdir **Barnevern kommunemonitor** — annual child-welfare indicators from the official **bulk ZIP** export (one monitor page request to discover the ZIP URL, one request to download 24 workbooks).

Sibling of [`bufdir-barnefattigdom`](../bufdir-barnefattigdom/) — same ingest shape, different literals. **Do not assume the two sources are byte-for-byte parallel**; their workbooks are shaped differently (see "Known quirks" below).

## What the script does

1. `GET` [`https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/`](https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/) and parse the embedded Strapi media link whose path matches `…/uploads/kommunemonitor_barnevern_YYYY_MM_DD_<hash>.zip`.
2. Download that ZIP (`Last-Modified` is recorded as ingest-run `upstream_updated_at` when present).
3. In memory, unzip and process every workbook whose filename starts with a standard alphanumeric indicator code (`1A_`, `3M_`, `4F_`, …) — sheet **`Sheet1`**, header columns `Region`, `Regionnavn`, `Tallformat`, then year columns; **`..`** and blanks become `NULL` in Postgres / JSON. The one file without a code prefix (`Turnover_kommunalt barnevern_2016-2024.xlsx`) is skipped — see "Known quirks".
4. **Replace** `raw.bufdir_barnevern` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`) so surrogate ids stay consistent with workbook filenames.
5. Mirror rows to `atlas-data/ingest/output/bufdir-barnevern.ndjson`.

`indicator_api_id` is **`bv_zip_ind_<code>`** derived from the leading alphanumeric code of each workbook's filename (e.g. `bv_zip_ind_1a`, `bv_zip_ind_3m`). Defensive fallback: filenames not matching the code-prefix shape produce `bv_zip_<24-hex SHA-256(stem)>`. See [`parse.ts`](./parse.ts) `surrogateIndicatorApiId`.

## Known quirks / fragility (verified 2026-10-01, see `PLAN-003-bufdir-barnevern.md` Phase 1)

- **Not the same internal shape as `bufdir-barnefattigdom`**, despite being the same delivery mechanism from the same Bufdir CMS:
  - Sheet is **`Sheet1`**, not `Data`.
  - Header is **`Region | Regionnavn | Tallformat | <years>`** — **no `Enhet` column** (no `category_unit` dimension at all in `raw.bufdir_barnevern`).
  - Indicator codes are **alphanumeric** (`1A`, `3M`, `4F`, …), not the sibling's purely-numeric `Indikator_<n>`.
  - Row 1 of each sheet is typically just the filename stem repeated, not a separate human-readable title sentence.
- **One file in the live bundle has a completely different internal layout**: `Turnover_kommunalt barnevern_2016-2024.xlsx` uses year-range column headers (`turnover 2015-2016`, …) and combines kommune code + name into a single cell. It is excluded by `isStandardIndicatorWorkbook`'s filename filter, not specially parsed — `3M_turnover_saksbehandlere.xlsx` already carries the equivalent indicator in the standard shape. If a future bundle drops the `3M` file, revisit whether `Turnover_...xlsx` needs its own parser.
- **Discovery URL word order differs from the sibling**: `Kommunemonitor_barnevern_YYYY_MM_DD_<hash>.zip`, not `YYYY_MM_DD_barnefattigdom_monitor_<hash>.zip`. Don't parameterize a shared discovery function across the two sources on the assumption their URL shapes are symmetrical — they aren't.
- **Decimal format is called `andel`, not `prosent`.** Verified live 2026-10-01 against all 23 standard workbooks: Barnevern's `Tallformat` column only ever contains `Antall` or `Andel` — never `Prosent`, the sibling source's word for the same concept. An earlier draft of this parser checked for `prosent` (copied from the sibling without re-verifying) and silently dropped every `andel` row — roughly half of all rows, and 9 of 23 workbooks entirely (`2A`–`2F`, `3M`, `4C`–`4E`), caught by running the real ingest against the live ZIP before merging. `andel` cells arrive as Norwegian decimal strings (`9,2` with spaces, but also non-percentage figures like `17689,64` for kroner-per-child indicators — "andel" means "a decimal-formatted number", not "a 0-100 percentage"); the parser normalises before casting.
- **Oslo bydel** rows can appear with longer `region_code` values; the dbt model maps only 4-digit codes to `kommune_nr`.

## Refresh checklist — when Bufdir publishes a new bundle release

The ingest is fully automatic (one HTTP probe, one ZIP download, no manual steps). If a new release adds a workbook whose filename doesn't match the `<code>_` prefix pattern, it will be logged (`workbook.skipped_non_standard`) and excluded rather than silently mis-parsed — check that log line after any Bufdir-side bundle change and decide whether the new file needs its own handling.

## References

- Monitor + download link: https://www.bufdir.no/statistikk-og-analyse/monitor/barnevern/
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Sibling source (pattern reference, not a byte-identical twin): [`bufdir-barnefattigdom`](../bufdir-barnefattigdom/)
- Plan: [`PLAN-003-bufdir-barnevern.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-003-bufdir-barnevern.md)
