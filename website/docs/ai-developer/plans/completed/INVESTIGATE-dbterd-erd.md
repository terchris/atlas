# Investigate: dbterd for marts ERD generation

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Goal**: Decide whether to adopt [`dbterd`](https://github.com/datnguye/dbterd) to generate an entity-relationship diagram of `marts.*` from dbt artifacts, where the rendered ERD should live in the repo, and how it should be regenerated (manual command, dbt post-hook, CI step).

**Last Updated**: 2026-04-23
**Completed**: 2026-04-23 — adopted dbterd; Mermaid ERD lives at [`docs/stack/erd.md`](https://github.com/terchris/atlas/tree/main/docs/stack/erd.md), regenerated via [`atlas-data/dbt/regenerate-erd.sh`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/regenerate-erd.sh). See [PLAN-dbterd-install-and-document.md](../completed/PLAN-dbterd-install-and-document.md) for the implementation details.

**Origin**: While reviewing the lineage graph in `dbt docs serve` after PLAN-003, the user observed that lineage shows transformation flow but not entity relationships with cardinality. dbt docs ships no ERD view. The `relationships:` tests added in PLAN-003 ([`atlas-data/dbt/models/indicators/schema.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/indicators/schema.yml)) and [`atlas-data/dbt/seeds/schema.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/schema.yml) make Atlas's marts schema unusually well-suited to auto-ERD: dbterd's default algorithm reads exactly those tests.

---

## Questions to Answer

1. Is dbterd actively maintained, healthy, and a reasonable bet for Atlas's pre-production phase?
2. How does dbterd actually work — what artifacts does it consume, what algorithm finds relationships, what output formats does it produce?
3. Will it pick up the indicator → seed relationships we just added, or only model → model edges?
4. Which output format fits Atlas best — Mermaid (renders inline on GitHub), DBML (interactive at dbdiagram.io), or something else?
5. Where in the repo should the rendered ERD live so it stays useful and gets updated?
6. How is regeneration triggered — manual `npm run`-style script, dbt post-hook, GitHub Actions, or something else? What's the lightest thing that won't drift?
7. Should the ERD be checked into git (so GitHub renders it on the PR) or only generated on demand?

---

## Current State

After PLAN-003, the `marts.*` schema has rich relationship metadata declared in dbt's `schema.yml`:

- **Indicator → dim relationships** — every kommune-resolved indicator has a `relationships` test from `kommune_nr` to `dim_kommune.kommune_nr` (some `severity: warn` due to historical codes — see PLAN-003 commit notes), and similarly for `fylke_nr`/`dim_fylke`.
- **Indicator → seed relationships (new)** — five new edges from PLAN-003: `indicators__ssb_06083.family_type` → `ref_ssb_family_type.code`, `indicators__ssb_06944.household_type` → `ref_ssb_household_type.code`, `indicators__ssb_09429.education_level` → `ref_ssb_nivaa.code`, `indicators__fhi_trangbodd.parents_education` and `indicators__fhi_vgs_gjennomforing.parents_education` → `ref_fhi_utdann.code`, and `indicators__fhi_vgs_gjennomforing.immigration_category` → `ref_fhi_innvkat.code`.
- **Fact → dim relationships** — `fact_kommune_indicators` joins `dim_kommune` and `dim_fylke` via SQL, but the schema.yml `relationships` test on the fact table itself isn't checked — that gap might be worth closing as part of any ERD work since `relationships` tests are how dbterd infers edges.

Atlas does not currently:

- Have any rendered ERD anywhere.
- Run dbt in CI (no GitHub Actions touching the dbt project today).
- Use Postgres FK constraints in `marts.*` (relationships are enforced via dbt tests, not the database).

What we do have: `dbt docs serve` (lineage DAG, not ERD), and the rich `schema.yml` from PLAN-003.

---

## How dbterd works (probed 2026-04-22)

**Health signals.** 319 GitHub stars, latest release `1.25.0` published 2026-04-04 (~2 weeks ago), 8 releases in the past 12 months, 0 open issues, not archived. Active and healthy.

**Inputs.** Reads dbt's `target/manifest.json` and `target/catalog.json` — the same artifacts `dbt docs generate` produces. No DB connection needed at ERD-generation time; it works off the parsed dbt project state.

**Relationship discovery — three selectable algorithms** (the choice is `--algo` / `-a`):

1. `test_relationship` (**default**) — reads `relationships:` data tests from `schema.yml`. **This is the one Atlas should use** because PLAN-003 just populated those tests comprehensively.
2. `semantic_entity` — reads dbt Semantic Layer entity definitions. Atlas has none.
3. `model_constraints` — reads dbt model contract `foreign_key` constraints (dbt 1.9+). Atlas isn't on contracts.

**Output formats** (the choice is `--target` / `-t`):

| Format | Strength | Weakness |
|---|---|---|
| `mermaid` | Renders natively on GitHub, in any Markdown viewer; one file lives in repo | Layout is auto, no manual control |
| `dbml` | Pastes into [dbdiagram.io](https://dbdiagram.io) for interactive view | External tool; not inline |
| `plantuml` | Common in technical docs; many viewers | Requires PlantUML renderer |
| `graphviz` | DOT format, scriptable | Bigger toolchain |
| `d2` | Modern syntax; nicer layouts than mermaid | Newer, smaller community |
| `drawdb` | Web-based interactive editor | External tool |

**CLI shape.**

```bash
dbterd run \
  --artifacts-dir <path-to-dbt-target> \
  --target mermaid \
  --output <output-dir> \
  --select schema:marts \
  --resource-type model \
  --resource-type source
```

Default output file is `<output-dir>/output.md` (with `--output-file-name`/`-ofn` to override). The `-s schema:marts` filter limits the ERD to one schema — useful for keeping the diagram focused.

**Resource types — empirical question.** The CLI docs formally list only `model` and `source` for `--resource-type`. The underlying filter at [`dbterd/core/filter.py`](https://github.com/datnguye/dbterd/blob/main/dbterd/core/filter.py) does an unrestricted membership check (`table.resource_type in resource_types`), so `--resource-type seed` *should* be accepted, but whether the rest of the rendering pipeline draws seed nodes correctly hasn't been verified. **This needs to be tested** before committing to a final config — Atlas's five `ref_*` seeds are a meaningful part of the ERD.

**Versions.** Python 3.9–3.13, dbt 1.x. Atlas's dbt venv runs Python 3.12 + dbt-core 1.8.9 — fully supported.

**Install.** `uv pip install dbterd` into the existing `atlas-data/dbt/.venv/`. No system packages, no daemons.

**Config file.** Supports `.dbterd.yml` or a `[tool.dbterd]` section in `pyproject.toml` so the CLI flags don't have to be repeated. Atlas would put one in `atlas-data/dbt/`.

---

## Options

### A. Mermaid checked into the repo, regenerated by manual command

- Run `dbterd run -t mermaid -ad target -o ../../../docs/stack -ofn erd.md -s schema:marts` from `atlas-data/dbt/`.
- Add an npm-style script to `atlas-data/dbt/README.md` (and as a target if we ever add a Makefile).
- The rendered `docs/stack/erd.md` is checked into git; GitHub renders the Mermaid block inline; the PR diff shows ERD changes alongside the schema changes that caused them.
- Regeneration is a developer responsibility — same as `npm run refresh-seeds` from PLAN-001.

**Pros**: simplest pipeline; ERD visible on GitHub without leaving the repo; PR reviews see ERD changes; no new infra.
**Cons**: relies on developer discipline. If someone changes `schema.yml` without regenerating, the ERD drifts. Acceptable now (small team, pre-prod) but a real risk later.

### B. Same as A, plus a CI check that fails if the committed ERD differs

- After option A's setup, add a GitHub Actions step that re-runs the command and `git diff --exit-code -- docs/stack/erd.md`. If the diff is nonzero, the PR fails until the contributor regenerates and commits.
- Mirrors how some projects gate `prettier --check` or `mypy`.

**Pros**: zero drift between schema.yml and rendered ERD; no developer discipline needed.
**Cons**: requires Atlas to first set up dbt-running CI (currently nothing runs dbt in CI). That's a real chunk of work — Postgres in CI, env-file handling, the whole apparatus. Better as a follow-up once Atlas has a CI dbt environment.

### C. dbt post-hook — regenerate ERD on every `dbt build`

- Add an `on-run-end` hook in `dbt_project.yml` that shells out to dbterd. Or a separate `dbterd run` step the user runs after `dbt run`.
- Tighter coupling: every full build refreshes the ERD.

**Pros**: no separate command to remember.
**Cons**: dbt's `on-run-end` is for SQL operations, not subprocess shell-outs (would need a Python operation or external script). Adds latency to every `dbt build`. Mixes concerns.

### D. DBML output published to dbdiagram.io

- Generate `target/atlas.dbml`, paste into [dbdiagram.io](https://dbdiagram.io) for an interactive view.

**Pros**: interactive ERD with drag-rearrange, zoom, link sharing.
**Cons**: external service; the canonical view isn't in the repo; harder to PR-review.

### E. Hybrid: Mermaid in repo + DBML as artifact

- Generate both formats, commit only the Mermaid, leave the DBML as an unversioned `target/atlas.dbml` for anyone who wants the dbdiagram.io view.

**Pros**: GitHub gets inline diagram; power users get interactive view on demand.
**Cons**: Two outputs to maintain — but both are produced by the same `dbterd run` invocation, so cost is near zero.

---

## Recommendation — hybrid (option E), single bundled plan

For the implementation plan that follows this investigation:

1. **Install dbterd into the dbt venv**: `uv pip install dbterd` (pin in `requirements.txt` alongside `dbt-core`).
2. **Create `atlas-data/dbt/.dbterd.yml`** with the canonical config: `target: mermaid`, `select: schema:marts`, `resource_type: [model, source]` (extend with `seed` after empirical verification — see step 4), `output: ../../../docs/stack`, `output_file_name: erd.md`.
3. **Run once, commit `docs/stack/erd.md`**. Spot-check that the indicator → seed → dim edges all appear and that cardinalities make sense.
4. **Empirically test `--resource-type seed`**. If seeds render with their inbound relationships, add `seed` to the config. If they render badly (orphan nodes, missing edges), document the gap and either work around it (write the relationships in a way dbterd understands) or skip seeds with a comment in the config explaining why.
5. **Document the workflow in [`atlas-data/dbt/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/README.md)**: one paragraph + the regeneration command. Cross-link from [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) so contributors looking at the vocabulary see "the ERD shows current state".
6. **Defer the CI gate (option B) until Atlas has CI for dbt**. Track it as a future plan; not blocking.

Skip dbt post-hook (option C). Skip DBML-only (option D). The Mermaid-in-repo flow is the lightest weight thing that gives the most consumer value (GitHub renders it for everyone with no setup).

---

## Open Questions

1. **Does `--resource-type seed` actually work end-to-end?** The filter accepts it; the renderer might not. Resolve empirically in PLAN-001.
2. **Should the fact ↔ dim relationships be added to `schema.yml` first?** `fact_kommune_indicators.kommune_nr` → `dim_kommune.kommune_nr` would be inferred by dbterd's `test_relationship` algo if the test exists. Right now the join is in SQL but no `relationships` test enforces it. Adding it would make the ERD show the fact's edges too. (Cost: one schema.yml stanza; benefit: a more complete ERD.)
3. **Should label columns (`*_label_no`, `*_label_en`) appear in the ERD or be hidden via `--omit-columns`?** They're present on every indicator that joins a seed. Including them makes the boxes taller; omitting them keeps the diagram readable. Probably show them — they're part of the contract.
4. **Format negotiation: Mermaid vs D2.** D2 (newer) produces visually nicer layouts than Mermaid for graphs of this size. But Mermaid renders on GitHub natively; D2 requires a renderer. Sticking with Mermaid trades aesthetics for accessibility — likely the right trade for Atlas.

---

## Next Steps

Following the [PLANS.md](../../PLANS.md) guidance — one bundled implementation plan since the scope is small and the steps are sequential.

- [ ] **PLAN-dbterd-install-and-document.md** — Install dbterd into the dbt venv (pin in `requirements.txt`). Add `.dbterd.yml`. Run once, eyeball the output, commit `docs/stack/erd.md`. Test seed support empirically; finalise the config based on what works. Add a "Regenerating the ERD" section to `atlas-data/dbt/README.md`. Consider adding a `relationships` test for `fact_kommune_indicators.kommune_nr → dim_kommune.kommune_nr` so the fact's edges show up too.

Estimated effort: 1–2 hours.

### Not in scope for this investigation

- CI gate for ERD drift (option B) — wait until Atlas has dbt CI generally.
- DBML/dbdiagram.io publishing pipeline.
- Custom styling beyond Mermaid defaults.
- Extending the ERD to cover `raw.*` (out of scope for marts contract).

---

## Files to Modify (when promoted to PLAN)

New:
- `atlas-data/dbt/.dbterd.yml`
- `docs/stack/erd.md` *(generated, committed)*

Edit:
- `atlas-data/dbt/requirements.txt` — add `dbterd>=1.25,<2`
- `atlas-data/dbt/README.md` — add "Regenerating the ERD" section
- `docs/stack/naming-conventions.md` — cross-link to the new ERD
- `atlas-data/dbt/models/marts/schema.yml` — *maybe* add `relationships` test for `fact_kommune_indicators.kommune_nr` (open question 2)

---

## Cross-references

- [`atlas-data/dbt/models/indicators/schema.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/indicators/schema.yml) — the relationship metadata dbterd's default algorithm reads.
- [`atlas-data/dbt/seeds/schema.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/schema.yml) — seed-side metadata; relevant if `--resource-type seed` works.
- [`docs/stack/naming-conventions.md`](https://github.com/terchris/atlas/tree/main/docs/stack/naming-conventions.md) — the canonical vocabulary the ERD should reflect.
- [`completed/INVESTIGATE-code-label-mapping.md`](../completed/INVESTIGATE-code-label-mapping.md) — the work that produced the rich `schema.yml` this investigation builds on.
- dbterd repo: <https://github.com/datnguye/dbterd>
