# nav-aap

NAV **AAP155** — arbeidsavklaringspenger (work-assessment allowance, a transitional benefit paid
while NAV assesses someone's capacity for work) recipients, count and share of the population, per
kommune, **monthly**. Atlas's second NAV source and second monthly-cadence source.

## What the script does

1. `GET` [the AAP sub-page](https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/arbeidsavklaringspenger) and extract the live AAP155 xlsx download path — a real `<a href="/_/attachment/inline/<uuid>:<hash>/AAP155...xlsx">` anchor directly in the server-rendered HTML, re-resolved every run since the hash changes with every release.
2. Download that one workbook directly — no ZIP.
3. Parse the `"1. Kommune. Antall"` and `"2. Kommune. Andel"` sheets.
4. **Replace** `raw.nav_aap` on each run (`DELETE` then batched `INSERT … ON CONFLICT …`).
5. Mirror rows to `atlas-data/ingest/output/nav-aap.ndjson`.

## The file shape — read this before touching `parse.ts`

Verified live 2026-10-02 (`PLAN-012-nav-aap.md` Phase 1). **Simpler than `nav-uforetrygd`'s
PST302** — no fylke-only sheet, no bydel nesting, no row-order inconsistency. Each sheet is a
repeating group, once per fylke:

```
B7:  (blank) | Januar | Februar | ... | August   ← month-name header row (repeats per fylke block)
B8:  "I alt 03 Oslo - Oslove" | 22311 | ...        ← fylke rollup, "I alt <2-digit> <name>" — skipped
B9:  "0301 Oslo - Oslove" | 22311 | ...            ← the one kommune in this fylke, real values
B12: "I alt 11 Rogaland" | 14140 | ...             ← next fylke rollup — skipped
B13: "1101 Eigersund" | 436 | ...                  ← ordinary kommune, real values
B14: "1103 Stavanger" | 3847 | ...                 ← an ordinary kommune row — NO bydel children
...
B410: "I alt Ukjent" | 1528 | ...                  ← a 16th "fylke" with no numeric code — skipped
B411: "Ukjent" | 1528 | ...                        ← NAV's own unknown-region bucket — KEPT
```

`parse.ts` was written fresh for this table, **not adapted from `nav-uforetrygd`'s parser** — that
table's fylke-sheet duplicate, bydel nesting and Oslo/Stavanger row-order inconsistency don't exist
here, so porting its parser would import complexity this one doesn't have. Every row is classified
by its label alone: a 4-digit leading code is a kommune, the exact literal `"Ukjent"` is the
unknown-region bucket, anything else (`"I alt ..."` rollups, headers) is skipped.

`region_kind` is **not** derived in the ingest — that's `classify_region_code`'s job at the dbt
layer, same convention as every other Atlas source. `Ukjent` has no numeric code at all, so it
falls through that macro's digit-based branches to its existing `unknown` kind — no macro change
needed.

## Known quirks / fragility

- **`Ukjent` exists only in the Antall sheet, not Andel.** Confirmed live: zero mentions of
  "Ukjent" anywhere in `"2. Kommune. Andel"` — NAV omits it entirely from the share sheet,
  presumably because there's no population denominator to compute a share against for a
  non-geographic bucket. 358 regions in Antall, 357 in Andel. Not a parsing defect — see
  `parse.ts`'s module header and the golden-file test that pins this exact asymmetry.
- **Suppression marker is `*`** — same convention as `nav-uforetrygd`. The workbook's own
  methodology sheet states the exact rule: any cell representing fewer than 4 people, per
  Statistikklovens § 2-6 — more precise than most sources' vague "small cell" wording.
- **Cells are native numeric**, not Norwegian-decimal-comma strings — `parseCell`'s comma-replace
  is defensive, not required by anything observed.
- **One year per file.** The live file is replaced in place as the current year progresses. Unlike
  `nav-uforetrygd`'s PST302, **no historical archive was found for this table** — checked
  `nav.no/.../arkiv-mottakere-av-arbeidsavklaringspenger-aap` directly (both the static HTML and
  its own `__NEXT_DATA__` blob) and found zero references to AAP155 there. Backfill is genuinely
  unresolved, not just deferred by convention — see `PLAN-012-nav-aap.md`'s [Q2].
- **`data.norge.no` does not have a cleaner distribution** — same conclusion as `nav-uforetrygd`,
  independently re-checked: `AAP155` returns zero relevant hits against the real backing search
  API.
- **Licence is CC BY 4.0** — independently re-confirmed for AAP specifically (fetched NAV's general
  statistics-practices page directly), not inherited by assumption from `nav-uforetrygd`'s own
  2026-10-01 correction.

## References

- AAP page: https://www.nav.no/no/nav-og-samfunn/statistikk/aap-nedsatt-arbeidsevne-og-uforetrygd-statistikk/arbeidsavklaringspenger
- Licence: https://creativecommons.org/licenses/by/4.0/deed.no
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-012-nav-aap.md`](../../../../../website/docs/ai-developer/plans/active/PLAN-012-nav-aap.md)
