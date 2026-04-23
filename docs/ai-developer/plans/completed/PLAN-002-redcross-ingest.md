# Plan 002: Red Cross ingest — first NGO supply ingest

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Land Atlas's first NGO supply ingest. Read the Red Cross Organizations API dump at [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json), populate `raw.redcross_branches` and `raw.redcross_branch_activities`, and build the first three supply-side dbt entities — `dim_chapter`, `dim_activity`, `fact_chapter_activities` — against the foundation PLAN-001 laid. After this plan, Atlas can answer cross-NGO questions like *"how many providers of homework help in kommune X?"* — for one NGO. PLAN-003 (Folkehjelp) adds the second.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — all 5 phases done. **391 chapters** (1 dump duplicate of L192 Stryn deduped), **1 941 fact rows**, **35 distinct activities**. dbt build PASS=520 / WARN=19 / ERROR=0. ERD grew 31 → 36 entities, 48 → 62 relationships. One dump-data quirk caught (duplicate branch row); dedup added before ON CONFLICT. See Plan deviations at the bottom.

**Investigation**: [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md), specifically [Q26](INVESTIGATE-ngo-supply-data-model.md#q26-plan-b--first-ngo-ingest-red-cross).
**Prerequisites**: [PLAN-001-ngo-supply-foundation](../completed/PLAN-001-ngo-supply-foundation.md) — needs `dim_ngo` (the Red Cross row exists with orgnr `864139442`, slug `redcross`) and `ref_atlas_service_category` (the 22-row vocabulary). Both shipped on `feature/ngo-supply-foundation` (about to merge to main).
**Blocks**: PLAN-003 (Folkehjelp ingest) — uses the same supply__ pattern this PLAN establishes.
**Priority**: Medium

---

## Overview

Five phases, ~5–7h. The ingest dump is static (per [Q39](INVESTIGATE-ngo-supply-data-model.md#open-questions) — live API client deferred to a separate workstream).

**Built in PLAN-002:**

- `raw.redcross_branches` — one row per branch from the API dump (392 rows: 1 Nasjonalkontoret + 18 Distrikt + 362 Lokalforening + 11 Ukjent).
- `raw.redcross_branch_activities` — one row per (branch, activity) tuple (~2 400 rows).
- `marts.supply__redcross_branches` — staging model, reshapes raw into `dim_chapter` shape.
- `marts.supply__redcross_branch_activities` — staging model, reshapes raw + applies the 50-row CASE WHEN that maps Red Cross's `globalActivityName` to the 22-row `service_category_code` vocabulary.
- `marts.dim_chapter` — first time built. UNION of `supply__*_branches` (just Red Cross for now); ready for Folkehjelp + future NGOs.
- `marts.dim_activity` — first time built. SELECT DISTINCT from `supply__*_branch_activities`.
- `marts.fact_chapter_activities` — first time built. JOINs supply__*_branch_activities to dim_chapter and dim_activity for `chapter_id` and `activity_id`.

**Decision-points specific to PLAN-002** (per [PLANS.md](../../PLANS.md#decision-point-ids-qn) `[P2.Q<N>]` convention):

- **[P2.Q1]** **Static dump path**: read from `docs/research/api-getOrganizations-output-21apr26.json` (existing location). Don't move/duplicate. The dump is a research artifact; the ingest just consumes it. When the live API client lands later, it'll write to the same `raw.*` tables with no other changes.
- **[P2.Q2]** **Per-NGO staging models follow the `supply__<ngo_slug>_<entity>` naming pattern**, mirroring the existing `indicators__<source_id>` convention. Two models per NGO: `supply__redcross_branches`, `supply__redcross_branch_activities`. PLAN-003 adds `supply__folkehjelp_chapters`, etc.
- **[P2.Q3]** **Activity-to-category curation lives in SQL (CASE WHEN), not a seed CSV**. 50 mappings is small enough to live inline in `supply__redcross_branch_activities`. Adding a new activity = edit the SQL + re-run dbt. Auto-discovery: a new activity that's not in the CASE gets `NULL service_category_code`, fails the `not_null` test loudly. Per-NGO mapping (each NGO's CASE is in its own staging model) avoids cross-NGO collisions.
- **[P2.Q4]** **Non-service activities filtered out at supply level** (not surfaced as `dim_activity` rows or in `fact_chapter_activities`). Examples: Administrative oppgaver, Lokalstyre, Distriktsstyre, Sporadisk frivillige — these are organisational, not services. Documented as a constant in `supply__redcross_branch_activities`. See Appendix A for the 14 filtered-out activities.
- ~~**[P2.Q5]**~~ **Ambiguous activity mappings — resolved (2026-04-23)**. All 6 cases assigned a best-guess category with explicit reasoning in Appendix A. The 50 → 22 mapping is now: 36 mapped + 14 filtered = 50. No `dim_activity` row will be left without a `service_category_code`.
- **[P2.Q6]** **`activity_id` shape** — composite slug `'redcross-' || slugify(canonical_name)`. Consistent with the convention discussed during the investigation. Slug uses lowercase, replaces spaces with `-`, strips diacritics → ASCII (so `'Besøkstjeneste'` becomes `'besokstjeneste'`).
- **[P2.Q7]** **`Ukjent` branches (11 rows)**: include with `chapter_level = 'local'`, `is_active = false`, `parent_chapter_id = NULL`. They're pre-merger remnants per the API's `branchType = 'Ukjent'` indicator. Surfaced for time-travel completeness; filtered out by Coverage-gap queries via `is_active = true`.
- **[P2.Q8]** **kommune_nr resolution** uses `dim_postnummer` lookup on `branchLocation.postalAddress.postalCode` per [Q22](INVESTIGATE-ngo-supply-data-model.md#sections-c-d). Branches without a postnummer (Distrikt and HQ rows that don't represent a single kommune) get `NULL kommune_nr`. The fact-side join in fact_chapter_activities also gets NULL — Coverage-gap query filters those out via `chapter_level = 'local'` per [Q48](INVESTIGATE-ngo-supply-data-model.md#open-questions).

---

## Phase 1: Raw layer + ingest script — DONE

### Tasks

- [x] 1.1 Find the next available migration number (`ls atlas-data-repo/migrations/`); create `NNN_redcross_branches.sql` with two tables:
  - `raw.redcross_branches` — columns: `branch_id text PRIMARY KEY`, `branch_number text`, `organization_number text`, `branch_type text`, `branch_name text`, `is_active boolean`, `is_terminated boolean`, `creation_date date`, `parent_branch_id text`, `parent_branch_name text`, `parent_branch_type text`, `municipality text`, `county text`, `region text`, `postal_address_line1 text`, `postal_code text`, `post_office text`, `street_address_line1 text`, `phone text`, `email text`, `web text`, `loaded_at timestamptz default now()`.
  - `raw.redcross_branch_activities` — columns: `branch_id text` (FK in spirit, no constraint), `global_activity_name text`, `local_activity_name text`, `loaded_at timestamptz default now()`. PK on `(branch_id, global_activity_name)`.
- [x] 1.2 Run `npm run migrate` from `atlas-data-repo/ingest/`. Verify both tables exist (empty).
- [x] 1.3 Create [`atlas-data-repo/ingest/src/sources/redcross-branches/index.ts`](../../../../atlas-data-repo/ingest/src/sources/) exporting `SOURCE_ID = 'redcross-branches'` and `run()` that:
  - Reads `docs/research/api-getOrganizations-output-21apr26.json` (path resolved relative to the script).
  - Parses the 392 branches.
  - For each branch, extracts the fields listed above. Handles missing optional fields (e.g. `branchParent` for HQ row) with explicit `null`.
  - Upserts to `raw.redcross_branches` keyed on `branch_id`.
  - For each branch with a `branchActivities` array, emits one row per activity to `raw.redcross_branch_activities`. Upserts on `(branch_id, global_activity_name)`.
  - Logs counts at the end (X branches, Y branch-activity rows).
- [x] 1.4 Create alongside: [`atlas-data-repo/ingest/src/sources/redcross-branches/README.md`](../../../../atlas-data-repo/ingest/src/sources/) explaining: source = static dump, planned live-API client, schema notes.
- [x] 1.5 Add `ingest:redcross-branches` script to [`atlas-data-repo/ingest/package.json`](../../../../atlas-data-repo/ingest/package.json), following the existing `ingest:<source-id>` pattern.
- [x] 1.6 Add a row for `redcross-branches` to [`atlas-data-repo/ingest/src/sources/README.md`](../../../../atlas-data-repo/ingest/src/sources/README.md) catalogue table.
- [x] 1.7 Run `npm run ingest:redcross-branches`. Verify: 392 branches, ~2 400 activity rows.
- [x] 1.8 Add the source to [`atlas-data-repo/dbt/models/indicators/sources.yml`](../../../../atlas-data-repo/dbt/models/indicators/sources.yml) — actually, supply sources may want their own `models/supply/sources.yml`. Decide path during implementation; align with whatever folder structure Phase 2 picks for the supply__ models.

### Validation

```bash
cd atlas-data-repo/ingest
npm run typecheck && npm run ingest:redcross-branches
```

Then via dbt:

```bash
cd ../dbt
uv run --env-file ../ingest/.env dbt show --inline "select branch_type, count(*) from raw.redcross_branches group by branch_type order by branch_type"
```

User confirms output matches the API dump's branch-type distribution: 1 Nasjonalkontoret + 18 Distrikt + 362 Lokalforening + 11 Ukjent = 392.

---

## Phase 2: Supply staging models + dim_chapter — DONE

### Tasks

- [x] 2.1 Decide model folder layout: `models/supply/` (parallels `models/indicators/`) or extend `models/dimensions/` with the supply staging models alongside dim_chapter. Recommendation: **new `models/supply/` folder** for the staging models, leave `dim_chapter` in `models/dimensions/`. Mirrors the indicators pattern (staging in `indicators/`, dims in `dimensions/`).
- [x] 2.2 Create `models/supply/sources.yml` declaring `raw.redcross_branches` and `raw.redcross_branch_activities` as dbt sources (with `loaded_at_field: loaded_at` for freshness checks later).
- [x] 2.3 Create [`models/supply/supply__redcross_branches.sql`](../../../../atlas-data-repo/dbt/models/supply/) — reshapes `raw.redcross_branches` into `dim_chapter`-shape. Output columns: `chapter_id`, `ngo_orgnr`, `chapter_level`, `parent_chapter_id`, `chapter_orgnr`, `name`, `kommune_nr`, `is_active`, `address_line1`, `postal_code`, `post_office`, `phone`, `email`, `web`, `updated_at`.
  - `chapter_id`: `'redcross-' || branch_id` (composite key — Red Cross's branch_id is just an internal alphanumeric code; namespaced for cross-NGO uniqueness in `dim_chapter`).
  - `ngo_orgnr`: hardcoded `'864139442'`.
  - `chapter_level`: CASE on `branch_type`: `'Nasjonalkontoret' → 'national'`, `'Distrikt' → 'regional'`, `'Lokalforening' → 'local'`, `'Ukjent' → 'local'` (per [P2.Q7]).
  - `parent_chapter_id`: `'redcross-' || parent_branch_id` when present; NULL for HQ and Ukjent.
  - `chapter_orgnr`: from `organization_number` (Red Cross local branches each have own orgnr).
  - `kommune_nr`: lookup via `LEFT JOIN dim_postnummer ON postal_code = postnummer` per [P2.Q8]. NULL for branches without a postnummer.
  - `is_active`: per [Q44](INVESTIGATE-ngo-supply-data-model.md#open-questions) — `not is_terminated and (branch_type = 'Lokalforening' or branch_type = 'Distrikt' or branch_type = 'Nasjonalkontoret')`. Ukjent → `false`.
- [x] 2.4 Create [`models/dimensions/dim_chapter.sql`](../../../../atlas-data-repo/dbt/models/dimensions/) — UNION ALL of all `supply__<ngo>_branches` models. For PLAN-002: just `supply__redcross_branches`. PLAN-003 adds Folkehjelp; the model gets a new UNION clause. Materialised as `table` in `marts`.
- [x] 2.5 schema.yml entry for `dim_chapter` in [`models/dimensions/schema.yml`](../../../../atlas-data-repo/dbt/models/dimensions/schema.yml):
  - `not_null + unique` on `chapter_id`
  - `not_null + relationships` on `ngo_orgnr` → `dim_ngo.orgnr`
  - `not_null + accepted_values: ['national', 'regional', 'local']` on `chapter_level`
  - `relationships` on `parent_chapter_id` → `dim_chapter.chapter_id` (self-reference, where: `parent_chapter_id is not null`)
  - `relationships` on `kommune_nr` → `dim_kommune.kommune_nr` with `severity: warn` (Red Cross may have branches in extraterritorial codes; same pattern as `dim_postnummer`)
  - `accepted_values: [true, false]` on `is_active`
- [x] 2.6 schema.yml entry for `supply__redcross_branches` in `models/supply/schema.yml` (same shape as `dim_chapter` since it's the staging-equivalent).
- [x] 2.7 Run `dbt run --select dim_chapter+`. Verify: 392 rows in `marts.dim_chapter`.
- [x] 2.8 Spot-check via `dbt show`: count by `chapter_level`, count of `is_active=true` rows, count of `kommune_nr is not null` rows. Numbers should match expectations.
- [x] 2.9 **Regression check**: `dbt build --full-refresh` — confirm clean. PASS grows; ERROR=0; WARN may grow by 1 if Red Cross has extraterritorial branches.

### Validation

User confirms `dim_chapter` has 392 rows with the right level distribution + correct kommune resolution for spot-checked branches (e.g. Modum Røde Kors → kommune_nr 3316).

---

## Phase 3: Curation + dim_activity (50 → 22 mapping) — DONE

### Tasks

- [x] 3.1 Create [`models/supply/supply__redcross_branch_activities.sql`](../../../../atlas-data-repo/dbt/models/supply/) — reshapes `raw.redcross_branch_activities` into a per-(chapter, activity) row with category resolved. Output columns: `chapter_id` (FK to dim_chapter), `ngo_orgnr` (hardcoded), `canonical_name` (= global_activity_name), `local_activity_name`, `service_category_code`, `is_service` (boolean), `updated_at`.
  - The CASE WHEN for `service_category_code` covers all 50 globalActivityName values per Appendix A (~30 obvious + 6 ambiguous + 14 non-service).
  - `is_service = false` for the 14 non-service activities (Administrative oppgaver, Lokalstyre, Distriktsstyre, etc. — see Appendix A's "filtered" section). These rows are kept for completeness but won't surface as `dim_activity` rows.
- [x] 3.2 Create [`models/dimensions/dim_activity.sql`](../../../../atlas-data-repo/dbt/models/dimensions/) — `SELECT DISTINCT` from all `supply__<ngo>_branch_activities` where `is_service = true`. Adds `activity_id` derivation: `ngo_slug || '-' || slugify(canonical_name)`. Materialised as `table` in `marts`.
- [x] 3.3 schema.yml entry for `dim_activity`:
  - `not_null + unique` on `activity_id`
  - `not_null + relationships` on `ngo_orgnr` → `dim_ngo.orgnr`
  - `not_null` on `canonical_name`
  - `not_null + relationships` on `service_category_code` → `ref_atlas_service_category.code`
  - `accepted_values: [true, false]` on `is_active`
- [x] 3.4 Add a `slugify` helper macro (or use a string-manipulation chain inline). For Norwegian-character handling: `replace(replace(replace(replace(lower(name), 'æ', 'ae'), 'ø', 'o'), 'å', 'a'), ' ', '-')`. Plain enough to inline.
- [x] 3.5 Run `dbt run --select supply__redcross_branch_activities dim_activity`. Verify: dim_activity has roughly 36 rows (50 minus 14 non-service activities).
- [x] 3.6 Spot-check: every dim_activity row has a populated `service_category_code` (loud signal if any new Red Cross activity slipped through unmapped).
- [x] 3.7 **Regression check**: `dbt build --full-refresh` — clean.

### Validation

```bash
uv run --env-file ../ingest/.env dbt show --inline "select service_category_code, count(distinct canonical_name) as activities from marts.dim_activity group by service_category_code order by service_category_code"
```

User confirms the per-category distribution matches Appendix A's mappings.

---

## Phase 4: fact_chapter_activities — DONE

### Tasks

- [x] 4.1 Create [`models/marts/fact_chapter_activities.sql`](../../../../atlas-data-repo/dbt/models/marts/) — joins per-NGO supply__*_branch_activities to dim_chapter (for chapter_id) and dim_activity (for activity_id). Output columns: `chapter_id`, `activity_id`, `ngo_orgnr` (denorm), `kommune_nr` (denorm from dim_chapter), `local_activity_name`, `is_active` (the chapter's is_active; activity-level dormancy not modelled in v1), `source_id`, `updated_at`. Materialised as `table` in `marts` with indexes on `(chapter_id)`, `(activity_id)`, `(kommune_nr)`, `(ngo_orgnr)`.
- [x] 4.2 schema.yml entry for `fact_chapter_activities`:
  - `not_null + relationships` on `chapter_id` → `dim_chapter.chapter_id`
  - `not_null + relationships` on `activity_id` → `dim_activity.activity_id`
  - `not_null + relationships` on `ngo_orgnr` → `dim_ngo.orgnr`
  - `relationships` on `kommune_nr` → `dim_kommune.kommune_nr` with `severity: warn`
  - `unique_combination_of_columns: [chapter_id, activity_id]`
- [x] 4.3 Run `dbt run --select fact_chapter_activities`. Verify: ~2 100 rows (~2 400 minus the 14 non-service-tagged ones × however many chapters had them).
- [x] 4.4 Run a worked Coverage-gap-style query to prove the model works:

  ```sql
  -- "How many distinct kommuner have at least one Red Cross homework_help provider?"
  select count(distinct dc.kommune_nr) as kommuner_with_homework_help
  from marts.fact_chapter_activities fca
  join marts.dim_activity da using (activity_id)
  join marts.dim_chapter dc using (chapter_id)
  where da.service_category_code = 'homework_help'
    and dc.is_active and dc.chapter_level = 'local';
  ```

  Expected: a small handful (Red Cross's Leksehjelp is in 61 branches per the dump).

### Validation

User confirms the fact table loads, the unique-combination test passes, and the homework_help count returns a sensible number.

---

## Phase 5: Vocabulary + ERD + final build — DONE

### Tasks

- [x] 5.1 Extend [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) with the new canonical fields:
  - `chapter_id` (text, composite key like `'redcross-L098'`)
  - `chapter_level` (text, one of `'national'` / `'regional'` / `'local'`)
  - `parent_chapter_id` (text, FK self-reference on `dim_chapter`)
  - `chapter_orgnr` (text, optional 9-digit orgnr if chapter is separately registered with Brreg)
  - `activity_id` (text, composite key like `'redcross-besokstjeneste'`)
  - `canonical_name` (text, NGO's own canonical activity name, verbatim)
  - `local_activity_name` (text, NGO's local display string for the activity at a chapter)
- [x] 5.2 Final `dbt build --full-refresh`. Expect: PASS grows by ~25–30 across the 5 new entities. ERROR=0. WARN=16 (or +1 if Red Cross extraterritorial branches surface).
- [x] 5.3 Regenerate the ERD: `cd atlas-data-repo/dbt && ./regenerate-erd.sh`. New entities appear:
  - `dim_chapter` with edges to `dim_ngo` (ngo_orgnr), `dim_kommune` (kommune_nr, warn), and self (parent_chapter_id)
  - `dim_activity` with edges to `dim_ngo` and `ref_atlas_service_category`
  - `fact_chapter_activities` with edges to `dim_chapter`, `dim_activity`, `dim_ngo`, `dim_kommune`
  - `supply__redcross_branches` and `supply__redcross_branch_activities` as staging entities

### Validation

```bash
cd atlas-data-repo/dbt
uv run --env-file ../ingest/.env dbt build --full-refresh
./regenerate-erd.sh
```

User confirms `dbt build` is clean and the ERD shows the new entities with correct edges.

---

## Acceptance Criteria

- [x] `raw.redcross_branches` populated with **391 rows** (1 dump duplicate of L192 Stryn deduped — see Plan deviations); `raw.redcross_branch_activities` with **2 143 rows**.
- [x] `marts.dim_chapter` has **391 rows**: 1 national + 18 regional + 372 local (361 Lokalforening + 11 Ukjent). Active row count: **369** (350 active local + 18 active regional + 1 active national).
- [x] `marts.dim_activity` has **35 rows** (50 minus 14 filtered minus 1 — `Internasjonalt distriktsamarbeid` is also administrative). Every row has a populated `service_category_code` from the 22-row vocabulary.
- [x] `marts.fact_chapter_activities` has **1 941 rows**.
- [x] All `relationships` tests pass (or `warn`-only for the kommune_nr cases).
- [x] `dbt build` clean: PASS=520 (+34 since pre-PLAN-002 baseline of 486), ERROR=0, WARN=19 (was 16 before PLAN-002 = +3).
- [x] ERD updated: 31 → **36 entities, 48 → 62 relationships** (5 new entities, 14 new edges).
- [x] `naming-conventions.md` lists 8 new canonical fields (chapter_id, chapter_level, parent_chapter_id, chapter_orgnr, activity_id, canonical_name, local_activity_name + the supply staging-model concept).
- [x] Worked Coverage-gap query returns sensible numbers (homework_help: a small handful of kommuner with Red Cross Leksehjelp).

---

## Implementation Notes

- **Why `supply__<ngo>_<entity>` staging models, not direct raw → dim_chapter**: the indicators__ pattern (one staging model per source) keeps each NGO's idiosyncratic shape isolated. Red Cross has chapter_level + parent_chapter_id; Folkehjelp may not. Staging models normalise into the shared dim_chapter shape; dim_chapter just UNIONs them.
- **Why CASE WHEN, not a seed CSV, for the 50-row mapping**: dbt's CASE WHEN is reviewable in SQL diffs; new mappings come with the model SQL. A seed CSV would mean two artifacts to keep in sync (CSV + a join in dim_activity). For Atlas's small NGO count (~10 in v1), inline is simpler than abstracted.
- **Why `is_service` boolean instead of just filtering at supply level**: keeps the audit trail. We can answer *"how many Red Cross branches have administrative-only activities?"* by querying supply__ rows with `is_service = false`. Loses no data; just doesn't bubble those into dim_activity.
- **The `Ukjent` branches**: 11 rows with `branchType = 'Ukjent'` — likely pre-2024-merger remnants the API hasn't reclassified. Per [P2.Q7], treated as local-level + inactive. They show up in dim_chapter for completeness; Coverage-gap queries filter them via `is_active = true and chapter_level = 'local'`.
- **kommune_nr resolution via postnummer**: cleanest approach (deterministic). Branches without a postal address (mostly Distrikt + HQ + a few outliers) get NULL kommune_nr. The fact-side query enforces `chapter_level = 'local'` per [Q48], so Distrikt/HQ rows don't pollute the supply-side spatial joins.
- **What this plan does NOT do**:
  - No Folkehjelp ingest — that's PLAN-003.
  - No `fact_kommune_supply` aggregate — deferred per [Q37](INVESTIGATE-ngo-supply-data-model.md#decisions-resolved-during-planning-2026-04-23-conversation).
  - No live Red Cross API client — deferred per [Q39].
  - No Red Cross institution data (Fellesverket, Bruktbutikk are activities here, not institutions per [Q47]).

---

## Files to Modify

New:
- `atlas-data-repo/migrations/NNN_redcross_branches.sql`
- `atlas-data-repo/ingest/src/sources/redcross-branches/index.ts`
- `atlas-data-repo/ingest/src/sources/redcross-branches/README.md`
- `atlas-data-repo/dbt/models/supply/sources.yml`
- `atlas-data-repo/dbt/models/supply/schema.yml`
- `atlas-data-repo/dbt/models/supply/supply__redcross_branches.sql`
- `atlas-data-repo/dbt/models/supply/supply__redcross_branch_activities.sql`
- `atlas-data-repo/dbt/models/dimensions/dim_chapter.sql`
- `atlas-data-repo/dbt/models/dimensions/dim_activity.sql`
- `atlas-data-repo/dbt/models/marts/fact_chapter_activities.sql`

Edit:
- `atlas-data-repo/ingest/package.json` — add `ingest:redcross-branches` script
- `atlas-data-repo/ingest/src/sources/README.md` — add catalogue row
- `atlas-data-repo/dbt/models/dimensions/schema.yml` — add dim_chapter + dim_activity entries
- `atlas-data-repo/dbt/models/marts/schema.yml` — add fact_chapter_activities entry
- `docs/stack/naming-conventions.md` — add 7 canonical fields
- `docs/stack/erd.md` — auto-regenerated

---

## Cross-references

- [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md) — parent investigation; PLAN-B at [Q26].
- [PLAN-001-ngo-supply-foundation.md](../completed/PLAN-001-ngo-supply-foundation.md) — prerequisite (dim_ngo + ref_atlas_service_category).
- [`docs/research/api-getOrganizations-output-21apr26.json`](../../../research/api-getOrganizations-output-21apr26.json) — the Red Cross API dump (1.0 MB, 392 branches, 50 globalActivityName values).

---

## Appendix A — Red Cross 50-activity mapping table

The full list of `globalActivityName` values from the dump and their proposed `service_category_code` mapping. Counts are from the dump (number of branch-activity rows). The CASE WHEN in `supply__redcross_branch_activities.sql` implements this table.

### Maps cleanly (36 activities)

The first 30 are unambiguous; the last 6 (marked ⚠) are best-guess mappings for the activities that don't fit any of the 22 categories perfectly. Reasoning notes inline.

| globalActivityName | branches | service_category_code |
|---|---:|---|
| Hjelpekorps | 298 | rescue_corps |
| Besøkstjeneste | 278 | elderly_visiting |
| Møteplasser ⚠ | 231 | family_support |
| Beredskap | 182 | first_aid_standby |
| Besøksvenn med hund | 126 | elderly_visiting |
| Opplæring | 117 | first_aid_training |
| Barnas Røde Kors | 113 | youth_activity_groups |
| Røde Kors Friluftsliv og Førstehjelp (RØFF) | 77 | youth_activity_groups |
| Norsktrening | 75 | language_practice |
| Flyktningguide | 71 | migrant_mentoring |
| Øvrige aktiviteter -  Røde Kors Ungdom | 61 | youth_activity_groups |
| Leksehjelp | 61 | homework_help |
| Treffpunkt - Røde Kors Ungdom | 53 | youth_drop_in |
| Praktiske tjenester ⚠ | 45 | family_support |
| Visitor | 44 | elderly_visiting |
| Våketjenesten ⚠ | 43 | elderly_visiting |
| Vitnestøtte | 43 | legal_witness_support |
| Ferie for alle | 41 | holiday_camps_low_income |
| Aktiviteter på asylmottak | 37 | migrant_mentoring |
| Bruktbutikk | 25 | thrift_shop |
| Møteplass Fellesverkene | 23 | youth_drop_in |
| Gatemegling | 23 | street_mediation |
| Turgruppe ⚠ | 15 | youth_activity_groups |
| Språkgruppe | 13 | language_practice |
| Nattevandring ⚠ | 12 | street_mediation |
| Familiesenter | 9 | family_support |
| Vennefamilie | 6 | family_support |
| Nettverk etter soning | 6 | prison_reintegration |
| Habil ⚠ | 5 | family_support |
| Mentorfamilie | 4 | family_support |
| Akuttovernatting for bostedsløse tilreisende | 3 | housing_outreach |
| Kors på Halsen | 2 | crisis_helpline |
| Aktiviteter på utlendingsinternat | 1 | migrant_mentoring |
| Digital leksehjelp | 1 | homework_help |
| Internasjonal Humanitær Rett | 1 | political_advocacy |
| Internasjonalt distriktsamarbeid | 1 | (filtered — administrative) |

### ⚠ Reasoning for the 6 best-guess mappings

- **Møteplasser → `family_support`.** Red Cross has SEPARATE youth-specific activities for meeting places (`Treffpunkt - Røde Kors Ungdom` 53 + `Møteplass Fellesverkene` 23). The unqualified "Møteplasser" is therefore the non-youth/general-population variant — typically generic social meeting places for vulnerable adults (lonely elderly group activities, immigrant social gatherings, family support meetings). `family_support` ("Practical/social support to families") fits this group-social framing better than `youth_drop_in` (already covered) or `elderly_visiting` (1-to-1, not group).
- **Praktiske tjenester → `family_support`.** Practical help (shopping, transport, light handyman work). The "practical" qualifier aligns with `family_support`'s "Practical/social support" framing. Recipients are often elderly, but the SERVICE TYPE is task-oriented practical help, not social companionship — that distinction puts it in family_support, not elderly_visiting (which is companionship-focused).
- **Våketjenesten → `elderly_visiting`.** Red Cross's "vigil service" — volunteers sit with terminally ill people in their final hours. Doesn't fit any of the 22 cleanly. Mapped to `elderly_visiting` because the recipient population overlaps significantly (most våketjeneste recipients are terminal elderly). Stretched fit; promote to its own `terminal_care_vigil` category if/when a 2nd NGO offers similar service (Kirkens Bymisjon may; check during PLAN-003+ phases).
- **Turgruppe → `youth_activity_groups`.** "Hiking group". Red Cross has rescue-related hiking under Hjelpekorps + RØFF separately; a standalone "Turgruppe" is most likely the recreational/social variant for non-rescue-corps members, typically youth or mixed-age. Going with youth_activity_groups; if Red Cross uses Turgruppe primarily for adult social hiking, can revisit.
- **Nattevandring → `street_mediation`.** Adults walking through urban areas at night to provide a calming presence and intervene if youth get into trouble. Closest existing category by the "youth-focused community intervention" framing. Stretched fit (street_mediation is more formal restorative-justice work); a `community_safety_patrol` category could be added later if a 2nd NGO offers similar.
- **Habil → `family_support`.** Likely "habilitering" — habilitation services for people with disabilities. None of the 22 categories cover disability support directly. `family_support` is the broadest social-support fit. If Atlas later ingests disability-focused NGOs (Handikapforbund, Blindeforbund) where this becomes a primary service, consider promoting `disability_support` to its own category.

### Filtered out — non-service (14 activities, `is_service = false`)

| globalActivityName | branches | Why filtered |
|---|---:|---|
| Administrative oppgaver | 94 | Organisational, not a service |
| Sporadisk frivillige | 39 | Volunteer recruitment metadata |
| Lokalstyre | 29 | Local board (governance) |
| BUA | 5 | Equipment-lending library — not in 22; could be added later if a 2nd NGO offers it |
| Distriktsstyre | 5 | District board (governance) |
| Kompetansesenter | 3 | Training/competence centre — meta-organisational |
| Mottak av frivillige i lokalforening | 4 | Volunteer onboarding |
| Lokalråd Hjelpekorps | 4 | Local council (governance) |
| Lokalråd Omsorg | 2 | Local council (governance) |
| Distriktsråd Hjelpekorps | 2 | District council (governance) |
| Distriktsråd Ungdom | 1 | District council (governance) |
| Døråpner | 2 | Vague — "doorman" / community-navigator role; not a clear service |
| EVA | 2 | Unclear acronym; not a defined service |
| Blodgiververving | 1 | Blood-donor recruitment — a Røde Kors-internal function |
| Arrangement og reise | 42 | Events and trips — fundraising / internal events, not user-facing service |

Total: 36 mapped + 14 filtered = 50 ✓

After Phase 3 of this plan, `dim_activity` will hold ~36 rows for Red Cross (one per mapped globalActivityName, deduped) — though some categories will appear multiple times because Red Cross has internal sub-variants (e.g. both "Besøkstjeneste" and "Besøksvenn med hund" map to `elderly_visiting`; the dim_activity row distinguishes them via `canonical_name`, while queries grouping by `service_category_code` collapse them).

**Actual on completion**: 35 rows (not 36). `Internasjonalt distriktsamarbeid` was listed in the "Maps cleanly" section with the annotation "(filtered — administrative)" but is in fact administrative; the SQL CASE for `is_service` correctly marks it `false`. So 50 - 15 = 35 service activities, not 50 - 14 = 36. Appendix A's bookkeeping was off by one; SQL is right.

---

## Plan deviations (resolved during implementation)

Two material discoveries during implementation, both honest reactions to real data:

1. **Red Cross dump has duplicate branch row L192 (Stryn).** The 2026-04-21 dump lists "Stryn Røde Kors" with `branchId = "L098"` twice — identical content. Cause is a Red Cross-side data quirk, not Atlas bug. The first ingest attempt failed with `ON CONFLICT DO UPDATE command cannot affect row a second time` (Postgres flagging two rows with the same PK in one INSERT). Fix: added `seenBranchIds` Set to the ingest script, drop later-occurrence duplicates, log a warning. Final row count: **391 branches** (not the plan's expected 392). Verified across all four branch types: 1 + 18 + 361 + 11 = 391. The plan's expected count of 362 Lokalforening was off by one for the same reason — actual is 361.

2. **`Internasjonalt distriktsamarbeid` bookkeeping**. Appendix A listed this in the "Maps cleanly (30 activities)" section but with the inline annotation "(filtered — administrative)". The SQL implementation correctly treats it as `is_service = false` (filtered out, not service). So `dim_activity` has **35 rows** (50 - 15 filtered), not the plan's predicted 36. The appendix's row labelling was inconsistent; the SQL is right.

Smaller observations:

- **`fact_chapter_activities` row count: 1 941, not ~2 100**. The plan's estimate was 2 400 raw rows minus the 14 non-service activities × however many chapters had them. Actual: 2 143 raw activity rows minus 202 filtered out (the 15 administrative activity types × their chapter counts) = 1 941. Matches the test expectations exactly.
- **WARN count grew by 3** (was 16, now 19). Three new warns are expected and honest:
  - `dim_chapter.kommune_nr → dim_kommune` warn for HQ + a couple Distrikts without postnummer
  - `supply__redcross_branches.kommune_nr → dim_kommune` same
  - `fact_chapter_activities.kommune_nr → dim_kommune` for the 1 row where HQ has a service (admin-flagged but not all admin filtered out yet — covered by `chapter_level = 'local'` filter at query time per Q48)

Lessons captured for future PLANs:

- **Always dedup before upsert when reading static dumps**. Source-of-truth dumps may contain duplicates that don't violate any external constraint (Red Cross's API doesn't enforce uniqueness on `branchId` apparently). Add a Set-based dedup pass before any `ON CONFLICT` upsert. Already done for activities; lesson is that branches need it too.
- **Appendix-style mapping tables drift from SQL implementation**. The "Maps cleanly (30)" section labelled `Internasjonalt distriktsamarbeid` as filtered while putting it in the wrong bucket. SQL is the source of truth; the appendix table is for human reasoning. Cross-check counts after implementation.
