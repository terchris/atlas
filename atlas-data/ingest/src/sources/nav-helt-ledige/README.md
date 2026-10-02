# nav-helt-ledige

NAV **HL060** — "Helt ledige. Fylke og kommune. Tidsserie måned": count and share of the labour
force registered as fully unemployed, per kommune, **monthly**. Atlas's fourth NAV-adjacent source
and third source on the `monthly_sources_refresh` job.

## What the script does

1. `GET` [the helt-ledige sub-page](https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige) and extract the live HL060 xlsx download path — a real `<a href="/_/attachment/download/<uuid>:<hash>/202608_HL060...xlsx">` anchor directly in the server-rendered HTML, re-resolved every run since the hash changes with every release.
2. Download that one workbook directly — no ZIP.
3. Parse the `"3. Kommune Antall"` and `"4. Kommune Prosent av arbeidsst"` sheets.
4. **Replace** `raw.nav_helt_ledige` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`).
5. Mirror rows to `atlas-data/ingest/output/nav-helt-ledige.ndjson`.

## The file shape — read this before touching `parse.ts`

Verified live 2026-10-02 (`PLAN-014-nav-helt-ledige.md` Phase 1). A fourth distinct pivot shape
within the NAV-Excel family this session, but **the simplest to classify**: neither the bare
fylke header row nor the "I alt `<name>`" rollup row carries any digit at all, so "the label
starts with exactly 4 digits" alone separates real kommune rows — no "I alt `<2-digit-fylke>`"
prefix check needed, unlike AAP155's "I alt 03 Oslo". Each sheet is a repeating group, once per
fylke:

```
B6:  "Oslo - Oslove"                        ← bare fylke header, NO "I alt", NO code, NO data
B7:  (blank) | Januar | ... | August         ← month-name header row (repeats per fylke block)
B8:  "I alt Oslo - Oslove" | 12125 | ...     ← fylke rollup — skipped
B9:  "0301 Oslo - Oslove" | 12125 | ...      ← the one kommune in this fylke, real values
B10: "Rogaland"                              ← next fylke header
...
B422: "Svalbard og øvrige områder"           ← a 17th "fylke" block
B424: "I alt Svalbard og øvrige områder" | 13 | ...
B425: "2100 Svalbard" | 13 | ...             ← Svalbard's own real pseudo-kommune code — KEPT
B427: "Ukjent"                               ← an 18th "fylke" block, no numeric code anywhere
B429: "I alt Ukjent" | 13 | ...              ← rollup — skipped
B430: "Ukjent" | 13 | ...                    ← the kommune-level leaf — KEPT (same label as B427!)
```

`parse.ts` was written fresh for this table, **not adapted from `nav-aap`'s or `nav-uforetrygd`'s
parser** — see `PLAN-014-nav-helt-ledige.md`'s [Q2]. Every row is classified by its label alone: a
4-digit leading code is a kommune (including Svalbard's `2100`), the exact literal `"Ukjent"` is
the unknown-region bucket, anything else (`"I alt ..."` rollups, bare fylke headers) is skipped.

`region_kind` is **not** derived in the ingest — that's `classify_region_code`'s job at the dbt
layer, same convention as every other Atlas source. `2100` resolves via the macro's existing
`^21\d{2}$` svalbard branch; `Ukjent` has no numeric code at all, so it falls through to the
macro's existing `unknown` kind — no macro change needed for either.

## Known quirks / fragility

- **"Ukjent" is simultaneously its own fylke header AND its own kommune leaf** — both rows carry
  the bare literal label `"Ukjent"`, unlike every other fylke block where the header and the "I
  alt" rollup carry distinguishable text. The header row is all-null across the month columns and
  is dropped by the ingest's existing hasData guard; only the data-bearing leaf row survives. See
  `parse.ts`'s module header and `PLAN-014-nav-helt-ledige.md`'s [Q5].
- **Unlike `nav-aap`, "Ukjent" IS present in both sheets here** (359 distinct regions in both
  Antall and Prosent — 357 kommuner + Svalbard's `2100` + `Ukjent`) — but every one of its month
  cells in the Prosent (share) sheet is NAV's own suppression marker `*`, not a real share.
  Confirmed live; do not assume the `nav-aap` 357-vs-358 asymmetry carries over to this source.
- **Suppression marker is `*`** — same convention as `nav-uforetrygd`/`nav-aap`, but **a different
  legal citation**: this table's own methodology sheet cites Statistikklovens **§ 7-1**, not
  AAP155's § 2-6. Same `<4`-person threshold, different paragraph — read each table's own
  methodology sheet rather than assuming one citation applies to every NAV table.
- **Cells are native numeric**, not Norwegian-decimal-comma strings — `parseCell`'s comma-replace
  is defensive, not required by anything observed.
- **The period-label cell has a different shape than AAP155's.** This table's cell reads
  `"<Month> - <month> <year>"` (e.g. `"Januar - august 2026"`), not AAP155's
  `"Periode: <year> <mm> - <year> <mm>"`. `PERIOD_LABEL_RE` matches this table's own shape.
- **Blank-row spacing is inconsistent between the two sheets** — the Antall sheet has no blank row
  between one fylke's last kommune and the next fylke's header; the Prosent sheet does. The
  parser's flat row-by-row scan tolerates this (blank-label rows are simply skipped, never counted
  on for structure), same as `nav-aap`'s parser already does.
- **One year per file.** The live file is replaced in place as the current year progresses. An
  archive page exists (`.../helt-ledige/arkiv-helt-ledige_kap`, HTTP 200) but a static-HTML scan
  found no `HL060` reference in it — inconclusive, same as `nav-aap`'s archive check, unlike
  `nav-uforetrygd`'s clean one-file-per-year archive. Backfill is deferred, not resolved — see
  `PLAN-014-nav-helt-ledige.md`'s [Q1].
- **`data.norge.no` does not have a cleaner distribution** — same conclusion as every prior NAV
  table, independently re-checked: `HL060` returns zero relevant hits against the real backing
  search API.
- **Licence is CC BY 4.0** — independently confirmed for HL060 specifically (the workbook's own
  first cell states `"Kilde: NAV"` directly), not inherited by assumption from
  `nav-uforetrygd`/`nav-aap`'s own corrections.
- **Two documented trend breaks, carried verbatim, not corrected**: a January 2024 kommune/fylke
  structural reform, and a labour-force-methodology break from November 2018 plus a further one
  from April 2025 — two distinct breaks in the same series. See `manifest.yml`'s
  `methodology_notes`.

## References

- Helt-ledige page: https://www.nav.no/no/nav-og-samfunn/statistikk/arbeidssokere-og-stillinger-statistikk/helt-ledige
- Licence: https://creativecommons.org/licenses/by/4.0/deed.no
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-014-nav-helt-ledige.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-014-nav-helt-ledige.md)
