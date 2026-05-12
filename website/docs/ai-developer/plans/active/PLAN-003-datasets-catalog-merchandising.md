# PLAN-003: Datasets catalog — merchandising layer

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) — The implementation process
> - [PLANS.md](../../PLANS.md) — Plan structure and best practices

## Status: Active — Phase 1 + Phase 2 in flight

**Draft date**: 2026-05-12
**Activated**: 2026-05-12

**Scope confirmed**: User picked **Phase 1 + Phase 2** as the first PR (recommended ordering). Phases 3–5 remain in plan but unscheduled.

**Branch**: `feature/datasets-catalog-merchandising`

**Goal**: Layer the **discovery & merchandising** surfaces on top of the catalog foundation shipped by PLAN-002. The foundation gives every dataset a product page; PLAN-003 gives a visitor a *reason* to land on it — derived signals (social proof, freshness sparks), editorial framing (one demo collection, one demo use-case page), and visual richness (sample-row previews) — without committing to a high editorial cadence.

**Last Updated**: 2026-05-12

**Investigation**: [INVESTIGATE-sources-catalog-at-scale.md](../backlog/INVESTIGATE-sources-catalog-at-scale.md) — see "Promotion and merchandising" section and "Standard v1" envelope. PLAN-003 implements the merchandising slice of standard-v1.

**Prerequisites**:
- ✅ PLAN-002 — catalog foundation: generator, per-dataset pages, topic / publisher landings, browse-all surface, Schema.org JSON-LD, joined-with block, citation block.
- ✅ PLAN-001 — manifest v2 + companion files.

**Priority**: Medium — the catalog is shippable today; merchandising tightens the discovery loop and makes the homepage feel alive, but each phase is independently mergeable.

---

## Scope envelope (proposed phases)

Each phase is **independently mergeable** and gives the user a verification point. Phases are ordered by *editorial commitment* — derived/automatic signals first, hand-curated content last.

### Phase 1 — Social-proof badges (derived, zero editorial overhead) — DONE

**Outcome (2026-05-12)**: Shipped a `SocialProofBadge` component used in three places:
- `SourceHero` — "Powers N views" pill linking to `#in-atlas` on the same page.
- `ViewHero` — "Built from N upstream datasets" pill linking to `#built-from` on the same page.
- `SourceCard` (compact mode) — small "Powers N views" tag inside the card footer next to the lifecycle badge.

Both badges hide automatically at count 0 (e.g. raw sources with no current downstream don't show "Powers 0 views"). For views, only **source** parents are counted — internal `fact_*` / `dim_*` models that appear in `built_from` don't inflate the count. The link target uses on-page anchors already emitted by the generator, so no new routes were needed.

A small badge on every dataset card and dataset hero showing how the dataset is reused inside Atlas. The signal already exists in `lineage.csv` + `lineage_direct.csv`; we just surface it.

- **Source-page badge**: *"Powers N views"* (e.g. *"Powers 4 views in Atlas"*) — count from `viewsUsingSource(id)` already used on the per-dataset "Used in views" block. New visual: a small pill in the hero.
- **View-page badge**: *"Built from N datasets"* — count from `direct_refs` (already shown lower on the page).
- **Card badge**: small inline "N views" / "N datasets" tag on every `SourceCard` / view card in grids and lists.
- **Empty-state policy**: hide badge if count is 0 (raw sources with no current downstream).

**Deliverables**: badge component, wired into hero + card. No new build-time data.

**Verification**: visit `/datasets/barnefattigdom` — expect *"Powers 2 views"*; visit `/datasets/coverage_gap_barnefattigdom` — expect *"Built from 1 dataset"*.

---

### Phase 2 — "New & recently refreshed" homepage strip — DONE

**Outcome (2026-05-12)**: Shipped `RecentlyRefreshedStrip` between the homepage hero and the topic grid. Reads `meta_sources_snapshot_at` + per-source `last_ingested_at` from the registry, sorts desc, takes top 4. Cards show publisher logo, "Updated N days ago" relative timestamp (computed against `meta_sources_snapshot_at` so the rendering is deterministic across builds), title, publisher name, and lifecycle badge. The component returns null when the snapshot is absent or no source has a timestamp — the homepage simply skips the section in that case.

A 4-card strip on the homepage (between hero and topic grid) showing the most recently *ingested* datasets — derived from `meta_sources_snapshot.json` (already loaded by the generator).

- Sort by `last_ingested_at` desc, take top 4.
- Card: dataset title, publisher, "Updated 3 days ago" relative timestamp, lifecycle badge.
- Falls back gracefully when the snapshot file is missing (hide the strip — never crash the build).
- No RSS feed in this phase (deferred — see follow-up).

**Deliverables**: `RecentlyRefreshedStrip` component, homepage placement above topic grid.

**Verification**: homepage shows 4 cards with relative timestamps. Snapshot-missing case verified by temporarily renaming `meta-sources-snapshot.json`.

---

### Phase 3 — One demo curated collection

A single editorial collection at `/datasets/collections/grant-application-essentials` modelled on Lisa's persona (grant-officer writing a child-poverty grant application). Editorial intro → ordered dataset list → "How to use these together" join recipe.

- New YAML at `website/data/collections.yaml` — defines the collection (id, title, intro, ordered dataset list, join-recipe markdown).
- Generator reads collections.yaml, emits `/datasets/collections/<slug>.mdx`.
- Homepage gets a single "Curated collections" card with a "More coming soon" affordance (per investigation's quarterly cadence).
- Sidebar entry under "Datasets → Collections".

**Deliverables**: collections.yaml with one entry, generator support, collection landing page, homepage card.

**Verification**: `/datasets/collections/grant-application-essentials` renders the intro, lists the chosen datasets in order, and shows the join recipe.

---

### Phase 4 — One demo use-case persona page

A single persona landing at `/datasets/for/grant-officers` — sister to Phase 3 but persona-shaped, not theme-shaped. Names Lisa's task ("write a grant application about child poverty in our kommune") and lists the datasets that serve that task with one-line "why this one" annotations.

- Hand-authored MDX (one page — generator not needed for a single instance).
- Homepage strip: "For your role" with this single card and a "More coming soon" affordance.
- Sidebar entry under "Datasets → For your role".

**Deliverables**: `/datasets/for/grant-officers.mdx`, homepage strip, sidebar entry.

**Verification**: page reads as a navigable persona surface; links resolve.

---

### Phase 5 — Visual richness (sample-row preview)

Add a 5-row sample table to every dataset hero, pulled from the PostgREST endpoint at build time (cached as `sample-rows-snapshot.json` next to the meta-sources snapshot).

- New build script `npm run datasets:sample-rows` that hits `?limit=5` on every published dataset endpoint and writes the snapshot.
- `DatasetSamplePreview` component reads from snapshot, renders the first 5 rows in a compact table.
- Snapshot-missing case: hide the table (don't fail).

Sparkline + Norway-thumbnail map are **deferred** to a follow-up PLAN — they need a charting library decision and per-dataset geo column resolution.

**Deliverables**: sample-rows snapshot script + npm hook, `DatasetSamplePreview` component, hero placement.

**Verification**: `/datasets/barnefattigdom` shows a 5-row preview below the hero.

---

## Recommended ordering

**Phase 1 + Phase 2 together** — both are derived signals with no editorial commitment, both make the catalog visibly more alive, and both reuse data already loaded by the generator. Single PR, single verification cycle.

**Phase 3, then Phase 4** — editorial pieces, sequenced one at a time so the user can review the *shape* of a collection before we also commit to the shape of a persona page.

**Phase 5 last** — visual richness is the highest-effort, lowest-risk phase. Doing it last means it lands on top of an otherwise-complete merchandising layer.

---

## Deferred to follow-up PLAN

These items appear in the investigation's standard-v1 envelope but are **not** in PLAN-003 scope:

- **RSS feed** for "recently refreshed" — needs a feed-generation pipeline.
- **Sparkline** per dataset — needs a charting library decision and per-dataset time-series column resolution.
- **Norway thumbnail map** per dataset — needs a kommune-shapefile pipeline.
- **`/datasets/joinable` crosswalk page** — separate INVESTIGATE-level scope.
- **Additional collections / persona pages** beyond the one demo of each — handled by the quarterly editorial cadence, not PLAN-003.

---

## Open questions

- **[Q1]** Should Phase 1 badges link anywhere? (Proposal: yes — "Powers N views" scrolls to the existing "Used in views" block on the same page; "Built from N datasets" scrolls to the existing "Built from" block. No new routes.)
- **[Q2]** Collection definition format — single flat YAML (`collections.yaml`) or per-collection file under `website/data/collections/`? (Proposal: single flat file at v1; split when we have 5+.)
- **[Q3]** Phase-5 sample-rows snapshot — generate at build time (Vercel-style) or commit the snapshot file? (Proposal: commit the snapshot, refreshed by an opt-in npm script. Same pattern as `meta-sources-snapshot.json`.)
- **[Q4]** Where do `/datasets/collections/` and `/datasets/for/` slot into the sidebar — under "Datasets" alongside the existing "By topic" / "By publisher" entries, or as a separate top-level group? (Proposal: same group, two new entries.)

---

## Out of scope

- Changes to the per-dataset hero layout beyond adding the social-proof badge + sample-row preview.
- Changes to the topic or publisher landings (those are mature post-PLAN-002).
- New manifest fields. PLAN-003 reads only what already exists.
- Authentication / personalisation. The catalog stays a public read-only surface.
