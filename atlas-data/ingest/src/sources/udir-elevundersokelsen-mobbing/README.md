# udir-elevundersokelsen-mobbing

Udir **Elevundersøkelsen** — the annual nationwide pupil survey on school/learning environment —
bullying ("mobbing") indicator and its three underlying questions, per kommune, per grade (7th and
10th), for the latest school year. Atlas's second Udir source, reusing the same
`statistikkportalen.udir.no` client `udir-gsi` already proved out — but a genuinely different
response shape and query pattern.

## What the script does

1. `GET` the `GSK_EUG_mobbing` Rapportside to resolve the live report version and current year —
   never hardcoded (Udir's report versions advance; the classic predecessor table, `GSK_EU_mobbing`
   / `ElevundersoekelsenG`, is retired — its own `filterDefaultVerdier.TidID` is frozen pre-2021).
2. `GET` `filterVerdier` once to discover every valid school year AND the full national list of
   "kommune-equivalent" region nodes (confirmed live: **351**, not the ~357-359 seen in every
   other kommune-grain source — see "Known quirks" below).
3. For the **latest school year only** (see "Known quirks" — backfill deferred), for **each of the
   351 region nodes** × **each of 2 grades** (7th, 10th): `GET` the data endpoint with that one
   region's internal `EnhetID` pinned (not wildcarded) and that one grade's `TrinnID` pinned — this
   collapses the response to exactly one column, the region's own aggregate across all its schools.
   **~702 calls for one run.**
4. **Replace** `raw.udir_elevundersokelsen_mobbing` on each run (`DELETE` then batched
   `INSERT … ON CONFLICT …`), same convention as every other source this project.
5. Mirror rows to `atlas-data/ingest/output/udir-elevundersokelsen-mobbing.ndjson`.

## The real API shape — read this before touching `parse.ts`

Verified live 2026-10-03 (`PLAN-015-udir-elevundersokelsen-mobbing.md` Phase 1/2). **This is NOT
`udir-gsi`'s shape, despite sharing one client.** `udir-gsi`'s `EnhetID` (geography) IS its row
hierarchy — `radSti` drills it to kommune depth, one call returns every kommune for one year. For
this report, `rowHierarchy` is `["Indikator","Spørsmål"]` — a 3-level `radSti` on that axis errors
("maksimalt 2 nivåer"). `EnhetID` here is a pure filter/column dimension:

- A **wildcarded** `EnhetID` returns the entire national column tree nested
  fylke→kommune→school in one response — but whether a kommune's own aggregate is a distinct leaf
  inside that tree, separate from its individual schools, was **never confirmed**. Decoding it on
  that unverified assumption risks silently extracting one school's figure as the kommune's.
- A **specific, non-wildcarded** `EnhetID` collapses the response to **exactly one column,
  labelled `"Alle skoler"`** — confirmed live this is the region's own aggregate, by comparing
  against the national tree's column structure for the same region. **This source uses this
  technique exclusively** (`PLAN-015`'s **[Q1]**, resolved in favour of correctness over call
  count).

`parse.ts` was written fresh for this report — not adapted from `udir-gsi`'s parser, which solves
a structurally different problem (row-hierarchy depth filtering, not per-entity collapse).

## Known quirks / fragility

- **~702 HTTP calls per run, and real latency is highly variable — tens of minutes, not seconds.**
  Confirmed live 2026-10-03: the first ~11 kommunes returned in 30-45ms each; every call after that
  settled into a steady ~5-6 seconds each, with no clean pattern explaining the transition (not
  fylke-aligned, not request-count-threshold-aligned in any way found). **Budget 45-60+ minutes
  wall time for one real run.** This is the single biggest practical cost of this source — see
  `atlas-data/dagster/atlas_data/assets/raw_other.py`'s own note on it. A weekly-polled annual
  source taking this long is unusual in this codebase but not a bug; do not add concurrency to
  "fix" it — the API's own Swagger doc says it is "ikke ment for ekstern bruk i dag" (not intended
  for external use today), and firing concurrent requests at something already this slow is more
  likely to look like abuse than to help.
- **No "all grades" sentinel.** `TrinnID`'s real `filterVerdier` only lists ids `4`-`9` (grades
  5-10) — no "alle" option, unlike `udir-gsi`'s `KommunalitetID(-10)`. Passing `-10` does not
  error; it silently returns the grade filter's own default list's last member without flagging
  anything — caught only by cross-checking against an explicit grade id. `parse.ts` cross-checks
  the response's own column label against the requested grade on every call for exactly this
  reason. `TrinnID(6,9)` (both grades in one call) is a genuine 400 — one call per grade, matching
  `fhi-mobbing`'s own established 7th+10th-grade axis (also why that's this source's v1 scope).
- **A region/grade pair can be genuinely ABSENT, not suppressed — confirmed live on Hægebostad
  (kommune 4226).** It has real 7th-grade data (suppressed, `*`) but **zero** 10th-grade data —
  `{"metadata":{"columns":[]},"rows":[]}`, no column for "10. årstrinn" at all. The kommune's
  schools simply have no qualifying 10th-grade cohort in this survey/year. `parse.ts` returns zero
  rows for this case (no row written), distinct from suppression (a row exists, value is `*`).
- **Suppression marker is `*`** — same convention as `udir-gsi`/`nav-uforetrygd`/every NAV source
  this session. Confirmed live on Bykle (Norway's smallest kommune) and on Svalbard, both fully
  suppressed for 10th grade; suppression is per-row, not per-kommune — a kommune's composite
  indicator can be suppressed while one of its own underlying questions is not, in the same
  response.
- **351 region nodes, not ~357-359.** Elevundersøkelsen's own `EnhetID` tree only includes a
  kommune if at least one of its schools reports into this table that year — a kommune with
  nothing to report at all is absent from the tree, not present-and-suppressed.
- **Two sentinels, one shared with `udir-gsi`, one genuinely new.** `2100` (Svalbard) sits at the
  same tree depth as a real kommune — matches `udir-gsi`'s own finding, resolves via
  `classify_region_code`'s existing svalbard branch. `2599` ("Utlandet, uspesifisert" — Norwegian
  schools abroad, reporting under the fylke-level sibling `"Utlandet"`, kode `"25"`, ⚠️ the retired
  pre-2024 Finnmark fylke code) is **not** in `udir-gsi` — resolves via `classify_region_code`'s
  existing `unspecified_within_fylke` (`^\d{2}99$`) branch. Neither needed a macro change.
- **Stable codes at the measure level, unlike `udir-gsi`.** This report's API provides both `kode`
  (e.g. `EUIndeks_1398`) and `navn` (the real survey question text) per row — `measure` stores the
  code, `measure_label` the text. `udir-gsi` only ever had a label.
- **Historical backfill deliberately deferred — a direct consequence of [Q1], not a convention
  carried from elsewhere.** All 5 available years (2021-22 through 2025-26) are equally
  live-queryable, but each extra year multiplies the ~702-call cost linearly (all 5 would be
  ~3,510 calls). v1 ingests the latest year only.
- **Licence is NLOD** — re-confirmed directly on Udir's own data portal (`udir.no/om-udir/data/`),
  the same portal `udir-gsi` already confirmed NLOD on; re-fetched and read for this source rather
  than assumed to transfer.

## References

- Elevundersøkelsen page: https://www.udir.no/tall-og-forskning/statistikk/elevundersokelsen/
- Rapportside: https://statistikkportalen.udir.no/api/rapportering/rest/v1/Rapportside/GSK_EUG_mobbing
- Swagger: https://statistikkportalen.udir.no/api/rapportering/swagger/v1/swagger.json
- Licence: https://data.norge.no/nlod/no/2.0
- Shared helpers: `atlas-data/ingest/src/lib/postgres.ts`, `atlas-data/ingest/src/lib/output.ts`, `atlas-data/ingest/src/lib/ingest_run.ts`
- Plan: [`PLAN-015-udir-elevundersokelsen-mobbing.md`](../../../../../website/docs/ai-developer/plans/completed/PLAN-015-udir-elevundersokelsen-mobbing.md)
