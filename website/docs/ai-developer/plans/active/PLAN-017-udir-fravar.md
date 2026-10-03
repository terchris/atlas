# Plan: Ingest kommune-level 10th-grade absence (fravær) statistics

Ingests Udir's `GSK_fravaer` ("Fravær i grunnskole") report — median and average days/hours of
documented absence, plus participant count, **for 10th-grade pupils only**, per kommune, for the
latest school year. Atlas's fourth Udir source, and [Q39]'s grunnskole half.
[Q39]'s videregående half (`VGO_fravaer`) is investigated in Phase 1 below and **deliberately
deferred** — its geography does not resolve to kommune at all, a genuinely new problem for Atlas,
not a parsing gap.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phases 1-3 DONE, Phase 4 (deploy) not yet submitted

**Goal**: Add `udir-fravar` as a served Atlas source — kommune-level 10th-grade absence,
Atlas's first annual-absence axis (previously only `fhi-vgs-gjennomforing`'s 3-year completion
rate existed as a dropout-adjacent signal). Plugs Report #3 (Youth Outcomes) per
[Q39]'s own framing.

**Last Updated**: 2026-10-03

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §4 [Q39], next in the Tier-1 Udir sequence after `PLAN-016-udir-nasjonale-prover.md`

**Prerequisites**: None. `udir` is already a valid `publishers.yaml` provider, `topics.yaml`
already has `education` validated, and this source reuses the same `statistikkportalen.udir.no`
client `udir-gsi`/`udir-elevundersokelsen-mobbing`/`udir-nasjonale-prover` already proved out — no
new infrastructure for the GSK half shipped by this plan.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-03)

Checked live rather than trusting [Q39]'s description or assuming either half's shape from a
sibling Udir source. **Mixed news this time: the grunnskole half matches `udir-gsi`'s shape
cleanly; the videregående half does not resolve to kommune at all — a genuinely new problem, not
previously seen in any Udir source this session.**

### Tasks

- [x] 1.1 Find the live reports. **Confirmed** — listed all 136 Rapportside entries
  (`GET /rest/v1/Rapportside`), the same technique `PLAN-016` used. [Q39] names one source but the
  live listing shows it is genuinely **two separate reports**, not one report with a filter:
  `GSK_fravaer` ("Fravær i grunnskole", basePath `rest/v1/Statistikk/GSK/FravaerG/1/1`) and
  `VGO_fravaer` ("Fravær i videregående skole", basePath `rest/v1/Statistikk/VGO/ResultatV/1/3`).
  No "(gammel)" duplicate exists for either — confirmed by re-scanning the full 136-entry list for
  any other `frav`-matching name.
- [x] 1.2 **`GSK_fravaer`'s `EnhetID` IS the row hierarchy, matching `udir-gsi`/
  `udir-nasjonale-prover` — NOT `udir-elevundersokelsen-mobbing`'s column-dimension shape.**
  Confirmed live: `metadata.rowHierarchy` is `["Nasjonalt","Fylke","Kommune","Enhet"]`, and
  `radSti=-12.*.*` returns **371 rows in one call** — 15 fylke (2-segment `id`) + 356 kommune
  (3-segment `id`, including Svalbard `2100`). Same depth-filter-by-segment-count technique as
  `udir-gsi`/`udir-nasjonale-prover` applies directly.
- [x] 1.3 **`VGO_fravaer`'s `EnhetID` hierarchy has NO kommune level at all — a genuinely new
  shape, not previously encountered.** Confirmed live: `metadata.rowHierarchy` is
  `["Nasjonalt","Fylke","Enhet"]`, and `radSti=-12.*` returns exactly **15 rows (fylke only)** —
  the next depth down is individual schools (org numbers, e.g. `"982759846"`), not kommuner.
  This is not a parsing gap: Norway's videregående skoler are organised and owned by
  fylkeskommune, not kommune, and Udir's own `EnhetID` tree reflects that directly. **No
  kommune-level videregående fravær exists in this API at all** — the only path to a kommune
  figure would be aggregating individual schools by their own postal/registered kommune, the same
  `dim_school` crosswalk work `PLAN-010-udir-gsi.md` **[Q2]** already deferred for GSI.
- [x] 1.4 **v1 scope decision: ship `GSK_fravaer` (grunnskole, kommune-resolved) only. Defer
  `VGO_fravaer` explicitly, named as a deviation from [Q39]'s own framing, not silently
  dropped.** Reasons: (a) `VGO_fravaer`'s real resolution is fylke or school, not kommune —
  publishing it at fylke grain would be Atlas's **first fylke-only-resolution indicator relation**,
  confirmed by reading `atlas-data/dbt/check-kommune-marts-exclude-sentinels.sh`, which treats
  every `indicators__`/`mart_indicators__` relation carrying a `kommune_nr` column as
  kommune-grain by construction — no precedent exists for a relation whose grain is fylke; (b)
  publishing it at school grain repeats the exact `dim_school` deferral already made twice
  (`PLAN-010`'s **[Q2]**, this investigation's own **[Q33]**) rather than resolving it. This is a
  **cross-cutting decision** (extends investigation §"D. New geographic resolutions", which only
  anticipated resolution *finer* than kommune, not *coarser*) and does not belong buried inside one
  source's Phase 2 — flagged as its own open question below ([Q4]) rather than decided unilaterally
  here.
- [x] 1.5 Confirm `GSK_fravaer`'s own scope is 10th grade only, not all grunnskole grades.
  **Confirmed, structurally, not just by prose** — `GSK_fravaer`'s own `gyldigeFiltre` list
  (`EierformID, EnhetID, KjoennID, TidID, VisAntallPersoner, VisMaaltall`) carries **no `TrinnID`
  filter at all**; the report's own description text states why: *"Tabellen viser medianen for
  antall dager og timer fravær for elever på 10. trinn, slik det erført på vitnemålet"* (the table
  shows median days/hours of absence for 10th-grade pupils, as recorded on the diploma). This
  measure is structurally defined as 10th-grade-only upstream, not a filter Atlas chose to pin.
- [x] 1.6 Confirm the measure columns. **Confirmed** — requesting both measure-toggle filters at
  once (`VisAntallPersoner(1)_VisMaaltall(1)`) returns **5 columns in a single call**: `Median
  dager`, `Median timer`, `Snitt dager`, `Snitt timer`, `Antall elever` — more than
  `filterVerdier`'s own `VisMaaltall` value list suggested (it names only `"Snitt timer"` as the
  `id:1` option's label; the real response carries all four day/hour statistics plus the
  participant count under that one flag). Comma-decimal (`"9,0"`) and ASCII-space-thousands
  (`"4 277"`) cell shapes, same `parseCell` conventions `udir-nasjonale-prover` already built —
  reused directly, no new parsing logic needed.
- [x] 1.7 Confirm the suppression marker and sentinel codes for `GSK_fravaer`. **Confirmed** —
  literal `*` (same convention as every Atlas source this session), verified on Modalen (fully
  suppressed, all 5 measures). Svalbard (`2100`) present at the same tree depth as genuine
  kommuner, with real data (26 pupils) — same precedent as every prior Udir source, resolves
  through `classify_region_code`'s existing `svalbard` branch, no new macro code needed. Utsira
  entirely **absent** from the row set (not suppressed — the "real absence, not suppression" shape
  `udir-elevundersokelsen-mobbing`/`udir-nasjonale-prover` already found, likely too small a 10th-
  grade cohort to report at all that year).
- [x] 1.8 Confirm `Utlandet`/`2599` for `GSK_fravaer`. **Confirmed present AND carrying real,
  non-suppressed data every year** — same `-13`("Utlandet")→`-34`("25")→`-476`("2599", "Utlandet,
  uspesifisert") chain `udir-nasjonale-prover` found, and the same "carries real data" shape, not
  an empty one. ⚠️ **A real correction, caught at the start of Phase 2, not Phase 1**: this plan
  originally reported `radSti=-13.*.*` as returning 0 rows for this report. That manual test had
  an explicit, conflicting `EnhetID(-12)` filter alongside the `-13.*.*` radSti anchor — an
  invalid combination, not a real empty response. Re-tested without the conflicting filter
  (confirmed live, 65 real pupils for 2024-25) and the real data appeared immediately; the real
  ingest module (which never sets `EnhetID` in the filter string) confirmed this again
  independently on its first real run — `Utlandet` returns 5 real measure rows for every one of
  the 11 backfilled years. **v1 decision unchanged in substance: query the `-13.*.*` anchor every
  run and include it** — it is real, non-suppressed, upstream-published data, same discipline as
  `udir-nasjonale-prover`'s own [Q1]/1.5 decision.
- [x] 1.9 Confirm available years. **Confirmed** — `GSK_fravaer`'s `TidID` lists **11 school
  years** (2014-15 through 2024-25); `VGO_fravaer`'s lists 12 (2013-14 through 2024-25) — far more
  history than `udir-nasjonale-prover`'s 4. ⚠️ **A real correction, caught during Phase 2 start,
  not Phase 1**: this plan originally recommended "latest year only, matching every other annual
  Udir source's convention" — that claim was wrong, found by actually reading `udir-gsi`'s own
  `index.ts` rather than trusting its README's prose. `udir-gsi` does NOT defer backfill — its
  main loop (`for (const year of years)`) issues one data call **per discovered year** and
  ingests all 12, confirmed live (`GSK/GSI/1/8/filterVerdier` really does return 12 `TidID`
  entries, and the shipped row count, 18,816, is consistent with multi-year, not one). The real
  pattern across Udir sources is **backfill fully when the call cost is cheap, defer only when it
  is not** — `udir-elevundersokelsen-mobbing` deferred because of its ~702-call/year cost (a
  real, stated reason), not because of a universal "latest year only" convention; whether
  `udir-nasjonale-prover`'s own "deferred by convention" claim holds up to the same scrutiny is
  not re-litigated here, but not inherited either. **Revised recommendation: backfill all 11
  years for `GSK_fravaer`** — this report's call cost is cheap (2 radSti calls per year, same
  shape as `udir-gsi`), so there is no cost reason to withhold the real history, and `udir-gsi`'s
  own actual behavior is the closer precedent than any sibling's prose claim.
- [x] 1.10 Confirm licence. **NLOD**, same portal (`udir.no/om-udir/data/`) already confirmed
  explicitly for `udir-gsi`/`udir-elevundersokelsen-mobbing` and inherited (not re-fetched a fourth
  time) for `udir-nasjonale-prover` — inherited again here for the identical reason: same portal,
  same organisation, no surface difference to re-check.

### Validation

✅ Confirmed 2026-10-03. Real API calls made directly against `statistikkportalen.udir.no` for
both reports, the full filter-value discovery for both, and real data (Agder's kommuner, Modalen,
Bygland, Beiarn, Svalbard, the Utlandet anchor, and VGO's fylke-level rows) — not inferred from any
sibling Udir source's shape.

---

## Open Questions

- **[Q1] Scope — `GSK_fravaer` only, or wait and ship both halves together?**
  **Recommendation: ship `GSK_fravaer` now, defer `VGO_fravaer`.** The two reports are genuinely
  separate endpoints with genuinely different geography (kommune vs. fylke/school) — there is no
  shared "fravær" dimension table to design once for both, unlike `udir-nasjonale-prover`'s two
  report versions (which shared kommune geography and only differed in valid grades). Waiting on a
  fylke-resolution or `dim_school` decision to ship the grunnskole half, which is ready now, would
  be the same mistake PLAN-014/015/016 explicitly avoided — scope conservatively, ship what's
  real, name the rest as a deviation.
- **[Q2] Source naming.** Should this source still be named `udir-fravar` even though it ships
  only the grunnskole half? **Recommendation: yes, with the manifest `description` stating "10th
  grade, grunnskole only" explicitly** — `udir-sluttet-vgs`/[Q40] is already a separate planned
  source for the videregående dropout signal, so there's no risk of the name implying broader
  scope than what's shipped; a future `VGO_fravaer` ingest (if the fylke/school-grain question
  resolves) would need its own source id anyway given the geography difference, not become a
  second half of this one.
- **[Q3] Measure scope — all 5 columns, or just the headline median?** `Median dager`/`Median
  timer` are what the report's own description foregrounds (and what the diploma itself records);
  `Snitt dager`/`Snitt timer`/`Antall elever` are the same call's free extra columns.
  **Recommendation: all 5** — no extra cost (same single call per kommune), and `Antall elever`
  is needed context for interpreting the other four (a median over 11 pupils reads differently
  than one over 400).
- **[Q3b] Historical backfill — RESOLVED during Phase 2 start, 2026-10-03.** See 1.9's
  correction: back fill all 11 available years, not latest-only. `udir-gsi`'s own real behavior
  (checked by reading its code, not its prose) is cheap-backfill-fully, and `GSK_fravaer`'s call
  cost matches `udir-gsi`'s shape exactly.
- **[Q4] The fylke/school-grain `VGO_fravaer` decision — cross-cutting, not this plan's to
  make.** Flagging for `1PRIORITY.md`/the investigation doc rather than deciding unilaterally:
  does Atlas want to (a) support a fylke-only-resolution indicator relation as a new first-class
  grain (extends investigation §D), (b) build `dim_school` + a school→kommune crosswalk and
  aggregate (same work already deferred twice), or (c) not ship `VGO_fravaer` at all and treat
  [Q39]'s videregående half as answered by `udir-sluttet-vgs`/[Q40] instead (which is VGS-specific
  dropout, a related but not identical signal)? Not resolved here.
- **[Q5] Presentation sensitivity.** Per-kommune 10th-grade absence is a sharp, small-number-prone
  signal (confirmed: Modalen's entire row suppressed, Utsira absent) — same
  `presentation_policy: 'sensitive'` consideration flagged for every prior NAV/Udir source this
  session. Not resolved here; a Phase 2/3 decision.

---

## Phase 2: Ingest module + raw table — DONE (verified 2026-10-03)

### Tasks

- [x] 2.1 Created `atlas-data/ingest/src/sources/udir-fravar/`: `manifest.yml`
  (`source_id: udir-fravar`, `provider: udir`, `periodicity: P1Y`, `license: NLOD`, description
  stating "10th grade, grunnskole only — see [Q2]"), `index.ts`, `parse.ts`, `fetch_retry.ts`
  (copied), `README.md`, `__tests__/` with real captured fixtures covering: an ordinary kommune
  (Agder's Arendal), a fully-suppressed row (Modalen), Svalbard (`2100`), and the `Utlandet`
  anchor's real data (`2599`). 17 tests, all passing.
- [x] 2.2 `parse.ts` — reused `udir-gsi`'s depth-by-segment-count row filter directly (confirmed
  the same shape in Phase 1.2), issuing **2 data calls per year** (`radSti=-12.*.*` +
  `radSti=-13.*.*`, same anchor pair `udir-nasjonale-prover` uses — both carry real data, see
  1.8's correction), looped over **all 11 discovered years** (see 1.9's correction — 22 calls
  total, confirmed live in 6.1s wall time, still cheap, matching `udir-gsi`'s own real
  backfill-fully behavior rather than a "latest year only" convention that turned out not to be
  universal). All 5 measure columns parsed per row; same `parseCell` comma-decimal/space-thousands
  handling as `udir-nasjonale-prover`.
- [x] 2.3 Migration `066_raw_udir_fravar.sql`: `raw.udir_fravar(region_code, year, measure, value,
  loaded_at)` — one row per region/year/measure. No `grade` column, as planned (see 1.5) — this
  source is structurally 10th-grade-only.
- [x] 2.4 Dagster registration — `raw_other.py`/`schedules.py`, annual cadence, existing
  weekly-polled job pattern (same group as the other three Udir sources), no new job.
- [x] 2.5 Added `ingest:udir-fravar` npm script FIRST, verified via
  `check-every-source-has-an-ingest-script.sh` (✓ all 54 ingest source directories covered) and
  the real `npm run ingest:udir-fravar` invocation before any other Phase 2 work, per this
  session's standing discipline since `husbanken-bostotte`'s urb-agents#1807.

### Validation

✅ Confirmed 2026-10-03. Real run against the live API against local scratch Postgres: **22
calls, 21,290 rows written, zero rows silently dropped.** Svalbard (`2100`, real data, present in
6 of 11 years), the Utlandet anchor's real data (`2599`, present in all 11 years), and Modalen's
fully-suppressed row all confirmed against real loaded data, not fixtures alone.

⚠️ **A genuinely important correction, caught during this exact validation step**: Phase 1's own
1.8 finding that the `Utlandet` anchor returns zero rows was WRONG — see 1.8/1.9's corrected
text above. The real ingest module's first live run (which never sets `EnhetID` in its filter
string, unlike the flawed manual Phase 1 test) returned 5 real measure rows for `2599` on every
single one of the 11 years, immediately. Caught before this plan's Phase 3 work began, not
after.

---

## Phase 3: dbt staging and marts — DONE (verified 2026-10-03)

### Tasks

- [x] 3.1 Added `raw.udir_fravar` to `models/indicators/sources.yml`.
- [x] 3.2 `indicators__udir_fravar.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code`. Confirmed against real loaded data:
  `region_code='2100'` → `region_kind='svalbard'`, `kommune_nr` NULL (30 rows, present 6 of 11
  years); `region_code='2599'` → `region_kind='unspecified_within_fylke'`, `kommune_nr` NULL (55
  rows, present every year) — both exactly as predicted, no macro change needed. Clean
  `contents_code` slugs for the 5 measures (`median_dager`/`median_timer`/`snitt_dager`/
  `snitt_timer`/`antall_elever`), same CASE WHEN convention `udir-nasjonale-prover` used.
- [x] 3.3 Documented columns in `models/indicators/schema.yml`; `mart_indicators__udir_fravar.sql`
  api passthrough + `marts/api/schema.yml` entry. `mart_atlas_inventory.sql` depends_on + relation
  list updated; `generate_api_v1.py`'s `SCHEMA_COMMENT` bumped (50→51 total, `udir (3)→udir (4)`).
- [x] 3.4 `dbt build` against real loaded data — clean (14/14 for the targeted build;
  `mart_atlas_inventory` and its full upstream dependency tree also rebuilt clean, confirming
  `indicators__udir_fravar` reports `row_count=21290`, `is_empty=false`,
  `contributing_sources={udir-fravar}`). Full 17-script `atlas-data/dbt/check-*.sh` suite run —
  all 17 pass clean (updated counts: 91 wrappers, 54 sources, 51 fact relations). Full ingest
  test suite (391 tests, 27 files) and `tsc --noEmit` both pass clean. `website/npm run build`
  completes clean, no broken links.

### Validation

✅ Confirmed 2026-10-03. Real local Postgres, not an empty schema. `2100`/`2599` resolution
confirmed with a direct query against the built `marts.indicators__udir_fravar` table, same
discipline as every prior sentinel this session — not assumed from the macro's existing branches
alone.

⚠️ **Two pre-existing, unrelated test failures observed during the full `dbt build` run**
(`extracted_columns_are_still_populated`, `raw_sources_were_refreshed_recently`) — both are
local-scratch-Postgres staleness (most sources in this environment were never loaded, and the
Brreg-enriched jsonb columns were populated once on 2026-09-24 and have gone stale since). Neither
names `udir-fravar` or `udir_fravar` anywhere in their output; isolated by excluding both and
confirming `mart_atlas_inventory` and its full dependency tree then build 100% clean (PASS=1639,
WARN=1 pre-existing dim_postnummer relationship, ERROR=0). Not this plan's defect to fix — a
standing local-environment gap, same class of thing as this session's own
[[local-postgres-for-real-dbt-evidence]] note.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled (copied verbatim from the release's own `uis-artifact.json`, not reconstructed),
`LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction stated explicitly.
**Only predict `indicators__udir_fravar` as a served relation — never a second
`mart_indicators__...` entry, see [[mart-prefix-is-never-a-served-endpoint]].** This source's call
volume (~22 calls total across 11 backfilled years, see 1.9) is cheap, unlike
`udir-elevundersokelsen-mobbing`'s — no "slow run" warning
expected to be needed, but confirm real wall time during Phase 2 before assuming so in the deploy
request (per [[exploratory-calls-dont-reveal-sustained-api-latency]] — do not assume a handful of
Phase 1 probe calls predicts the real cost, even though this source's call count is small enough
that latency variance matters far less than it did for the 702-call sibling). Independently
re-verify against the live public API before closing the deploy task — do not take a deploy report
alone as sufficient.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — Udir's `FravaerG` table via
  `statistikkportalen.udir.no`, confirmed by direct API calls, not assumed from any sibling Udir
  source's shape.
- [x] **The videregående half's genuinely different geography is documented, not silently
  dropped** — `VGO_fravaer` has no kommune-level resolution in this API at all; deferred as [Q4],
  not shipped as a degraded or invented kommune mapping.
- [x] **Licence independently confirmed for this surface** — NLOD, same portal already confirmed
  explicitly earlier this session, inherited consistent with established discipline.
- [ ] `udir-fravar` ingests cleanly with zero rows silently dropped, including the `2100` and
  `2599` sentinels (both carrying real data) and at least one suppressed row all represented.
- [ ] `indicators__udir_fravar` and its mart build and test clean against real loaded data, with
  `2100`/`2599` resolving through `classify_region_code` exactly as predicted.
- [ ] `udir-fravar` appears in `meta_sources.served_as` after a real deploy, independently verified
  via live `curl`.
- [ ] Golden-file tests cover: an ordinary kommune, a suppressed row, Svalbard, and the Utlandet
  anchor's real data.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, with [Q4]
  (the fylke/school-grain `VGO_fravaer` decision) carried forward explicitly as still open.

---

## Implementation Notes

- **One source id, one report, one geography.** `GSK_fravaer` only — `VGO_fravaer` is a different
  report with a genuinely different, non-kommune geography; do not fold it into this source later
  without re-reading [Q1]/[Q4] first.
- **This report's `EnhetID` is a row hierarchy, like `udir-gsi`/`udir-nasjonale-prover` — confirmed
  fresh via `rowHierarchy` in the response metadata, not inherited by assumption.**
- **The `Utlandet`/`-13` anchor carries real, non-suppressed data every year** — the opposite of
  this plan's own original Phase 1 finding, which was a buggy manual test (an explicit,
  conflicting `EnhetID(-12)` filter alongside the `-13.*.*` radSti anchor). Corrected at the start
  of Phase 2; see 1.8.
- **No new Dagster job.** Same weekly-polled group as the other three Udir sources.
- **This source is structurally 10th-grade-only** — not a filtered slice Atlas chose, Udir's own
  `FravaerG` table has no other grade to select. Do not add a `grade` column that would imply
  otherwise.
- **Backfills all 11 available years, not latest-only** — a correction made at the start of
  Phase 2 (see 1.9): `udir-gsi`'s real behavior (checked in its code) backfills fully when the
  call cost is cheap, and this report's cost matches. Real call volume is cheap (~22 calls total)
  — verify this holds in Phase 2, don't assume it from Phase 1's sample, per
  [[exploratory-calls-dont-reveal-sustained-api-latency]].

---

## Files to Modify

- `atlas-data/ingest/src/sources/udir-fravar/manifest.yml` (new)
- `atlas-data/ingest/src/sources/udir-fravar/index.ts` (new)
- `atlas-data/ingest/src/sources/udir-fravar/parse.ts` (new)
- `atlas-data/ingest/src/sources/udir-fravar/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/udir-fravar/README.md` (new)
- `atlas-data/ingest/src/sources/udir-fravar/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:udir-fravar` script — add this BEFORE shipping, verify
  with the real `npm run` invocation)
- `atlas-data/migrations/066_raw_udir_fravar.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (registration — annual
  cadence, existing weekly-polled job pattern)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__udir_fravar.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_fravar.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing — bump the count)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  `GSK_fravaer` shipped, carry [Q4]/`VGO_fravaer` forward as still open)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
