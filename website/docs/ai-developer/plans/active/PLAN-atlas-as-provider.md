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

- [ ] 2.1 Wrap each in a `mart_` model under `models/marts/api/` (this repo's existing
      `mart_<name>` → `api_v1.<name>` convention, `+post-hook: restore_api_v1_view()`), rather than
      renaming the `int_` models themselves — keeps the `models/intermediate/` layer as the
      derivation step and `marts/api/` as the publish step, consistent with every other published
      relation.
- [ ] 2.2 `meta.publisher: atlas` on both (this is Atlas's own derived classification, same bucket
      as Phase 1's list, not a source mirror).
- [ ] 2.3 `schema.yml` docs + tests for the two new `mart_` wrappers — reuse the column
      documentation already written for the `int_` models (`models/intermediate/schema.yml`), don't
      re-derive it.
- [ ] 2.4 Regenerate `lineage.csv`/`lineage_direct.csv` (new edges: `mart_*` → `int_*`), regenerate
      `api_v1_generated.sql` / `api_v1_state.json` via `scripts/generate_api_v1.py`, regenerate
      `template-info.yaml` holdings, regenerate the catalogue (new dataset pages expected this
      time, since these ARE published relations now — unlike Phase 1 of PLAN-001).
- [ ] 2.5 Confirm `check-dataset-page-coverage.mjs` passes (two new dataset pages required) and
      `check-every-source-is-served.sh` reflects brreg-underenheter's status correctly (it already
      reaches a published relation now, for the first time).

### Validation

Same acceptance-target tests from PLAN-001 still pass unchanged (the `int_` models aren't
modified, only wrapped) — rerun them as part of this phase's `dbt build` to confirm the wrapper
didn't somehow change row counts. Confirm via the public API directly once deployed:
`https://api-atlas.urbalurba.com/ngo_chapter_registry_match?limit=5` (exact relation name TBD —
match whatever `generate_api_v1.py` derives from the `mart_` name) returns rows with a visible
`confidence` column, not silently promoted to "verified."

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
