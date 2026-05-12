# PLAN: Dataset integration block — surface Atlas's derived layer on each dataset page

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed

**Completed**: 2026-05-12

**Branch (stacks)**: `feature/sources-catalog-foundation` (same branch as PR #104).

**Goal**: Make Atlas's *derived* layer visible from each per-dataset page — the dbt-built indicators, facts, and `api_v1.*` consumer views that consume this dataset. This is Option B+ from the indicators-surface discussion: one catalogue umbrella (`/datasets`), no separate `/indicators` page, but each dataset page surfaces the Atlas integration context contextually so users like Lisa (grant officer) see methodology and query target on one screen instead of bouncing between two URLs.

**Last Updated**: 2026-05-12

**Prerequisites**:
- ✅ PLAN-002 — sources catalog foundation.
- ✅ PLAN-catalog-vocabulary — dataset / topic / publisher terminology.
- ✅ `atlas-data/dbt/seeds/sources/lineage.csv` — 129 edges, `model_name,source_id` shape (already in the repo).

**Blocks**: PLAN-003 (merchandising) — collections can recommend dataset+indicator pairs that this PLAN makes legible.

---

## What changes

Each per-dataset MDX page gains two new sections between **Provenance** and **Dimensions**:

### "In Atlas"

Surfaces the Atlas mart / `api_v1.*` views that consume this dataset:

- For each `mart_<feature>` that reads from this dataset's raw tables (via `lineage.csv`):
  - Sample PostgREST URL (`https://api-atlas.sovereignsky.no/<feature>?limit=5`).
  - One-line description of what the mart does.
  - "Try this query at /api →" link.
- Plus a fallback note when no mart consumes this dataset yet (e.g. for `dim_*` references or fresh sources).

### "Joined with"

Surfaces other datasets that co-occur with this one in the same dbt model — that is, the datasets you'd typically *combine* with this one in a real query:

- Computed by walking `lineage.csv`: for each model that includes this dataset, list every other dataset that also feeds the model.
- Aggregated, deduped, and ranked by how many shared models a pair has (the more often two datasets appear in the same mart, the closer the relationship).
- Capped at 6 cards.
- Each card shows the other dataset's name + the dbt models they share.

Both sections are derived at generator time from `lineage.csv` — no editorial input needed. The data is honest about what Atlas actually composes today.

### Why this matters for personas

- **Lisa** (grant officer) lands on `ssb-08764`, reads methodology, then sees *"This dataset is queryable via `api_v1.indicator_latest_values`. It joins with `ssb-06944`, `ssb-12944`, `bufdir-barnefattigdom` in the kommune low-income mart."* — citation source and query target on one screen.
- **Dev** sees the Atlas-mart layer without leaving the dataset page; doesn't need to learn dbt-model names from `/lineage/`.
- **Ola** sees which datasets compose into Atlas indicators — a transparency signal about how Atlas mediates between upstream and queryable surface.

---

## Phase 1: Extend the generator

### Tasks

- [ ] 1.1 Add `LINEAGE_CSV` constant pointing at `../atlas-data/dbt/seeds/sources/lineage.csv` and a `loadLineage()` function that parses the CSV (no `csv-parse` dep needed — simple two-column shape).

- [ ] 1.2 For each source, compute:
  - `consuming_marts[]`: array of `{ mart_name, api_v1_name, description, sample_query }`. Filter the lineage edges to model names starting with `mart_`; map `mart_<feature>` → `api_v1.<feature>` per Atlas's naming convention; build a `?limit=5` sample query URL.
  - `consuming_models[]`: array of all model names that read from this dataset's raw tables, grouped by prefix (`indicators__`, `dim_`, `fact_`, `mart_`, `ref_`, `crosswalk_`, etc.). Useful for the "internal" lineage drill-down.
  - `joined_with[]`: array of `{ source_id, shared_models: [model_name, ...] }`. For each dbt model that includes this dataset's source_id, find every OTHER source_id that also feeds the model. Dedupe; sort by `shared_models.length` desc; cap at 8.

- [ ] 1.3 Where a mart's description isn't available in `lineage.csv` (it isn't — the CSV is just edges), source a one-line description from the dbt project's `schema.yml` files OR from a hand-authored map in `atlas-data/ingest/src/sources/mart-descriptions.yaml` (new optional companion file). For v1, accept "no description available" as a fallback; the mart name itself reads as a hint.

  Decision deferred: Phase 1.3 implementation — see Implementation Notes.

### Validation

```bash
cd website && npm run sources:generate
jq '.sources[] | select(.source_id == "fhi-mobbing") | {consuming_marts, joined_with}' src/data/sources-registry.json
```

Expected: `fhi-mobbing` shows ~3 consuming marts (e.g. `mart_indicator_latest_values`, `mart_indicator_summary`, `mart_coverage_gap_barnefattigdom` if applicable) and joined-with datasets including the geography reference (`ssb-klass-kommuner`), the age denominators (`ssb-07459`), and the youth education siblings.

User confirms phase is complete.

---

## Phase 2: New React components

### Tasks

- [ ] 2.1 `<DatasetAtlasIntegration source={source}>` — the wrapper rendering both sub-sections. Lives at `website/src/components/sources/DatasetAtlasIntegration.tsx`.

- [ ] 2.2 `<DatasetQueryMarts source={source}>` — the "In Atlas" section. For each `consuming_marts[]` entry, renders a card with:
  - Mart name as title (e.g. `api_v1.indicator_latest_values`).
  - Short description (if available).
  - Copy-clickable sample query URL.
  - "Try this query at /api →" link to `/api`.
  - "View in lineage →" link to `pathname:///lineage/#!/model/model.atlas.mart_<feature>`.

- [ ] 2.3 `<DatasetJoinedWith source={source}>` — the "Joined with" section. For each `joined_with[]` entry:
  - Card with: target dataset title, publisher logo, topic emoji.
  - Subtitle: "Joined in: `mart_low_income_summary`, `fact_kommune_indicators`" (model names as join-context evidence).
  - Click → `/datasets/<source_id>`.

- [ ] 2.4 Shared styles in `styles.module.css` — extend the existing `.relatedStrip` pattern.

### Validation

- [ ] Components typecheck.
- [ ] Components render with mock data (or live data from a regenerated registry).

---

## Phase 3: MDX template + sidebar

### Tasks

- [ ] 3.1 Update `renderSourceMdx()` in `website/scripts/generate-sources-registry.mjs` to import and render `<DatasetAtlasIntegration>` between Provenance and Dimensions.

  Section heading: `## In Atlas {#in-atlas}` (new stable anchor — add to the **[Q34]** contract).

- [ ] 3.2 Stable anchor IDs contract: add `#in-atlas` and `#joined-with` to the list of stable anchors. Document in `datasets-catalog.md`.

### Validation

```bash
cd website && npm run sources:generate && npm run build
```

Browse a few per-dataset pages, confirm the new section renders for datasets with downstream consumers.

User confirms phase is complete.

---

## Phase 4: Close PLAN

- [ ] 4.1 Move PLAN to `plans/completed/`.
- [ ] 4.2 Update `datasets-catalog.md` Cross-references and stable-anchor list.

---

## Acceptance Criteria

- [ ] Generator emits `consuming_marts[]`, `consuming_models[]`, `joined_with[]` on every source entry.
- [ ] Per-dataset MDX renders an "In Atlas" section listing consuming `mart_*` views with sample queries and lineage links.
- [ ] Per-dataset MDX renders a "Joined with" section listing co-occurring datasets with the dbt models that join them.
- [ ] Stable anchor IDs `#in-atlas` and `#joined-with` exist on every per-dataset page.
- [ ] Reference datasets (e.g. `ssb-klass-kommuner`) with many downstream consumers render gracefully (capped lists).
- [ ] Datasets with no current downstream (if any — `frr` is a candidate) render an honest "no Atlas indicators consume this dataset yet" note instead of an empty section.
- [ ] Local build clean.

---

## Implementation Notes

- **Why parse `lineage.csv` rather than dbt's `manifest.json`** — `manifest.json` is regenerated by `dbt parse` and is environment-specific (paths, profile resolution). The CSV is a stable, version-controlled seed maintained by `scripts/extract_lineage.py`. Catalogue generator stays self-contained.

- **Mart descriptions** — `lineage.csv` only has edges. For mart descriptions, the long path is parsing `atlas-data/dbt/models/marts/api/*.yml` files. The short path is hand-authoring a small `mart-descriptions.yaml` in the website repo. Lean: short path. Eight or so marts, one or two lines each.

- **api_v1 naming convention** — Atlas's `regenerate-api-v1.sh` script strips the `mart_` prefix when wrapping marts as `api_v1.*` views. So `mart_distrikt_summary` → `api_v1.distrikt_summary`. The generator follows this rule mechanically.

- **Why include `dim_*` and `fact_*` in `consuming_models[]` but not in the visible "In Atlas" section** — dim/fact models are internal; they don't have api_v1 wrappers and aren't directly queryable. They're useful as lineage drill-down metadata (powering links to `/lineage/`) but shouldn't appear as "use this in queries" suggestions.

- **Why "Joined with" is more interesting than "Related by topic"** — related_by_topic groups datasets editorially (same `tags.topic`). joined_with groups them by *actual Atlas composition* — these are the datasets the user will, in practice, combine in a single query. Different signal, more honest.

- **Stable anchor IDs** are a contract per **[Q34]**. Adding `#in-atlas` and `#joined-with` extends the contract — once shipped, renaming is a breaking change for any deep-linker.

---

## Files to Modify or Create

### New files

- `website/src/components/sources/DatasetAtlasIntegration.tsx`
- `website/src/components/sources/DatasetQueryMarts.tsx`
- `website/src/components/sources/DatasetJoinedWith.tsx`
- `atlas-data/ingest/src/sources/mart-descriptions.yaml` (optional, Phase 1.3 — hand-authored one-liners per mart)

### Modified files

- `website/scripts/generate-sources-registry.mjs` — read lineage CSV, compute the three new fields, regenerate MDX template with the new section.
- `website/src/types/sources.ts` — add types for `consuming_marts`, `consuming_models`, `joined_with`.
- `website/src/components/sources/styles.module.css` — minor styling additions.
- `website/docs/contributors/datasets-catalog.md` — document the new stable anchors + the integration block.
