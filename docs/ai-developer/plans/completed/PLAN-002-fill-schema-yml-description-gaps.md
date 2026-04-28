# PLAN-002 — Fill 180 schema.yml description gaps

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Complete — 2026-04-28

All 180 columns documented across 5 PRs (#22 phase 1 — seeds, #23 phase 2 — dimensions + marts, #24 phase 3 — indicators, #25 phase 4 — private_marts, and the phase 5+6 PR closing supply + tightening the strict gate). `check-osmosis.sh` now enforces "every column documented" repo-wide; a missing description fails CI.

**Goal** (achieved): Fill in the **180 column descriptions** that dbt-osmosis surfaced as undocumented across the existing dbt models when PLAN-001 phase 1 ran the baseline. These columns produce data the public PostgREST API will expose; without descriptions, the auto-generated OpenAPI spec is uninformative for external consumers.

**Last Updated**: 2026-04-28

**Origin**: PLAN-001 phase 1 ran `dbt-osmosis yaml document` twice (it took two passes to converge — propagation discovers more bare columns on the second pass). The tool surfaced **180 columns** that exist in `marts.*` (and `private_marts.*` and `raw.*` source declarations) but were never documented in any `schema.yml`. PLAN-001 [Q5] said "full descriptions on all 9 mart_* views — public OpenAPI surface"; the same standard should eventually apply to the existing 60+ models. Filling all 180 in PLAN-001 itself was rejected (option C) as too big for that PLAN's scope; PLAN-001 chose option D (accept the gaps, track here, ratchet up over time).

---

## The 180 backlog by file

Snapshot from PLAN-001 phase 1 baseline run (2026-04-27). The check script (`atlas-data/dbt/check-osmosis.sh`) prints the current count — re-run to track progress.

| File | Columns | Notes |
|---|---:|---|
| `atlas-data/dbt/models/supply/schema.yml` | **77** | Largest gap. Supply models (`supply__redcross_*`, `supply__frr_*`) and `dim_chapter` extensions. |
| `atlas-data/dbt/models/indicators/schema.yml` | **48** | Per-source `indicators__*` passthroughs. Many columns inherit naturally from `naming-conventions.md` canonical vocabulary; could be propagated mechanically. |
| `atlas-data/dbt/models/private_marts/schema.yml` | **34** | FRR (Felles Ressursregister) models. Some columns require domain knowledge to describe. |
| `atlas-data/dbt/models/dimensions/schema.yml` | **12** | Conformed dimensions — small fixable chunk. |
| `atlas-data/dbt/models/marts/schema.yml` | **7** | Cross-source mart facts. |
| `atlas-data/dbt/seeds/schema.yml` | **2** | Reference seeds. Trivial. |
| **TOTAL** | **180** | |

## How to verify the count today

```bash
cd atlas-data/dbt
./check-osmosis.sh
```

The script prints per-file counts plus a total. As descriptions get added, counts go down.

---

## Suggested phased approach

Pick one file at a time; each is self-contained and independently mergeable.

### Phase 1 — `seeds/schema.yml` (2 columns)

Trivial warm-up. ~10 minutes.

### Phase 2 — `dimensions/schema.yml` (12 columns) + `marts/schema.yml` (7 columns)

Conformed dimensions and cross-source mart facts. Match the canonical vocabulary in [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) — most descriptions probably already exist there and just need to be propagated into schema.yml. The 7 in `marts/schema.yml` are likely on `fact_kommune_indicators` / `fact_chapter_activities` / `chapter_kommune_coverage` and feed downstream lineage, so prioritising them propagates descriptions widely. ~45 minutes.

### Phase 3 — `indicators/schema.yml` (48 columns)

Per-source `indicators__*` passthroughs. Many columns repeat across sources (`source_id`, `region_code`, `kommune_nr`, `year`, `contents_code`, `value`, `status`, `updated_at`). Use dbt-osmosis's description-propagation: write each canonical column description once on `dim_kommune` / `dim_fylke` / `fact_kommune_indicators`, then re-run `dbt-osmosis yaml document` to inherit it across all the indicator models. ~2-3 hours.

### Phase 4 — `private_marts/schema.yml` (34 columns)

FRR models. Some columns are FRR-specific and need domain knowledge (consult [`atlas-private-data-repo/redcross/docs/felles-ressursregister-frr-openapi-spec.md`](../../../../../atlas-private-data-repo/redcross/docs/felles-ressursregister-frr-openapi-spec.md) if available, otherwise the FRR upstream docs). ~2-3 hours.

### Phase 5 — `supply/schema.yml` (77 columns)

Largest gap. Supply staging models inherit canonical-vocabulary descriptions from `dim_*` once propagation runs; a smaller residual is supply-side-specific (e.g. `record_hash`, `html_raw_hash`, `is_active` semantics for scraped sources). ~3-4 hours.

### Phase 6 — Verify zero gaps

After phases 1-5, `./check-osmosis.sh` should report TOTAL = 0 (or near-zero — there may be intentional `data_type:`-without-`description:` entries for columns that explicitly have no public meaning). Once at zero, tighten the script's strict mode to enforce descriptions on **all** of `marts.*`, not just `marts/api/`.

---

## Acceptance criteria

- [ ] `./check-osmosis.sh` reports TOTAL = 0 (or documented exceptions)
- [ ] `dbt-osmosis yaml document --dry-run --check` exits 0 on the whole project
- [ ] check-osmosis.sh's strict mode tightened to cover all of `marts.*` (not just `marts/api/`)
- [ ] Update [naming-conventions.md](../../../stack/naming-conventions.md) — note the convention is now enforced repo-wide

---

## What this PLAN does NOT do

- Add new dbt models. (PLAN-001 does the new `mart_<feature>` views.)
- Change any model's logic — pure metadata work.
- Rewrite schema.yml structure — descriptions added in place, no reorganisation.

---

## Cross-references

- [PLAN-001-api-mart-views.md](PLAN-001-api-mart-views.md) — surfaced these gaps via dbt-osmosis baseline.
- [`atlas-data/dbt/check-osmosis.sh`](../../../../atlas-data/dbt/check-osmosis.sh) — the script that counts the gap.
- [`docs/stack/naming-conventions.md`](../../../stack/naming-conventions.md) — the canonical vocabulary that most descriptions should reference.
- [INVESTIGATE-public-api-surface.md](INVESTIGATE-public-api-surface.md) — the API plan PLAN-001 implements; rich descriptions matter because PostgREST projects them as OpenAPI.
