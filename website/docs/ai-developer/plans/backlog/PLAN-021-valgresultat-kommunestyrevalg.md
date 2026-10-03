# Plan: Valgresultat — kommunestyrevalg per kommune

Ingests Valgdirektoratet's kommunestyrevalg (municipal council election) results — turnout,
per-party vote share, and per-party council seats — per kommune, for the latest election cycle
(2023). Tier-3 candidate #11, a brand-new civic-engagement axis, not a gap-fill for an existing
report.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — Phase 1 complete, ready to move to active/ for Phase 2

**Goal**: Add `valgresultat-kommunestyrevalg` as a served Atlas source — per-kommune turnout and
party vote share/seats, an NGO-recruitment/civic-engagement overlay the investigation's own
Report #7 framing named but no existing source covers.

**Last Updated**: 2026-10-04

**Investigation**: [INVESTIGATE-new-norwegian-public-sources.md](../backlog/INVESTIGATE-new-norwegian-public-sources.md) §11 [Q28]

**Prerequisites**: None.

---

## Phase 1: Confirm the real shape — DONE (verified 2026-10-04)

### Tasks

- [x] 1.1 Find the real API. **Confirmed, and genuinely different from the investigation's own
  URL** — `https://www.valg.no/om-valgdirektoratet/.../API-med-valgresultater/` is a press/info
  page, not the API itself. The real base is `https://valgresultat.no/api/` — a real, anonymous,
  HAL+JSON REST API, confirmed live (`200`, no auth).
- [x] 1.2 Confirm coverage. **Confirmed, and corrects the investigation's "back to 1999"
  claim** — the API's own root listing goes back to **2009** only (`st` 2009; `fy`+`ko` from
  2011; `sa` from 2013), not 1999. Four election types alternate on a 2-year cycle:
  `st`/`sa` (Storting + Sameting) in odd years, `fy`/`ko` (Fylkesting + Kommunestyre) in even
  years. Latest `ko` (kommunestyrevalg) cycle: **2023**.
- [x] 1.3 Confirm the real hierarchy and grain. **Confirmed**: `land` (national) → `fylke` →
  `kommune`, navigated via `_links.related`, e.g. `/api/2023/ko/11/1103` (Rogaland → Stavanger).
  `nr` at the kommune level is the real 4-digit SSB kommune code (`"1103"`), directly usable, no
  crosswalk needed. ⚠️ **No bulk-fetch shape exists** — a fylke-level call returns only that
  fylke's own aggregate, not nested per-kommune results (confirmed live with `?dybde=2`, no
  effect). One HTTP call per kommune is required, same cost shape as
  `udir-elevundersokelsen-mobbing`'s own finding, though far cheaper here: ~356 kommune calls +
  ~15 fylke-discovery calls ≈ **371 calls for one election cycle**, not ~702×grades.
- [x] 1.4 Confirm the real data shape per kommune. **Confirmed on both a large kommune
  (Stavanger, 20 parties) and a small one (Hjelmeland, 9 parties, including the `BLANKE`
  blank-vote and `Andre`/`Andre2` catch-all pseudo-party codes)** — consistent structure both
  times: `frammote.prosent` (turnout, kommune-level, no party dimension), and per-party
  `stemmer.resultat.prosent`/`antall.total` (vote share/count) and
  `mandater.resultat.antall` (council seats won), keyed by `partikode` (a real, stable short
  code — `A`, `SV`, `RØDT`, `BLANKE`, etc.), not requiring a name-based crosswalk.

### Validation

✅ Confirmed 2026-10-04. Real live API calls against `valgresultat.no/api/` for the root
listing, one fylke (Rogaland), and two real kommuner of very different sizes.

---

## Open Questions

- **[Q1] Scope — which valgtype, which years?** **Recommendation: `ko`
  (kommunestyrevalg) only, 2023 only, for v1.** `ko` is the most directly kommune-governance-
  relevant of the four types (`st`/`sa` are national-list results reported at kommune level as a
  secondary view, not kommune government itself; `fy` is fylke-grain). Backfilling all `ko`
  cycles since 2011 would be ~4×371 ≈ 1,484 calls — not expensive in absolute terms, but this
  plan does NOT verify the 2011/2015/2019 response shape matches 2023's (party lists and
  possibly the schema itself may have evolved over 12 years, the way Lottstift's files
  genuinely did year to year) — scope conservatively, confirm one year's shape fully, defer
  backfill rather than assume continuity across cycles not inspected.
- **[Q2] [Q28]'s own `dim_period` "event-cohort" concern.** Checked: this does NOT need a new
  `dim_period` construct for v1 — `year` as a plain integer (the election year) is sufficient,
  same as every other annual source. An event-cohort classifier would only matter if Atlas needed
  to express "the period between this election and the next," which no consumer has asked for.
  Not resolved as a blocking question — just not needed yet.
- **[Q3] Measure scope.** Turnout, vote share, and seats are the three headline numbers.
  `mandater.resultat.sisteMandat`/`nesteMandat` (the quotient/rank of the last seat won and next
  seat lost — used for close-race analysis) are NOT ingested in v1 — a real, interesting
  secondary signal, but not what Report #7's own framing (civic-engagement overlay) needs.
- **[Q4] Presentation sensitivity.** Minimal — this is public, official, already-published
  election data, not a sensitive per-kommune statistic the way small-cell health/benefits data
  is.

---

## Phase 2: Ingest module + raw table (not started)

### Tasks

- [ ] 2.1 Create `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/`: `manifest.yml`
  (`source_id: valgresultat-kommunestyrevalg`, `provider: valgdirektoratet`, `periodicity:
  irregular` — confirmed valid enum value, matches this event-driven, not calendar-periodic,
  cadence — `license: NLOD`), `index.ts`, `parse.ts`,
  `fetch_retry.ts` (copied), `README.md`, `__tests__/` with real captured fixtures (a large
  kommune, a small kommune with the `BLANKE`/`Andre` pseudo-codes, and the root/fylke-level
  listing responses used for discovery).
- [ ] 2.2 `parse.ts` — discover the fylke list from `/api/2023/ko`'s own `_links.related`, then
  the kommune list from each fylke's own `_links.related` (confirmed live: no hardcoded kommune
  list). One row per (kommune_nr, parti_kode, measure) for `stemmer_prosent`/`stemmer_antall`/
  `mandater_antall`, plus one row per (kommune_nr, measure) with `parti_kode` NULL for
  `frammote_prosent`.
- [ ] 2.3 Migration `raw.valgresultat_kommunestyrevalg(kommune_nr, year, parti_kode, parti_navn,
  measure, value, loaded_at)` — `parti_kode`/`parti_navn` NULL for the kommune-level turnout row.
- [ ] 2.4 Dagster registration — new `provider: valgdirektoratet` tag (add to
  `publishers.yaml`, with a real logo sourced from `valg.no`'s own site), new cadence
  consideration per 2.1 (likely the existing annual-polled job is fine even though the real
  upstream cadence is event-driven — the ingest script itself only needs re-running after an
  election, and weekly polling just finds nothing new in between, same "upsert is a no-op"
  reasoning this project already applies elsewhere).
- [ ] 2.5 Add `ingest:valgresultat-kommunestyrevalg` npm script FIRST, verify via
  `check-every-source-has-an-ingest-script.sh` and the real `npm run` invocation before any
  other Phase 2 work.

### Validation

Real run against the live API, zero rows silently dropped, both a large and a small kommune's
real party list and turnout confirmed against real data.

---

## Phase 3: dbt staging and marts (not started)

### Tasks

- [ ] 3.1 Add `raw.valgresultat_kommunestyrevalg` to `models/indicators/sources.yml`.
- [ ] 3.2 `indicators__valgresultat_kommunestyrevalg.sql` — `kommune_nr`/`region_kind` via
  `region_code_to_kommune_nr`/`classify_region_code` (kommune_nr here is already Atlas's own
  4-digit format, confirmed in Phase 1.3 — still apply the macro rather than trust that, same
  discipline as every other source). Confirm against real loaded data.
- [ ] 3.3 Document columns in `schema.yml`; `mart_indicators__valgresultat_kommunestyrevalg.sql`
  api passthrough + `marts/api/schema.yml` entry.
- [ ] 3.4 `dbt build` against real loaded data.

### Validation

Real local Postgres, not an empty schema.

---

## Phase 4: Deploy and verify arrival (not started)

Same shape as every prior source's Phase 4 this session. **Only predict
`indicators__valgresultat_kommunestyrevalg` as a served relation.** This source's call volume
(~371 calls for one cycle) is moderate, not trivial — confirm real wall time during Phase 2
before assuming a figure in the deploy request, per
[[exploratory-calls-dont-reveal-sustained-api-latency]]. Independently re-verify against the
live public API before closing the deploy task.

---

## Acceptance Criteria

- [x] **The mechanism is verified live** — `valgresultat.no/api/`, confirmed by direct calls at
  all three hierarchy levels, not assumed from the investigation's own (wrong) URL.
- [x] **Coverage and cadence corrected against the investigation's own claims** — 2009 onward,
  not 1999; a real 2-year alternating cycle, not a vague "periodic" cadence.
- [ ] `valgresultat-kommunestyrevalg` ingests cleanly with zero rows silently dropped, a large
  and a small kommune's real party list and turnout both represented.
- [ ] `indicators__valgresultat_kommunestyrevalg` and its mart build and test clean against real
  loaded data.
- [ ] `valgresultat-kommunestyrevalg` appears in `meta_sources.served_as` after a real deploy,
  independently verified via live `curl`.
- [ ] Golden-file tests cover a large kommune, a small kommune with pseudo-party codes, and the
  turnout-only (no-party) row shape.
- [ ] The investigation and `1PRIORITY.md` are updated to mark this candidate shipped, with
  [Q1]'s backfill deferral carried forward explicitly.

---

## Files to Modify

- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/manifest.yml` (new)
- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/index.ts` (new)
- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/parse.ts` (new)
- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/fetch_retry.ts` (new, copied)
- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/README.md` (new)
- `atlas-data/ingest/src/sources/valgresultat-kommunestyrevalg/__tests__/` (new)
- `atlas-data/ingest/src/sources/publishers.yaml` (new `valgdirektoratet` provider)
- `atlas-data/ingest/package.json` (`ingest:valgresultat-kommunestyrevalg` script — add FIRST)
- `atlas-data/migrations/<next>_raw_valgresultat_kommunestyrevalg.sql` (new)
- `atlas-data/dagster/atlas_data/assets/raw_other.py`, `schedules.py` (registration)
- `atlas-data/dbt/models/indicators/sources.yml`,
  `indicators__valgresultat_kommunestyrevalg.sql` (new), `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_indicators__valgresultat_kommunestyrevalg.sql` (new),
  `schema.yml`
- `atlas-data/dbt/models/marts/api/mart_atlas_inventory.sql` (depends_on + counted list)
- `atlas-data/dbt/scripts/generate_api_v1.py` (`SCHEMA_COMMENT`'s listing — bump the count, new
  `valgdirektoratet` provider group)
- `atlas-data/template-info.yaml`, `website/docs/developers/index.md` (regenerated counts)
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-new-norwegian-public-sources.md` (mark
  shipped)
- `website/docs/ai-developer/plans/backlog/1PRIORITY.md` (mark shipped)
