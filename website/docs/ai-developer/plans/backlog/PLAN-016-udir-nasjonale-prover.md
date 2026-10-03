# Plan: Ingest kommune-level Nasjonale prøver (national test) results

Ingests Udir's Nasjonale prøver (national tests) scale-score results, uncertainty margin, and
participant count, per kommune, per grade (5th, 8th, 9th), per subject (engelsk/lesing/regning),
for the latest school year — Atlas's third Udir source and its first direct learning-outcome
signal.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — Phase 1 complete, ready to move to active/ for Phase 2

**Goal**: Add `udir-nasjonale-prover` as a served Atlas source — the only direct learning-outcome
measurement in Atlas today, at kommune resolution, per grade and subject. Plugs Report #3 (Youth
Outcomes) with the one signal that section's own framing named and no prior Udir source covers.

**Last Updated**: 2026-10-03

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §4, next in the Tier-1 Udir sequence after `PLAN-015-udir-elevundersokelsen-mobbing.md`

**Prerequisites**: None. `udir` is already a valid `publishers.yaml` provider, `topics.yaml`
already has `education` validated, and this source reuses the same `statistikkportalen.udir.no`
client `udir-gsi`/`udir-elevundersokelsen-mobbing` already proved out — no new infrastructure.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-03)

Checked live rather than trusting the investigation's description or assuming this report's shape
from either sibling Udir source. **Good news this time: this report's shape matches `udir-gsi`'s,
not `udir-elevundersokelsen-mobbing`'s** — confirmed explicitly, not assumed from either precedent.

### Tasks

- [x] 1.1 Find the live reports. **Confirmed** — listed all 136 Rapportside entries
  (`GET /rest/v1/Rapportside`) and found Nasjonale prøver spans **two separate report versions
  under the same `NasjonaleProever` table name**: `GSK_NP_Geografisk` ("Nasjonale prøver
  ungdomstrinn", basePath `rest/v1/Statistikk/GSK/NasjonaleProever/1/1`, covers 8th+9th grade) and
  `GSK_NP_Geo_Trinn5` ("Nasjonale prøver 5. trinn", basePath
  `rest/v1/Statistikk/GSK/NasjonaleProever/4/1`, covers 5th grade only — note the differing
  version number, `4` not `1`, for the same table name). Both must be queried; they are not the
  same endpoint with a different filter.
- [x] 1.2 **`EnhetID` IS the row hierarchy here, like `udir-gsi` — NOT a column/filter dimension
  like `udir-elevundersokelsen-mobbing`.** Confirmed live: the data response's own
  `metadata.rowHierarchy` is `["Nasjonalt","Fylke","Kommune","Enhet"]`, and `radSti=-12.*.*`
  returns **both fylke (15 rows, 2-segment `id`) and kommune (356 rows, 3-segment `id`) in one
  call** — the exact `udir-gsi` pattern (depth-filter by counting `id` segments, keep depth 3).
  **Do not assume either prior Udir source's shape for a new report without checking
  `rowHierarchy` directly** — this is the third distinct shape found across three Udir sources
  this session (`udir-gsi`: EnhetID-is-rows; `udir-elevundersokelsen-mobbing`: EnhetID-is-columns;
  this one: EnhetID-is-rows again, confirmed independently, not inherited from `udir-gsi` by
  assumption).
- [x] 1.3 Confirm the grade × subject matrix. **Confirmed, and genuinely asymmetric** — the
  report's own description states it plainly: *"Tabellen viser resultater for nasjonale prøver i
  engelsk, lesing og regning på 8. trinn, og lesing og regning på 9. trinn"* (English, reading and
  numeracy for 8th grade; reading and numeracy only for 9th — no English test at 9th). Verified
  live: `TrinnID(8)_ProevetypeID(Engelsk)` returns a genuinely empty response
  (`{"columns":[],"rows":[]}`), the same "real absence, not suppression" shape
  `udir-elevundersokelsen-mobbing` found on Hægebostad. 5th grade (separate endpoint) has all
  three subjects. **Valid combinations for v1: 8 total** — 5th grade × 3 subjects (engelsk,
  lesing, regning) + 8th grade × 3 subjects + 9th grade × 2 subjects (lesing, regning only).
- [x] 1.4 Confirm available years. **Confirmed** — `SkoleAarID` lists 4 school years: `2022-23`
  through `2025-26`, both report versions agree. The report's own text states why there's no
  earlier data: *"Den 13. november 2025 ble resultatene fra før 2022 fjernet i statistikkbanken"*
  (results from before 2022 were removed from the statistics bank on 2025-11-13) — matches the
  investigation's own "2022→ resumed" framing exactly, now with the precise removal date and
  upstream's own stated reason (not Atlas's own backfill decision — the data genuinely doesn't
  exist upstream before 2022).
- [x] 1.5 **A genuinely new finding, not seen in either prior Udir source: a second, separate
  radSti anchor is needed to reach the `Utlandet` sentinel.** `udir-gsi`'s and
  `udir-elevundersokelsen-mobbing`'s own research only ever anchored at `-12` ("Hele landet").
  Here, `Utlandet` (schools abroad) is confirmed to carry **real, non-empty data** —
  `{"navn":"Utlandet","kode":"25","data":["47","2,0","73"]}` /
  `{"navn":"Utlandet, uspesifisert","kode":"2599","data":["47","2,0","73"]}`, 73 real pupils. But
  `Utlandet` sits under its own top-level node (`id -13`), a **sibling** of `Hele landet` (`id
  -12`), not a descendant — `radSti=-12.*.*` does NOT reach it (confirmed live: `2599` absent from
  that call's 371 rows). A second call per combination, `radSti=-13.*.*`, is required to capture
  it. **v1 scope decision: include it** — it is real, non-suppressed, upstream-published data,
  and dropping it would violate this project's "never pre-emptively omit published data" rule.
  This doubles the real call count from 8 to 16 for one year, still far cheaper than
  `udir-elevundersokelsen-mobbing`'s ~702.
- [x] 1.6 Confirm the suppression marker and sentinel codes. **Confirmed** — literal `*`, same
  convention as every Atlas source this session; verified on Bygland and Utsira (both fully
  suppressed for 5th-grade lesing), while Bykle reports real data for the same table (13
  participants, above threshold this time — small-kommune suppression is per-cohort-size, not a
  blanket per-kommune rule). **Both prior Udir sentinels confirmed present**: Svalbard (`2100`,
  reachable via the `-12.*.*` anchor, same tree depth as `udir-gsi`'s own finding) and `Utlandet,
  uspesifisert` (`2599`, only reachable via the `-13.*.*` anchor — see 1.5). Both already resolve
  through `classify_region_code`'s existing `svalbard` and `unspecified_within_fylke` branches —
  no new macro code needed, confirmed by inspection (not yet by a real dbt test — that's Phase 3).
- [x] 1.7 Confirm the three measure columns. **Confirmed** — `Skalapoeng` (scale score, the test
  result itself; plain integers in every sample seen), `Usikkerhet` (uncertainty/margin of error;
  Norwegian decimal comma, e.g. `"0,3"`), `Antall elever deltatt` (participant count; plain ASCII
  space as a thousands separator, e.g. `"6 640"` — confirmed byte-by-byte, not a non-breaking
  space, so a simple whitespace-strip suffices, same technique `udir-gsi`'s own `parseCell`
  already uses). No stable measure *code* is exposed for these three columns (unlike
  `udir-elevundersokelsen-mobbing`'s `EUIndeks_*`/`EUSpoersmaal_*` codes) — only the column label,
  same shape as `udir-gsi`'s own measure columns.
- [x] 1.8 Confirm licence. **NLOD**, same portal (`udir.no/om-udir/data/`) already confirmed twice
  this session for `udir-gsi` and `udir-elevundersokelsen-mobbing` — re-confirmed as applying here
  by virtue of being the identical portal and organisation, not re-fetched a third time (this
  session's own discipline is to re-check when the surface differs; this is the same surface).
- [x] 1.9 Check `data.norge.no` for a cleaner distribution. Not separately re-checked —
  `udir-gsi`'s own Phase 1 already established `statistikkportalen.udir.no` as the sole real
  surface for every Udir statistics table including `NasjonaleProever` specifically (named in that
  source's own table listing). No reason to expect a different conclusion; flagged as inherited,
  not independently re-verified, same discipline as `udir-elevundersokelsen-mobbing`'s own 1.8.

### Validation

✅ Confirmed 2026-10-03. Real API calls made directly against `statistikkportalen.udir.no` for
both report versions, the full filter-value discovery, and real data (Agder's kommuner, Bykle,
Bygland, Utsira, Svalbard, Utlandet, the empty 9th-grade-English case) — not inferred from either
sibling Udir source's shape.

---

## Open Questions

- **[Q1] Scope — one source for all three grades, or split by grade/version?** The two report
  versions (ungdomstrinn vs. 5th trinn) are genuinely separate endpoints, but both feed the same
  conceptual dataset (Nasjonale prøver scale scores) and share every dimension except which grades
  are valid. **Recommendation: one source, `udir-nasjonale-prover`**, with `grade` as a dimension
  spanning all three values (5, 8, 9) — closer to `udir-gsi`'s single-source-many-measures shape
  than to `udir-elevundersokelsen-mobbing`'s one-indicator-family-per-source split, since there is
  no separate "family" here, just two endpoints for the same measurement at different grades.
- **[Q2] Include `VisMestringsnivaafordeling` (proficiency-level distribution) as well as
  `Skalapoeng`?** The report can alternatively express results as a 3-level proficiency
  distribution (percentage of pupils at low/middle/high mastery) instead of, or alongside, the
  scale-score average. **Recommendation: `Skalapoeng` only for v1** — the simplest complete slice,
  matching `udir-gsi`'s own precedent of choosing the grand-total slice over the full cross-tab.
  Proficiency-level distribution is the same API with `VisMestringsnivaafordeling(1)`, a cheap
  follow-up if a consumer asks for it, not a new acquisition problem.
- **[Q3] Historical backfill.** All 4 available years (2022-23 through 2025-26) are equally
  live-queryable at the same low per-year cost (16 calls/year) — unlike
  `udir-elevundersokelsen-mobbing`, where backfill was deferred specifically because of call
  volume. **Recommendation: latest year only for v1 anyway**, matching every other annual Udir
  source's convention — revisit if a real consumer need for a 4-year trend emerges; the low
  marginal cost means this would be cheap to add later, not a reason to do it now without a named
  need.
- **[Q4] `region_code` handling for `2100`/`2599`.** Both already have exact precedent in
  `classify_region_code` (confirmed by inspection in Phase 1.6) — verify with a real dbt test in
  Phase 3 rather than assuming the inspection is sufficient, same discipline as every prior
  sentinel this session.
- **[Q5] Presentation sensitivity.** Per-kommune national-test scale scores are a sharper, more
  directly comparable "school quality" signal than anything Atlas has ingested from Udir so far —
  likely to be read as a kommune/school ranking. Same `presentation_policy: 'sensitive'`
  consideration flagged for every prior NAV/Udir source this session. Not resolved here; a Phase
  2/3 decision.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/udir-nasjonale-prover/`: `manifest.yml`
  (`source_id: udir-nasjonale-prover`, `provider: udir`, `periodicity: P1Y`, `license: NLOD`),
  `index.ts`, `parse.ts`, `fetch_retry.ts` (copied), `README.md`, `__tests__/` with real captured
  fixtures covering: an ordinary kommune (Arendal or similar) at 5th/8th/9th grade, a suppressed
  row (Bygland or Utsira), Svalbard (`2100`), `Utlandet, uspesifisert` (`2599`, via the `-13.*.*`
  anchor), and the genuinely-empty 9th-grade-English case.
- [ ] 2.2 `parse.ts` — reuse `udir-gsi`'s depth-by-segment-count row filter directly (confirmed
  the same shape in Phase 1.2), extended to issue **16 data calls for one year** (8 valid
  grade×subject combinations × 2 radSti anchors, `-12.*.*` and `-13.*.*` — see [Q1]/Phase 1.5),
  merging the two anchors' results per combination. Parse all three measure columns
  (`Skalapoeng`/`Usikkerhet`/`Antall elever deltatt`) per row.
- [ ] 2.3 Migration `raw.udir_nasjonale_prover(region_code, grade, subject, year, measure, value,
  loaded_at)` — one row per region/grade/subject/year/measure.
- [ ] 2.4 Dagster registration — annual cadence, existing weekly-polled job pattern (same group as
  `udir-gsi`/`udir-elevundersokelsen-mobbing`), no new job.
- [ ] 2.5 Add `ingest:udir-nasjonale-prover` npm script FIRST, verify via
  `check-every-source-has-an-ingest-script.sh` and the real `npm run` invocation before any other
  Phase 2 work, per this session's standing discipline since `husbanken-bostotte`'s urb-agents#1807.

### Validation

Real run against the live API, zero rows silently dropped, suppression, both sentinels, and the
empty 9th-grade-English case all confirmed against real data.

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.udir_nasjonale_prover` to `models/indicators/sources.yml`.
- [ ] 3.2 `indicators__udir_nasjonale_prover.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code`. Explicitly confirm `2100` and `2599` resolve
  to `svalbard`/`unspecified_within_fylke` against real loaded data (see [Q4]) — expect this to
  pass clean, but confirm rather than assume.
- [ ] 3.3 Document columns in `schema.yml`; `mart_indicators__udir_nasjonale_prover.sql` api
  passthrough + `marts/api/schema.yml` entry.
- [ ] 3.4 `dbt build` against real loaded data.

### Validation

Real local Postgres, not an empty schema. Explicitly confirm `2100`/`2599` resolution with a
direct query, same discipline as every prior sentinel this session.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session — name exact relations, both image
digests labelled (copied verbatim from the release's own `uis-artifact.json`, not reconstructed),
`LANDS WITH` derived via `atlas-data/uis/lands-with.sh`, a row-count prediction stated explicitly.
**Only predict `indicators__udir_nasjonale_prover` as a served relation — never a second
`mart_indicators__...` entry, see [[mart-prefix-is-never-a-served-endpoint]] (PLAN-014's own
closing finding).** This source's call volume (~16 calls) is cheap, unlike
`udir-elevundersokelsen-mobbing`'s — no "slow run" warning expected to be needed, but confirm real
wall time during Phase 2 before assuming so in the deploy request (per
[[exploratory-calls-dont-reveal-sustained-api-latency]] — do not assume a handful of Phase 1 probe
calls predicts the real cost). Independently re-verify against the live public API before closing
the deploy task — do not take a deploy report alone as sufficient.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — Udir's `NasjonaleProever` table via
  `statistikkportalen.udir.no`, confirmed by direct API calls for both report versions, not
  assumed from either sibling Udir source's shape.
- [x] **Licence independently confirmed for this surface** — NLOD, same portal already confirmed
  twice this session.
- [ ] `udir-nasjonale-prover` ingests cleanly with zero rows silently dropped, including the
  `2100`/`2599` sentinels, the genuinely-empty 9th-grade-English case, and at least one suppressed
  row all represented.
- [ ] `indicators__udir_nasjonale_prover` and its mart build and test clean against real loaded
  data, with `2100`/`2599` resolving through `classify_region_code` exactly as predicted.
- [ ] `udir-nasjonale-prover` appears in `meta_sources.served_as` after a real deploy,
  independently verified via live `curl`.
- [ ] Golden-file tests cover: an ordinary kommune at each grade, a suppressed row, both
  sentinels, and the genuinely-empty grade×subject case.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped.

---

## Implementation Notes

- **Two separate report versions feed one conceptual dataset — query both, under one source.**
  `GSK_NP_Geografisk` (8th/9th) and `GSK_NP_Geo_Trinn5` (5th) are genuinely different endpoints
  (`NasjonaleProever/1/1` vs. `NasjonaleProever/4/1`), not the same endpoint with a different
  filter — see [Q1].
- **This report's `EnhetID` is a row hierarchy, like `udir-gsi` — do not assume
  `udir-elevundersokelsen-mobbing`'s column-dimension shape carries over.** Checked fresh via
  `rowHierarchy` in the response metadata, not inherited from either sibling.
- **A second radSti anchor (`-13.*.*`) is required to reach `Utlandet`/`2599` — `udir-gsi` never
  needed this because its own data has no schools-abroad entries at all; do not assume a single
  `-12.*.*` call is complete for every Udir report.**
- **No new Dagster job.** Same weekly-polled group as `udir-gsi`/`udir-elevundersokelsen-mobbing`.
- **Two sentinels, both already have exact precedent** — confirm with a real test in Phase 3
  anyway, same discipline as every prior source.
- **Real call volume is cheap (~16/year) — verify this holds, don't assume it from the Phase 1
  sample size**, per [[exploratory-calls-dont-reveal-sustained-api-latency]].

---

## Files to Modify

- `atlas-data/ingest/src/sources/udir-nasjonale-prover/manifest.yml` (new)
- `atlas-data/ingest/src/sources/udir-nasjonale-prover/index.ts` (new)
- `atlas-data/ingest/src/sources/udir-nasjonale-prover/parse.ts` (new)
- `atlas-data/ingest/src/sources/udir-nasjonale-prover/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/udir-nasjonale-prover/README.md` (new)
- `atlas-data/ingest/src/sources/udir-nasjonale-prover/__tests__/` (new)
- `atlas-data/ingest/package.json` (`ingest:udir-nasjonale-prover` script — add this BEFORE
  shipping, verify with the real `npm run` invocation)
- `atlas-data/migrations/<next>_raw_udir_nasjonale_prover.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (registration — annual
  cadence, existing weekly-polled job pattern)
- `atlas-data/dbt/models/indicators/sources.yml`, `indicators__udir_nasjonale_prover.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__udir_nasjonale_prover.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s `udir` listing — bump the count)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
