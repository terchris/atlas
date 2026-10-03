# Plan: Ingest kommune-level Elevundersøkelsen bullying ("mobbing") indicators

Ingests Udir's Elevundersøkelsen (pupil survey) bullying indicator and its three underlying
questions, per kommune per grade (7th and 10th) per school year, as Atlas's second Udir source —
a sharper, annual complement to the existing `fhi-mobbing` 3-year-rolling aggregate.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phases 2-3 DONE, Phase 4 (deploy) pending

**Goal**: Add `udir-elevundersokelsen-mobbing` as a served Atlas source — an annual, per-grade
bullying-prevalence signal at kommune resolution, sharper than `fhi-mobbing`'s 3-year-rolling
7th+10th aggregate. Plugs Report #3 (Youth Outcomes) and strengthens Report #10
(School-Capacity Forecast)'s learning-environment axis.

**Last Updated**: 2026-10-03

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §4 ([Q10]-[Q13]), next in the Tier-1 sequence after `PLAN-014-nav-helt-ledige.md`

**Prerequisites**: None. `udir` is already a valid `publishers.yaml` provider (landed with
`PLAN-010-udir-gsi.md`), `topics.yaml` already has the relevant categories validated, and this
source reuses the exact same `statistikkportalen.udir.no` API client shape `udir-gsi` already
proved out — no new infrastructure, but genuinely new response-shape handling (see Phase 1).

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-03)

Checked live rather than trusting the investigation's description (last touched 2026-05, well
before `udir-gsi` found the real API). **This source's real shape is structurally different from
every prior source this session** — not a NAV-Excel pivot, not an SSB PxWebAPI call, and not even
the same response shape as its own sibling `udir-gsi` despite sharing one client.

### Tasks

- [x] 1.1 Confirm the real API and find the live report. **Confirmed** — same system `udir-gsi`
  already found, `statistikkportalen.udir.no/api/rapportering`. Listed every Rapportside
  (`GET /rest/v1/Rapportside`, 136 report pages total) and found the live bullying report has
  **migrated schemas since the investigation's own framing**: the classic `ElevundersoekelsenG`
  table's own Rapportside (`GSK_EU_mobbing`) is stale — its `filterDefaultVerdier.TidID` is frozen
  at `[201901, 202001, 202101]`. The live, current table is **`EUG`**
  (`GSK_EUG_mobbing`, endpoint `rest/v1/Statistikk/GSK/EUG/5/5`), whose own default year is
  `202512` ("2025-26") — confirmed by fetching both Rapportside definitions directly and comparing,
  not assumed from naming similarity. **Don't reuse the `ElevundersoekelsenG` table name anywhere
  in this source — it is the retired predecessor.**
- [x] 1.2 Confirm available years. **Confirmed** — `filterVerdier` on `TidID` returns five school
  years: `2025-26, 2024-25, 2023-24, 2022-23, 2021-22` (ids `202512, 202412, 202312, 202212,
  202112`). All five are live-queryable today, not an archive-vs-live split like NAV's tables.
- [x] 1.3 **A fundamentally different response shape than `udir-gsi`'s — read this before writing
  a parser.** `udir-gsi`'s `EnhetID` (geography) is the row hierarchy, filtered to kommune depth by
  `radSti`. **For this report, `EnhetID` is a column dimension, not a row.** The row hierarchy is
  `Indikator`/`Spørsmål` (max 2 levels — confirmed by a 400 error when a 3-level `radSti` was
  tried: `"For dyp radsti: for denne rapporten støttes maksimalt 2 nivåer"`). Geography has no
  wildcard-and-filter-by-depth mechanism the way `udir-gsi`'s did:
  - A **wildcarded** `EnhetID` (e.g. `-12.*`, "all of Norway, one level down") returns the **entire
    national column tree in one response** — nested `columns[]` arrays down through
    landet → fylke → kommune → individual school, each carrying a `columnCount` (how many leaf
    columns live under it). Confirmed live: a real response for 2025-26 nests all 17 fylker, then
    every kommune under each, then every individual school under each kommune.
  - A **specific, non-wildcarded** `EnhetID` (e.g. `-720`, Arendal's internal id) collapses the
    response to **exactly one column, labelled "Alle skoler"** — confirmed this is the kommune's
    own aggregate value, not a drill into its schools, by comparing against the all-of-Norway
    response's column structure for the same kommune.
  - **[Q1] resolved 2026-10-03, at the start of Phase 2 — per-kommune calls, deliberately, not the
    bulk decode.** The wildcard tree's leaf columns were never confirmed to contain a distinct
    per-kommune aggregate separate from its individual schools — decoding it without that
    guarantee risks silently extracting a specific school's number as if it were the kommune's,
    exactly the defect class this project's "verified correct, not merely clever" discipline (see
    `udir-gsi`'s own README) exists to avoid. The per-entity-collapse technique is unambiguous
    (`"Alle skoler"` label, cross-checked against the national tree for the same kommune) and
    costs **one HTTP call per region node per grade** — `filterVerdier`'s own `EnhetID` list has
    **351 nivaa-3 nodes** (349 real kommuner + Svalbard's `2100` + `Utlandet, uspesifisert`'s
    `2599` — fewer than the ~357-359 seen in every prior kommune-grain source, because a kommune
    with zero schools reporting into Elevundersøkelsen that year is simply absent from the tree,
    not present-and-suppressed; confirm this distinction with a real row-count check in Phase 2)
    × 2 grades = **~702 calls for one year**, plus 2 setup calls. [Q2]'s scope follows from this:
    latest year only for v1 (all 5 years would be ~3,510 calls — defer backfill, same as every
    annual Udir table's own convention). A deliberate pacing delay between calls is warranted
    given the API's own "not intended for external use" disclaimer — courtesy, not a documented
    rate limit.
- [x] 1.4 Confirm the grade ("Trinn") filter semantics. **Confirmed, and this corrects an
  assumption carried from `udir-gsi`.** `udir-gsi`'s `TrinnID(-10)`/`KommunalitetID(-10)` sentinel
  meant "alle" (all grades/ownership types summed). **For this report, `-10` is NOT a valid "alle"
  sentinel at all** — `TrinnID`'s real `filterVerdier` only lists ids `4`–`9` (grades 5–10), no
  "alle" option. Passing `TrinnID(-10)` did not error; it silently returned the **last** value in
  the report's own default list (`[6, 9]` → grade 10) without flagging anything wrong — caught only
  by cross-checking the result against an explicit `TrinnID(9)` call and finding identical values.
  **This is exactly the kind of silent-wrong-default trap this project's "verify, don't assume"
  discipline exists for.** `TrinnID(6,9)` (comma-joined, guessing at multi-value syntax) returns a
  genuine 400 (`"Ugyldige tegn i filter"`) — there is no single call for "both grades at once";
  v1 must issue one call per grade. Matches `fhi-mobbing`'s own established 7th+10th-grade axis,
  so this is also the natural v1 scope, not an arbitrary restriction.
- [x] 1.5 Confirm the suppression marker. **Confirmed** — literal `"*"`, same convention as every
  other Atlas source this session. Verified on Bykle (Agder, Norway's smallest kommune by
  population): its 10th-grade 2025-26 "Mobbing på skolen" indicator and one of its three questions
  are suppressed (`"*"`), while the other two questions report real `"0,0"` values in the **same**
  response — suppression is per-row, not per-kommune, matching `udir-gsi`'s and every NAV
  source's own per-cell suppression.
- [x] 1.6 **A genuinely new sentinel, not seen in `udir-gsi`: Norwegian schools abroad.** The
  national column tree's top level has two siblings, `"Hele landet"` (id `-12`) and `"Utlandet"`
  (id `-13`, kode `"U"`) — confirmed live, Elevundersøkelsen is answered by Norwegian schools
  operating abroad (e.g. "Den norske skole - Costa Blanca"). Under `Utlandet`'s own
  fylke-equivalent node (kode `"25"` — ⚠️ **the retired pre-2024 Finnmark fylke code**, a real
  collision worth flagging even though fylke-level codes are out of scope for this kommune-grain
  source) sits exactly one kommune-equivalent node: `"Utlandet, uspesifisert"`, **kode `2599`** —
  which matches `classify_region_code`'s existing `^\d{2}99$` `unspecified_within_fylke` branch
  exactly, confirmed by inspection, no new macro branch needed. `udir-gsi`'s own README and
  `parse.ts` never mention this sentinel; not assumed to carry over, checked fresh for this source.
- [x] 1.7 Confirm licence. **NLOD**, confirmed directly on Udir's own data portal
  (`udir.no/om-udir/data/`, which this source shares with `udir-gsi` — same portal, same
  organisation, re-fetched and read for this source rather than assumed to transfer): *"lisens for
  offentlig data (NLOD)."*
- [x] 1.8 Check `data.norge.no` for a cleaner distribution. Not separately re-checked this round —
  `udir-gsi`'s own Phase 1 already established `statistikkportalen.udir.no` as the real, current,
  sole surface for every Udir statistics table including Elevundersøkelsen (confirmed by listing
  every table under schema `GSK`, which includes `EUG`/`ElevundersoekelsenG` alongside `GSI`). No
  reason to expect a different conclusion for this specific table; flagged as inherited, not
  independently re-verified, per this session's own discipline about not assuming licence/surface
  findings transfer silently between sibling sources — if this matters, re-check before shipping.

### Validation

✅ Confirmed 2026-10-03. Real API calls made directly against `statistikkportalen.udir.no` for the
Rapportside definition, filter values, and real data (Arendal and Bykle, both grades, latest year)
— not inferred from `udir-gsi`'s shape or the investigation's five-month-old description.

---

## Open Questions

- **[Q1] Bulk-decode vs per-kommune calls — RESOLVED 2026-10-03, per-kommune calls.** The
  wildcard-and-decode route was never confirmed to carry a distinct per-kommune aggregate leaf
  separate from its individual schools — decoding it on that unverified assumption risks silently
  extracting one school's figure as if it were the kommune's. The per-entity-collapse technique
  (`EnhetID` pinned to one specific id → response collapses to one column labelled `"Alle
  skoler"`) is unambiguous, already cross-checked against the national tree for the same kommune,
  and costs one call per region node per grade: `filterVerdier`'s own `EnhetID` list has 351
  nivaa-3 nodes (349 kommuner + Svalbard's `2100` + `Utlandet, uspesifisert`'s `2599`) × 2 grades
  = **~702 calls for one year** — far more than any prior source. At Phase 1's exploratory pace
  this looked cheap (tens of ms per call); **a real full run (Phase 2) found that assumption
  wrong** — only the first ~22 calls stay fast, every call after settles into a steady ~3.5-6s
  each, for ~60 minutes total wall time. Correctness over call count was still the right call —
  the alternative (bulk-decode) risked a silent misparse, not just a slower run — but the real
  cost of this decision turned out to be wall-clock minutes, not request count.
- **[Q2] Historical backfill — RESOLVED 2026-10-03, latest year only for v1.** Follows directly
  from [Q1]: per-kommune calls make every extra year ~702 more requests (all 5 years would be
  ~3,510). Defer backfill, same convention as every other annual Udir table — revisit if a real
  consumer need for historical Elevundersøkelsen trend data emerges.
- **[Q3] Scope — mobbing only, or fold in trivsel/other Elevundersøkelsen indicator families too?**
  Elevundersøkelsen covers many indicator families (`GSK_EUG_mobbing`, `GSK_EUG_indikator` /
  learning-environment, `GSK_EUG_tema`, and more) under one survey, structurally closer to
  Bufdir's multi-indicator monitors than to NAV's one-indicator-per-source tables.
  **Recommendation: `udir-elevundersokelsen-mobbing` v1 ingests only the bullying indicator
  family** (direct complement to `fhi-mobbing`, the gap this plan is named for) — matching
  Bufdir's own precedent of one source folder per indicator family (`bufdir-barnefattigdom`,
  `bufdir-barnevern`), not one mega-source. A future `udir-elevundersokelsen-trivsel` or similar
  would reuse this exact client.
- **[Q4] GSK (grunnskole) only, or also VGO (videregående)?** `ElevundersoekelsenV`/`EUG`-VGO
  exists under schema `VGO` with the identical mechanism. **Recommendation: GSK only for v1**,
  matching `udir-gsi`'s own grunnskole-only scope — VGO as a natural, cheap follow-up reusing this
  client, not folded in here.
- **[Q5] `region_code` handling for `Utlandet`/`2599`.** See Phase 1.6 — this falls through
  `classify_region_code`'s existing `unspecified_within_fylke` branch cleanly by inspection; verify
  with a real dbt test during Phase 3 rather than assuming the inspection is sufficient, same
  discipline as every prior sentinel this session.
- **[Q6] Presentation sensitivity.** Per-kommune, per-school-year bullying share for minors is
  sensitive in the same way `fhi-mobbing` already is — same `presentation_policy: 'sensitive'`
  consideration as every prior NAV-adjacent source. Not resolved here; a Phase 2/3 decision.

---

## Phase 2: Ingest module + raw table — DONE (verified 2026-10-03)

### Tasks

- [x] 2.1 **[Q1] resolved — per-kommune calls, not bulk-decode.** See Phase 1.3/[Q1]. ~702 calls
  for the latest year (351 region nodes × 2 grades), with a deliberate pacing delay between calls.
- [x] 2.2 Created `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/`: `manifest.yml`,
  `index.ts`, `parse.ts`, `fetch_retry.ts`, `README.md`, `__tests__/` with real captured fixtures
  covering: an ordinary kommune (Arendal, both grades), a suppressed row (Bykle), the
  `Utlandet, uspesifisert`/`2599` sentinel, Svalbard/`2100`, and — found during the first real
  run, not anticipated in Phase 1 — a region/grade pair with **zero rows at all**
  (Hægebostad/`4226`, 10th grade: no 10th-grade cohort reports into this table). 24 tests, all
  passing.
- [x] 2.3 Migration `064_raw_udir_elevundersokelsen_mobbing.sql` — `raw.udir_elevundersokelsen_mobbing(
  region_code, grade, year, measure, measure_label, value, loaded_at)`, PK `(region_code, grade,
  year, measure)`.
- [x] 2.4 Dagster registration — added to `_ANNUAL_SOURCE_IDS`/`OTHER_SOURCES`'s weekly-polled
  group alongside `udir-gsi`, no new job. `dagster definitions validate` passes. Flagged explicitly
  in `raw_other.py`'s own docstring and `schedules.py`'s job description as a real outlier in
  request count and wall time (see Validation below) — not a hang if a weekly poll looks "stuck"
  on this asset for 45-60 minutes.
- [x] 2.5 `ingest:udir-elevundersokelsen-mobbing` npm script added first, verified via
  `check-every-source-has-an-ingest-script.sh` and the real `npm run` invocation.

### Validation

**Real run against the live API, completed 2026-10-03: 702 calls, 2,804 rows written, 60.3
minutes wall time (`duration_ms: 3615723`).** Zero rows silently dropped: 351 regions × 2 grades ×
4 measures = 2,808 expected if every call returned data; the 4-row deficit is exactly the one
confirmed-empty call (Hægebostad/10th grade), verified directly against Postgres — every other
region/grade pair has exactly 4 rows, no partial writes.

**A genuinely new finding, not predicted in Phase 1**: per-call latency was NOT small and fast as
assumed from the Phase 1 exploratory calls — the first ~22 calls returned in 30-45ms, then every
call after that settled into a steady ~3.5-6 seconds each, for the rest of the run. No pattern
found explaining the transition (not fylke-aligned, not a clean request-count threshold). This
changed the real cost of this source from "~702 small/fast calls" (Phase 1's assumption) to "~702
calls, ~60 minutes wall time" — documented prominently in the source's own README and the Dagster
asset docstring so this isn't mistaken for a hang later.

---

## Phase 3: dbt staging and marts — DONE (verified 2026-10-03)

### Tasks

- [x] 3.1 Added `raw.udir_elevundersokelsen_mobbing` to `models/indicators/sources.yml`.
- [x] 3.2 `indicators__udir_elevundersokelsen_mobbing.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code`. **Passed clean on the first `dbt build`**, as
  expected — both sentinels resolved exactly as predicted (see Validation below).
- [x] 3.3 Documented columns in `schema.yml`; `mart_indicators__udir_elevundersokelsen_mobbing.sql`
  api passthrough + `marts/api/schema.yml` entry.
- [x] 3.4 `dbt build --select indicators__udir_elevundersokelsen_mobbing
  mart_indicators__udir_elevundersokelsen_mobbing` against real loaded data —
  `PASS=16 WARN=0 ERROR=0 SKIP=0 TOTAL=16`.

### Validation

Real local Postgres, not an empty schema. Explicitly confirmed by direct query:

```
 region_code | kommune_nr |       region_kind        | count
-------------+------------+---------------------------+-------
 2100        |            | svalbard                  |     8
 2599        |            | unspecified_within_fylke  |     8
```

`2100` resolves to `region_kind='svalbard'` and `2599` resolves to
`region_kind='unspecified_within_fylke'`, both `kommune_nr=NULL`, exactly as predicted — no macro
change needed.

Full dbt check-suite (all 17 scripts), a full `dbt build`, the full ingest test suite (351 tests),
and the website build all pass clean. The only non-pass results in the full build
(`extracted_columns_are_still_populated`, `raw_sources_were_refreshed_recently`, the
`mart_atlas_inventory` SKIP cascade) are the same pre-existing environmental staleness confirmed
unrelated to every prior source this session — `udir_elevundersokelsen_mobbing` does not appear in
either failing test's result set.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled (copied verbatim from the release's own `uis-artifact.json`, not reconstructed),
`LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction stated explicitly.
**Only predict `indicators__udir_elevundersokelsen_mobbing` as a served relation — never a second
`mart_indicators__...` entry, see [[mart-prefix-is-never-a-served-endpoint]] (PLAN-014's own
closing finding).** Independently re-verify against the live public API before closing the deploy
task — do not take a deploy report alone as sufficient.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — Udir's `EUG` table via `statistikkportalen.udir.no`,
  confirmed by direct API calls, not assumed from `udir-gsi`'s shape or the investigation's
  five-month-old description.
- [x] **Licence independently confirmed** — NLOD, re-fetched from Udir's own data portal for this
  source specifically.
- [x] The bulk-decode-vs-per-kommune-calls question ([Q1]) is resolved with evidence, not assumed
  — per-kommune calls, correctness over call count, real cost measured at ~60 minutes wall time.
- [x] `udir-elevundersokelsen-mobbing` ingests cleanly with zero rows silently dropped, including
  the `2100`/`2599` sentinels and at least one suppressed row both represented — 2,804 rows
  written, exactly matching 351 regions × 2 grades × 4 measures minus the one confirmed-empty
  region/grade pair (Hægebostad's 10th grade).
- [x] `indicators__udir_elevundersokelsen_mobbing` and its mart build and test clean against real
  loaded data, with `2100`/`2599` resolving through `classify_region_code` exactly as predicted
  (`PASS=16 WARN=0 ERROR=0`).
- [ ] `udir-elevundersokelsen-mobbing` appears in `meta_sources.served_as` after a real deploy,
  independently verified via live `curl`. *(Phase 4, pending.)*
- [x] Golden-file tests cover: an ordinary kommune, a suppressed row, the `Utlandet` sentinel,
  both grades, and a genuinely-empty region/grade pair (found on the real run, not predicted) —
  24 tests, all passing.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped. *(Will be
  marked shipped at close-out, after Phase 4 verification — same sequencing as every prior
  source.)*

---

## Implementation Notes

- **This source's response shape is NOT `udir-gsi`'s shape, despite sharing one client.**
  Geography is a column dimension here, not a row dimension — do not port `udir-gsi`'s
  depth-filtered-`radSti` approach; it does not apply (confirmed live, a 3-level `radSti` errors).
- **`TrinnID(-10)` is NOT "alle" for this report — it silently resolves to the wrong single grade.**
  Always pass an explicit grade id (`6` = 7th, `9` = 10th); never carry the `-10`-means-"alle"
  assumption from `udir-gsi`/`nav-aap` into a new Udir report without checking that report's own
  `filterVerdier` first.
- **[Q1] resolved — per-kommune calls (~702 for the latest year), not bulk-decode.** The cheaper
  single-call-per-grade route was rejected because it was never confirmed to carry a distinct
  per-kommune aggregate leaf, only individual schools — correctness over call count. **The real
  cost of that call count turned out to be ~60 minutes wall time, not request volume** — only the
  first ~22 calls are fast; every call after settles into a steady ~3.5-6s each, confirmed on the
  real Phase 2 run. Budget for this; it is not a hang.
- **A region/grade pair can be genuinely absent, not suppressed.** Confirmed live on Hægebostad's
  10th grade: zero rows, no column at all for that grade — not predicted in Phase 1, found on the
  first real run. `parse.ts` returns zero rows for this case rather than throwing.
- **One new sentinel confirmed, already has precedent**: `Utlandet`/`2599` → `classify_region_code`'s
  existing `unspecified_within_fylke` branch, no macro change needed — confirmed with a real test
  in Phase 3.

---

## Files to Modify

- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/manifest.yml` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/index.ts` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/parse.ts` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/README.md` (new)
- `atlas-data/ingest/src/sources/udir-elevundersokelsen-mobbing/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:udir-elevundersokelsen-mobbing` script — add this
  BEFORE shipping, verify with the real `npm run` invocation)
- `atlas-data/migrations/<next>_raw_udir_elevundersokelsen_mobbing.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py` or a Udir-specific asset module (registration
  — annual cadence, existing weekly-polled job pattern)
- `atlas-data/dbt/models/indicators/sources.yml`,
  `indicators__udir_elevundersokelsen_mobbing.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_elevundersokelsen_mobbing.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing — bump the count)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
