# Plan: Reference & dimension table naming convention in naming-conventions.md

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Codify the reference/dimension table convention from [INVESTIGATE-reference-tables-convention.md](INVESTIGATE-reference-tables-convention.md) into [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md), and align the wording in [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md) to use the convention. Doc-only change, no data tables built.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23

**Investigation**: [INVESTIGATE-reference-tables-convention.md](INVESTIGATE-reference-tables-convention.md)
**Blocks**: PLAN-A of [INVESTIGATE-ngo-supply-data-model.md](INVESTIGATE-ngo-supply-data-model.md) (which builds the first tables that will follow this convention).
**Priority**: Medium — small, but blocks the cleanly-named NGO-supply tables.

---

## Overview

The investigation chose **Option A + D**: keep `dim_*`, refine `ref_*` to `ref_<owner>_<concept>`, add `crosswalk_<from>_<to>` as a third pattern. Refresh cadence in four buckets (never / rare / periodic / curated). User confirmed two open micro-decisions on 2026-04-23:

- **Q1**: `ref_atlas_*` for Atlas-owned vocabularies (consistent owner-token).
- **Q2**: `dim_postnummer` (treat postnummer as a real entity, not a routing table).

This PLAN is the doc work that lands the convention before the first new tables (PLAN-A of NGO-supply) are built.

No naming churn for existing tables — `dim_kommune`, `dim_fylke`, and the five `ref_<ssb|fhi>_*` seeds already follow the convention.

---

## Phase 1: Update naming-conventions.md — DONE

### Tasks

- [x] 1.1 In [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md), extended the **Model naming** table with `ref_<owner>_<concept>` and `crosswalk_<from>_<to>` rows. Owner-token rule documented; existing `ref_ssb_*` and `ref_fhi_*` already conform.
  - `ref_<owner>_<concept>` — examples: `ref_ssb_family_type`, `ref_brreg_icnpo`, `ref_un_sdg`, `ref_atlas_service_category`. ✓
  - `crosswalk_<from>_<to>` — examples: `crosswalk_kommune_name`, `crosswalk_activity_to_category`. ✓
- [x] 1.2 Tightened the `dim_*` row description (owner is implicit, no second token). ✓
- [x] 1.3 Added the **Reference table refresh cadence** subsection with all four buckets (never / rare / periodic / curated), examples, and the "choose at creation" guidance. ✓
- [x] 1.4 Added the cross-link line in **Decoding strategy reference** pointing at Model naming and the rationale investigation. ✓
- [x] Bonus: added a "Choosing between `dim_*` and `ref_*`" guidance subsection inline with the table since the practical rule deserves prose alongside the patterns. ✓

### Validation

User reads the updated [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) and confirms:
- The two new naming patterns are clear and example-backed.
- The four refresh buckets read as actionable, not abstract.
- No conflict with existing rules (no rename of existing tables required).

---

## Phase 2: Align the NGO-supply investigation to the convention — DONE

### Tasks

- [x] 2.1 Renamed in [`INVESTIGATE-ngo-supply-data-model.md`](../completed/INVESTIGATE-ngo-supply-data-model.md):
  - `ref_icnpo` → `ref_brreg_icnpo` ✓
  - `ref_service_category` → `ref_atlas_service_category` ✓
  - `ref_sdg` was never present as a table (only mentioned as a `sdg_goals` attribute on `ref_atlas_service_category`); no rename needed. ✓
- [x] 2.2 Added the cross-link line at the top of "Recommendation — phased plan" pointing at `naming-conventions.md` and this investigation. ✓

### Validation

User confirms the renamed references read consistently and PLAN-A — when drafted later — will use these names.

---

## Acceptance Criteria

- [ ] [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) lists `ref_<owner>_<concept>` and `crosswalk_<from>_<to>` in the Model naming table with at least two examples each.
- [ ] The "Reference table refresh cadence" subsection lists the four buckets (never / rare / periodic / curated) with examples and a one-line guidance on choosing.
- [ ] [`INVESTIGATE-ngo-supply-data-model.md`](INVESTIGATE-ngo-supply-data-model.md) uses `ref_brreg_icnpo`, `ref_un_sdg`, `ref_atlas_service_category` consistently (no leftover short forms).
- [ ] Both files cross-link to [`INVESTIGATE-reference-tables-convention.md`](INVESTIGATE-reference-tables-convention.md) so future contributors can find the rationale.
- [ ] No data tables, dbt models, or SQL changes — pure documentation.

---

## Implementation Notes

- **No CI gate / automated check.** Convention compliance is enforced socially by reviewing new `marts.*` tables in PRs, like the rest of `naming-conventions.md`.
- **Existing tables are grandfathered.** The convention reads forward; `dim_kommune` and `ref_ssb_family_type` already conform. No rename, no migration.
- **The seed schema.yml from PLAN-003** (`atlas-data/dbt/seeds/schema.yml`) doesn't need to change — it already documents the existing five seeds. New seeds added under the convention will get entries there per the existing pattern.
- **The ERD ([`docs/stack/erd.md`](https://github.com/terchris/atlas/tree/main/docs/stack/erd.md)) doesn't change** — it auto-regenerates from the dbt manifest when new tables are added; the convention only changes table names, not how dbterd reads them.

---

## Files to Modify

Edit:
- `docs/stack/naming-conventions.md` — Model naming table extension + new "Reference table refresh cadence" subsection + one-liner update to "Decoding strategy reference"
- `docs/ai-developer/plans/backlog/INVESTIGATE-ngo-supply-data-model.md` — rename three table references + cross-link line
