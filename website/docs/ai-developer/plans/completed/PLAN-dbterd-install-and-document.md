# Plan: Install dbterd, generate marts ERD, document the workflow

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Generate a Mermaid ERD of `marts.*` from the dbt artifacts using [dbterd](https://github.com/datnguye/dbterd), commit it at `docs/stack/erd.md` so GitHub renders it, and document the regeneration command for future contributors.

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23

**Investigation**: [INVESTIGATE-dbterd-erd.md](INVESTIGATE-dbterd-erd.md)
**Priority**: Medium — finishes the "what does marts look like" story PLAN-003 implicitly raised.

---

## Overview

PLAN-003 populated `relationships:` tests across the marts schema. This plan converts that metadata into a visible artifact: an ERD that lives in the repo, renders on GitHub, and stays useful with one command.

Decisions resolved during planning (2026-04-23):

- **Format**: Mermaid (renders inline on GitHub; no external tool required).
- **Location**: `docs/stack/erd.md` (next to `naming-conventions.md` and `data-strategy.md`).
- **Pipeline**: manual regeneration via a script in [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/README.md). No CI gate (Atlas has no dbt CI yet — defer until that lands).
- **Add a `relationships` test for `fact_kommune_indicators.kommune_nr → dim_kommune`** (and similarly for `fylke_nr`) so the fact's edges show up in the ERD. Currently the join is in SQL but no test enforces it; without the test dbterd's `test_relationship` algo can't draw those edges.
- **Labels (`*_label_no`, `*_label_en`) stay visible** on indicator entities. They're part of the marts contract — hiding them would make the ERD lie about what consumers see. Tall boxes are an acceptable cost.
- **Seed support**: empirical — see Phase 2.

---

## Phase 1: Install and add the missing fact relationships — DONE

### Tasks

- [x] 1.1 Added `dbterd>=1.25,<2` to [`atlas-data/dbt/requirements.txt`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/requirements.txt). ✓
- [x] 1.2 Installed via `uv pip install -r requirements.txt`. `uv run dbterd --version` reports `1.25.0`. ✓
- [x] 1.3 No-op: `marts/schema.yml` already declares `relationships` tests for both `fact_kommune_indicators.kommune_nr → dim_kommune` and `fylke_nr → dim_fylke`. The investigation's open question 2 was based on me not reading the file first. ✓
- [x] 1.4 No-op: existing tests already cover this; PLAN-003's `dbt build` already validated them. ✓

### Validation

User confirms the new tests run and the kommune-side test passes; fylke side either passes or warns with a documented count.

---

## Phase 2: Generate ERD and resolve seed-rendering question

Empirically determine whether `--resource-type seed` produces useful output, then commit the right config.

### Tasks — DONE

- [x] 2.1 Smoke test with `--resource-type model --resource-type source`: 20 entities, 36 relationships. Indicator → dim and fact → dim edges all rendered correctly. ✓
- [x] 2.2 Smoke test with `--resource-type seed` added: **works perfectly**. 25 entities (5 ref_* seeds added), 42 relationships (6 indicator → seed edges visible: ssb_06083→family_type, ssb_06944→household_type, ssb_09429→nivaa, fhi_trangbodd→utdann, fhi_vgs→utdann, fhi_vgs→innvkat). dbterd's underlying filter accepts `seed` even though the formal CLI docs only list `model`/`source`. ✓
- [x] 2.3 Wrote [`atlas-data/dbt/.dbterd.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/.dbterd.yml) with `model + source + seed` resource types, schema:marts selector, output to `docs/stack/erd.md`. ✓
- [x] 2.4 Generated `docs/stack/erd.md`. ✓ Confirmed: 25 entities, 42 relationships.

---

## Phase 3: Document and cross-link — DONE

### Tasks

- [x] 3.1 Added "Regenerating the marts ERD" section to [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/README.md) explaining what the ERD is, when to regenerate, and how. ✓
- [x] 3.2 Added cross-link to [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) at the end of the "How this file is enforced" section. ✓
- [x] 3.3 dbterd writes raw `erDiagram` syntax (no Mermaid fence — GitHub wouldn't render it). Wrote a tiny wrapper [`atlas-data/dbt/regenerate-erd.sh`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/regenerate-erd.sh) (~25 lines bash) that runs `dbt docs generate` + `dbterd run`, then prepends a "DO NOT EDIT" header + Markdown intro and wraps the body in a ```` ```mermaid ```` fence. README points at this script as the canonical regeneration command. ✓

---

## Acceptance Criteria

- [ ] `dbterd --version` runs cleanly via `uv run` in the dbt venv.
- [ ] [`atlas-data/dbt/.dbterd.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/) exists with config that produces a working ERD via `uv run dbterd run` (no extra flags).
- [ ] [`docs/stack/erd.md`](https://github.com/terchris/atlas/tree/main/docs/stack/erd.md) is committed and renders on GitHub as a Mermaid diagram showing every marts entity and its relationships.
- [ ] Indicator → seed edges (from PLAN-003) are visible OR the rationale for their absence is documented in `.dbterd.yml`.
- [ ] Fact → dim_kommune + fact → dim_fylke edges are visible (because of the new tests in Phase 1).
- [ ] [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/README.md) documents the regeneration command.
- [ ] [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) cross-links to `erd.md`.
- [ ] `dbt test` still passes with the new fact relationship tests (PASS grows by 2; WARN may grow by 1 if fylke side warns).

---

## Implementation Notes

- **Why pin dbterd to `>=1.25,<2`.** The 1.x line has had a regular release cadence (8 releases in the past year). A major-version bump could change CLI flags or output format; pin to the current major to avoid surprise breaks.
- **Why no `--severity: warn` on the fact's `kommune_nr` test.** The fact INNER JOINs `dim_kommune`, so by construction every kommune_nr in the fact is in the dim. A failing test there would be a real bug (e.g. a refresh ordering issue), not historical-data noise.
- **Why labels stay visible.** Hiding columns the consumer can SELECT would create an ERD that doesn't match the table. The marts contract includes the label columns — the ERD should show them.
- **Why no CI gate.** Atlas has no GitHub Actions running dbt today. Adding one just for the ERD is disproportionate. When Atlas grows a dbt-CI environment for other reasons (PR validation, etc.), folding in a `dbterd run + git diff --exit-code` gate is a small follow-up.
- **About header preservation.** dbterd writes the whole file. If we want a header explaining "do not edit", we either (a) accept that dbterd overwrites it and re-add it manually after regen, or (b) wrap the regen in a tiny shell script that prepends the header. Phase 3.3 picks the lighter approach when we see what dbterd actually produces.

---

## Files to Modify

New:
- `atlas-data/dbt/.dbterd.yml`
- `docs/stack/erd.md` *(generated, committed)*

Edit:
- `atlas-data/dbt/requirements.txt` — add `dbterd>=1.25,<2`
- `atlas-data/dbt/README.md` — add "Regenerating the ERD" section
- `atlas-data/dbt/models/marts/schema.yml` — add `fact_kommune_indicators` relationships tests
- `docs/stack/naming-conventions.md` — add cross-link to `erd.md`
