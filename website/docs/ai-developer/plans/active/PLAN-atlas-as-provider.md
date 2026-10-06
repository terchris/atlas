# Plan: Atlas as a provider

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — approved by Terje 2026-10-05 ("add Atlas as a provider and ingest and publish
all the datasets"), two scope questions answered the same day (see Decisions below).

**Goal**: Atlas isn't only a republisher of upstream public data — some of what it publishes is
Atlas's own authored content: classification schemes, cross-source syntheses, and self-description.
Right now none of that is attributed to anyone on the public catalogue; it just appears under
whichever upstream source happens to be nearby. Add "Atlas" as a publisher, attribute the ~20
already-published relations that are genuinely Atlas's own, and bring two more bodies of
Atlas-authored content across the ingest→publish line that haven't crossed it yet.

**Last Updated**: 2026-10-05

**Prerequisites**: None. Independent of PLAN-001 (NGO chapter matching, completed same day) except
that PLAN-001's two new models are one of this plan's publish targets (Phase 2).

---

## Decisions (answered 2026-10-05, not re-litigated per phase)

- **Taxonomy crosswalk load policy**: load the proposed taxonomy and crosswalk AS-IS (confidence
  levels visible, nothing blocked on review) — "publish what we have, we will improve on it later."
  This matches [Q6] in `INVESTIGATE-ngo-activity-taxonomy.md`'s own stated recommendation. The 92
  LOW-confidence crosswalk rows are **not** being resolved by this plan — they load with their
  `confidence` column intact, same as every other row.
- **PLAN-001's two new models**: publish now as registry-only (not held for the later site-crawl
  reconciliation phase) — "there was 11 ngos with data." Confidence stays capped at `medium` (never
  overstated as corroborated); this is an honest publish of what's verified, not a claim the
  reconciliation phase is done.

---

## What "Atlas as a publisher" means in this catalogue, concretely

The catalogue's existing publisher mechanism (`publishers.yaml`, cross-checked against each
source's `manifest.yml`) is per-**ingested-source** — it has no concept of attributing a derived
*model* to anyone. Rather than invent a new mechanism, this reuses what's already there: mart
`schema.yml` files already carry a `meta:` block the generator reads (`meta.title`,
`meta.stability` — confirmed in `atlas-data/dbt/models/marts/api/schema.yml` and
`website/scripts/generate-sources-registry.mjs`). Phase 1 adds one more key, `meta.publisher`,
read the same way, validated against `publishers.yaml` the same way a manifest's `publisher:`
field already is.

---

## Phase 1: Add Atlas as a publisher, attribute the ~20 already-published relations

The list (verified against the live catalogue 2026-10-05, not recalled):

**Atlas's own classification schemes:**
`mart_ref_atlas_service_category`, `mart_dim_activity`, `mart_dim_chapter`, `mart_ref_region_kind`

**Atlas's own cross-source syntheses:**
`mart_activity_catalog`, `mart_fact_chapter_activities`, `mart_distrikt_summary`,
`mart_chapter_kommune_coverage`, `mart_kommune_local_chapters`, `mart_kommune_ngo_summary`,
`mart_kommune_ngo_totals`, `mart_indicator_summary`, `mart_indicator_latest_values`,
`mart_indicator_missing_kommuner`, `mart_coverage_gap_barnefattigdom`, `mart_unattributed_totals`,
`mart_supply__redcross_chapter_kommune_coverage`

**Atlas's own meta/self-description:**
`mart_atlas_inventory`, `mart_meta_sources`, `mart_meta_endpoints`, `mart_meta_dimensions`,
`mart_ingest_health`, `mart_source_freshness`

**The NGO registry:**
`mart_ngo_index`, `mart_ngo_overview`

### Tasks

- [ ] 1.1 `publishers.yaml`: new entry — `id: atlas`, `display_name: Atlas`,
      `homepage: https://atlas.sovereignsky.no`, a logo (reuse the site favicon/mark — check
      `website/static/img/` for an existing asset before adding one), notes explaining Atlas is
      both a republisher and, for these relations specifically, the author.
- [ ] 1.2 `website/scripts/generate-sources-registry.mjs`: read `meta.publisher` off each mart's
      dbt node (same pattern as the existing `meta.title` read), validate it resolves to a
      `publishers.yaml` id (fail loud like the manifest `publisher:` cross-check already does,
      don't silently drop an unmatched value), and surface these relations on `/publishers/atlas`
      the same way a source's manifest surfaces it on its own publisher's page.
- [ ] 1.3 Tag `meta.publisher: atlas` on each of the ~20 models listed above, in their respective
      `schema.yml` entries.
- [ ] 1.4 Regenerate the catalogue (`npm run sources:generate`), confirm `check-publisher-logos.mjs`
      and `check-dataset-page-coverage.mjs` still pass, confirm `/publishers/atlas` renders with
      all ~20 and nothing else.

### Validation

- `node scripts/generate-sources-registry.mjs` then `node scripts/check-publisher-logos.mjs` and
  `node scripts/check-dataset-page-coverage.mjs` — both green.
- `npm run build` (Docusaurus) succeeds; `/publishers/atlas` page content spot-checked against the
  list above (not just "it rendered").

---

## Phase 2: Publish PLAN-001's two NGO chapter models

`int_ngo_chapter_registry_match` and `int_ngo_chapter_subunits` currently live in
`models/intermediate/` as internal views, deliberately not published (see
`PLAN-001-brreg-chapter-matching-and-underenheter.md`). Per the decision above, publish them now,
registry-only, confidence column intact.

### Tasks

- [x] 2.1 Wrapped each in a `mart_` model under `models/marts/api/`
      (`mart_ngo_chapter_registry_match`, `mart_ngo_chapter_subunits` — `+post-hook:
      restore_api_v1_view()` applies automatically at the directory level, no per-file config
      needed). The `int_` models are unchanged.
- [x] 2.2 `meta.publisher: atlas` on both.
- [x] 2.3 Full `schema.yml` docs + tests for both — one real YAML bug found building this (an
      unquoted description starting with a single-quoted scalar, broken by an apostrophe later in
      the same string; fixed by double-quoting the whole value), caught by `dbt parse` failing
      loud rather than by inspection.
- [x] 2.4 Lineage, `api_v1_generated.sql`/`api_v1_state.json`, `template-info.yaml`, and the
      catalogue all regenerated via their own generator scripts, not hand-edited.
- [x] 2.5 `check-dataset-page-coverage.mjs`: 96 relations (was 94), two new dataset pages.
      `check-every-source-is-served.sh`: `brreg-underenheter` moved from unserved to served —
      `brreg-underenheter-oppdateringer` (the change feed, not the bootstrap) remains the one
      deferred source.

### Validation — done for real against live data, not simulated

Built and tested against a fresh real ingest of the full Brreg enhetsregister + underenheter
register (not fixtures, not the prior session's torn-down instance). Both PLAN-001 acceptance
tests pass unchanged (`ngo_chapter_registry_match` = 2750 rows, exact sum of the 9 federated
NGOs' targets; `ngo_chapter_subunits` = 329 rows = 177 + 152) — the wrapper is a pure passthrough,
confirmed by row count, not assumed from the SQL. All 40 new/existing tests touching these two
relations pass, independently re-run twice (once by the agent that built this, once standalone
afterward against the same live database) with identical results both times.

Public API confirmation deferred to the deploy step (per this repo's "a deploy is not successful
until the data arrives" rule) — not claimed here before it has actually shipped.

---

## Phase 3: Ingest and publish the NGO activity taxonomy

Source material (PR #555, `docs/research/ngo-research/taxonomy/`): `taxonomy-nb-en.csv` (38
categories) + `taxonomy-nb-en-families.csv` (10 families), `crosswalk_activity_service_category.csv`
(589 activity→category rows, `confidence` + `reviewed_by` columns), `search-terms-validated.csv`
(859 rows, the search-volume evidence).

### Tasks

- [ ] 3.1 New seeds: `ref_activity_category` (38 rows, from `taxonomy-nb-en.csv`), replacing
      `ref_atlas_service_category` (22 rows) — confirm first that the 22 existing codes are an
      exact subset (the investigation already checked this; re-verify against the actual seed
      files, don't trust the doc's claim unchecked), `ref_activity_family` (10 rows), and
      `ref_atlas_activity_crosswalk` (589 rows, from `crosswalk_activity_service_category.csv`,
      `confidence`/`reviewed_by` columns carried through unchanged).
- [ ] 3.2 `ref_activity_search_term` seed from `search-terms-validated.csv` (859 rows) — loaded as
      data for a later search-index PLAN (explicitly out of scope here per the investigation's own
      Next Steps), not wired into anything yet.
- [ ] 3.3 🔴 **SCOPE CORRECTION, found while implementing, not assumed from the investigation doc.**
      `dim_activity.sql`'s own header says it today: *"Source: SELECT DISTINCT from per-NGO
      supply__<ngo>_branch_activities staging models... PLAN-003 will add Folkehjelp; this model
      gains a UNION ALL clause then."* Checked directly — `atlas-data/dbt/models/supply/` has
      exactly three files, all Røde-Kors-only (`supply__redcross_branches`,
      `_branch_activities`, `_chapter_kommune_coverage`). No other NGO has a staging model. The
      crosswalk CSV names all 11 NGOs' activities, but 10 of them have nowhere in the warehouse to
      attach a category to — that requires each NGO's own activity data to be ingested first (the
      per-NGO site-crawl work this session has repeatedly deferred elsewhere), which is NOT what
      "ingest and publish the taxonomy" asked for. So: retire the Røde-Kors-only `CASE` in
      `supply__redcross_branch_activities.sql` for Røde Kors only, replacing it with a join against
      `ref_atlas_activity_crosswalk` filtered to `ngo = 'redcross' and is_primary`. The crosswalk
      rows for the other 10 NGOs load and publish as real, queryable data (task 3.6) — showing what
      category each NGO's activities fall under — but do **not** reach `dim_activity` for those
      NGOs this round. That gap is pre-existing (those NGOs were never in `dim_activity` at all,
      categorized or not) and not something this plan introduces or is positioned to close.
- [ ] 3.4 `dbt_project.yml` seed `+column_types`: add any new text-preserving overrides this
      introduces (check `activity_id`, category/family codes for leading-zero or type-inference
      risk, same discipline as every prior seed addition this session).
- [ ] 3.5 `schema.yml` docs + tests for all four new seeds (not_null/unique/accepted_values/
      relationships, matching this repo's "every marts column is documented" rule).
- [ ] 3.6 Publish `ref_activity_category` and `ref_activity_family` as decoder marts (same pattern
      as `mart_ref_brreg_icnpo`), `meta.publisher: atlas` (Atlas's own invented taxonomy, not an
      external standard). `ref_atlas_activity_crosswalk` and `ref_activity_search_term` stay
      internal (seeds feeding `dim_activity` and the future search-index PLAN respectively) —
      a crosswalk audit trail and raw search-term evidence aren't themselves consumer-facing
      datasets.
- [ ] 3.7 Regenerate lineage, `api_v1_generated.sql`, `template-info.yaml`, the catalogue — same
      discipline as every prior change this session (run the generators, don't hand-edit).

### Validation

- Verify the 22→38 category claim and the 500/589-row crosswalk shape directly against the real
  seed files once loaded (dbt `dbt seed` + a row-count query), not by re-reading the investigation
  doc's own numbers.
- Before/after row count on `dim_activity.service_category_code` for Røde Kors (the only NGO in
  `dim_activity` today) — confirm Røde Kors's own 7 reclassifications from the investigation's
  "what changes" table land exactly as documented, and that `is_primary`-filtered join produces
  the same row count as the old CASE (one category per activity still, not a fan-out).
- Confirm `ref_atlas_activity_crosswalk` is queryable and correct for all 11 NGOs even though only
  Røde Kors's feeds `dim_activity` — e.g. `select ngo, count(*) from ref_atlas_activity_crosswalk
  group by 1` should show all 11, not just Røde Kors.
- `dbt build` full suite green, including the two PLAN-001 acceptance tests (unaffected by this
  phase) and whatever new tests Phase 3.5 adds.

---

## Deploy

Per this repo's standing rule, every deploy request to imac names per-relation expected row
counts, and a release isn't done until `transform_checks`/`api_v1_checks` confirm the data arrived
— not just that the build was green. Phases 1-3 each get their own deploy request (don't bundle
unrelated phases into one — a deploy is a change with a reason, not a commit range), following the
same pattern as PLAN-001's #1857.

## Open questions carried forward, not resolved here

- Whether `ref_activity_search_term`'s 859 rows ever become a real search feature is a separate,
  not-yet-started PLAN (the investigation's own Next Steps already says so).
- The 92 LOW-confidence crosswalk rows remain unreviewed by design (see Decisions) — a future pass
  should revisit them, but this plan does not block on that.
