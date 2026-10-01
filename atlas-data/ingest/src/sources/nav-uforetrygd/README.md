# nav-uforetrygd

NAV **PST302** — uføretrygd (disability benefit) recipients, count and share of the population
aged 18-67, per kommune, **monthly**. Atlas's first monthly-cadence source.

## What the script does

1. `GET` [the monitor page](https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk) and extract the live PST302 xlsx download path — a **relative** `/_/attachment/download/<uuid>:<hash>/PST302...xlsx` link (unlike the Bufdir sources' absolute CDN links), re-resolved every run since the hash changes with every release.
2. Download that one workbook directly — no ZIP.
3. Parse the `Kommune-bydel. Antall` and `Kommune-bydel. Andel` sheets (the other three sheets — `" Om statistikken"`, `"Fylke. Antall"`, `"Fylke. Andel"` — are out of scope; Atlas only wants the kommune/bydel-resolved pair).
4. **Replace** `raw.nav_uforetrygd` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`).
5. Mirror rows to `atlas-data/ingest/output/nav-uforetrygd.ndjson`.

## The file shape — read this before touching `parse.ts`

Verified live 2026-10-01 (`PLAN-004-nav-uforetrygd.md` Phase 1). This is **not** a flat table. Each
in-scope sheet is a repeating group, once per fylke:

```
B8:  "03 Oslo - Oslove"              ← fylke section header, zero data cells — skipped
B10: Januar | Februar | ... | August ← month-name header row (repeats per fylke block)
B11: "03 Oslo - Oslove i alt  "      ← fylke total, 2-digit code
B12: "030101 Gamle Oslo"             ← bydel row, 6-digit code (Oslo/Bergen/Stavanger/Trondheim only)
...
B29: "0301 Oslo - Oslove"            ← kommune-level rollup, 4-digit code, ALL MONTHS SUPPRESSED (*)
B32: "11 Rogaland"                   ← next fylke header
B35: "11 Rogaland i alt  "           ← fylke total
B36: "1101 Eigersund"                ← ordinary kommune, 4-digit code, real values
B38: "1103 Stavanger i alt  "        ← kommune-rollup, 4-digit code — appears BEFORE its bydel rows,
B39: "110301 Hundvåg"                   WITH an "i alt" suffix (Oslo's came AFTER, with NO suffix)
```

**`parse.ts` does not use row position or the `"i alt"` suffix to classify anything.** Every row is
classified independently by its label's leading digit-run (2/4/6 digits = fylke/kommune/bydel) and
kept only if it carries at least one data cell — which is also what naturally skips header-only
rows (a fylke title or the month-name row has zero data cells) without any special-casing. See
`parse.ts`'s module header for the full reasoning; don't "simplify" this into a block-tracking
parser that assumes Oslo's and Stavanger's rollup rows are shaped the same way — they aren't.

`region_kind` (fylke/kommune/bydel) is **not** derived in the ingest — that's `classify_region_code`'s
job at the dbt layer, same convention as every other Atlas source.

## Known quirks / fragility

- **Suppression marker is `*`** — NAV's own convention, different from the Bufdir sources' `..`/`.`
  and SSB's `..`.
- **Cells are native numeric**, not Norwegian-decimal-comma strings (confirmed on both sheets) —
  unlike the Bufdir sources. `parseCell`'s comma-replace is defensive, not required by anything
  observed.
- **One year per file.** The live file is replaced in place as the current year progresses (more
  month columns appear each month); it is not a multi-year history. Full historical backfill (one
  archive file per past calendar year, confirmed to exist at
  `nav.no/.../arkiv-uforetrygd-manedsstatistikk-<range>`) is explicitly deferred — v1 tracks the
  live current-year file only.
- **`0301 Oslo` (the kommune-level rollup) is suppressed for every month**, even though the
  fylke-level total two rows up carries real ~32,000-scale numbers for the same population.
  Recorded as observed upstream behaviour in the manifest; not explained, not corrected.
- **`data.norge.no` does not have a cleaner distribution.** Checked directly against the real
  backing search API (not a web search, which only sees the site's client-rendered shell) before
  building this — `PST302` returns zero hits; NAV's one dataset matching "uføretrygd statistikk"
  there is a different product, flagged `isOpenData: false`. See
  `INVESTIGATE-new-norwegian-public-sources.md`'s 2026-10-01 correction for the full verification.
- **Licence is CC BY 4.0, not NLOD** — verified against NAV's own stated terms, not assumed from
  the Norwegian-public-sector default.

## References

- Monitor page: https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/uforetrygd/uforetrygd-manedsstatistikk
- Licence: https://creativecommons.org/licenses/by/4.0/deed.no
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-004-nav-uforetrygd.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-004-nav-uforetrygd.md)
