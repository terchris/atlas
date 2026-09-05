# PLAN: The catalogue cannot see `api_v1` views added in the same cycle

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: `/data` lists every queryable endpoint. Today it lists every `api_v1` view **except the
ones added most recently**, and nobody would notice unless they counted.

**Last Updated**: 2026-09-05

**Priority**: Medium. Nothing is broken for existing endpoints, but the catalogue is the product's
own discovery surface — an endpoint it does not list may as well not exist for a consumer who is
using it to find things.

**Origin**: Found by the independent tester on 2026-09-05 while checking something else: 13 `api_v1`
views exist, `api_v1.meta_endpoints` lists **10**. Missing: `bufdir_indicator_alias`,
`meta_dimensions`, `meta_sources`.

---

## Problem Summary

It is an ordering defect, not an exclusion rule.

- `mart_meta_endpoints` is built **during `dbt run`** and reads `information_schema.tables` for
  `api_v1`, `marts` and `raw`.
- The `api_v1` wrapper views are created **after `dbt run`**, by the `api_v1_surface` asset. That
  ordering is necessary and correct: the wrappers select from `marts.mart_*` tables, which do not
  exist until dbt has built them.

So the catalogue records whatever `api_v1` views existed on the **previous** cycle.

**Consequences:**

- A newly added `api_v1` view is invisible to `/data` for one full transform cycle.
- On a genuinely fresh database, the catalogue lists **zero** `api_v1` endpoints while all thirteen
  are live and queryable — which matters directly for
  [INVESTIGATE-atlas-data-as-deployable-application](INVESTIGATE-atlas-data-as-deployable-application.md),
  because a stranger's first install is exactly the fresh-database case.
- The count is quietly wrong rather than visibly broken. `marts` and `raw` are unaffected, so the
  total looks plausible.

The exclusion filters (`table_name not like '\_%'`, `not like 'dbt\_%'`) are not involved — none of
the three missing views match them.

## Approaches to consider

Not settled; the phases below assume one is chosen first.

1. **Build the catalogue after the views exist.** A second, later-running model or an asset that
   refreshes `mart_meta_endpoints` once `api_v1_surface` has run. Correct, but introduces a
   dependency from a `marts` model onto a post-dbt step, which is the inversion that caused this.
2. **Derive `api_v1` rows from the generator rather than the database.** `generate_api_v1.py` knows
   every view it is about to create; `api_v1_generated.sql` is the source of truth for that schema.
   Reading the intent rather than the deployed state removes the ordering dependency entirely.
3. **Have `api_v1_surface` write the catalogue rows** for its own schema after creating the views.

⚠️ Option 2 is the most promising and has the sharpest failure mode: it would list a view that was
*supposed* to be created even if creation failed. Whatever is chosen must not let the catalogue
claim an endpoint that is not there — that is a worse defect than the one being fixed, and it is the
same "reports the same thing whether or not it is true" class this repo keeps meeting.

## Phases

### Phase 1 — reproduce
- [ ] Confirm the mechanism locally: create a new `api_v1` view, run the transform, and show it
      absent from `meta_endpoints`; run the transform again and show it present.
- [ ] Confirm the fresh-database case lists zero `api_v1` endpoints.

### Phase 2 — fix
- [ ] Choose an approach and record why.
- [ ] Implement.

### Phase 3 — prove it
- [ ] The Phase 1 reproduction now shows the view on the **first** cycle.
- [ ] **Make it fail on purpose**: with the fix in place, arrange for a view's creation to fail and
      require the catalogue **not** to list it. A fix that cannot distinguish "created" from
      "intended" has replaced a lag with a lie.

## Acceptance

- `count(*) from api_v1.meta_endpoints where schema_name = 'api_v1'` equals the number of views
  actually present in `api_v1`, on the first cycle after a change.
- A fresh database yields a complete catalogue on its first transform.
- The negative case above is demonstrated, not argued.
