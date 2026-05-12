# PLAN-002: Sources catalog foundation — generator, per-source pages, front page, browse, brand pages

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Branch**: `feature/sources-catalog-foundation`

**Goal**: Ship the **structural shell** of the sources catalog at `atlas.sovereignsky.no/sources` — a build-time generator that reads the v2 manifests + companion files (shipped by PLAN-001), a per-source product detail page for all 41 sources, a category-grid front page, a faceted browse-all page, and per-publisher brand pages. No merchandising layer yet (collections, use-case pages, featured datasets, "new & noteworthy", social-proof badges, visual sparklines) — those are PLAN-003.

**Last Updated**: 2026-05-12

**Investigation**: [INVESTIGATE-sources-catalog-at-scale.md](../backlog/INVESTIGATE-sources-catalog-at-scale.md) — see "Decisions resolved" section. PLAN-002 implements the **foundation** layer of the standard-v1 scope envelope.

**Prerequisites**:
- ✅ PLAN-001 — manifest schema v2, validator, companion files (publishers.yaml, source-categories.yaml), all 41 manifests carrying v2 fields.

**Blocks**:
- `PLAN-003-sources-catalog-merchandising` — collections, use-case pages, featured rotation, social proof, sample-row previews, RSS feed.

**Priority**: High (the visible payoff of the catalogue work).

---

## What this PLAN delivers

A visitor lands on `atlas.sovereignsky.no/sources` and sees:

- **Front page** — a category grid (7 cards: Health, Demographics, Income & poverty, Education & youth, Social & housing, NGO supply, Reference geographies) and a publisher strip (4 brand cards: SSB, FHI, Bufdir, Red Cross). One link to the faceted browse-all surface.
- **Per-category index** at `/sources/category/<id>` — short editorial intro + grid of source cards in that category.
- **Per-publisher brand page** at `/sources/by/<id>` — publisher logo + bio + grid of all Atlas sources from that publisher.
- **Browse-all** at `/sources/browse` — searchable, faceted list of all 41 sources. Facets: provider, geo, eu_theme, cadence, lifecycle. Free-text search on title + description + keywords.
- **Per-source product detail page** at `/sources/<id>` — hero/buy-box with publisher logo, license badge, lifecycle badge, freshness, primary action ("Get this data" → copy-clickable PostgREST URL). Below the fold: provenance block, dimensions table, sample query, citation block, related/same-topic sources, prose summary. Schema.org `Dataset` JSON-LD emitted for SEO.

What this PLAN does **not** deliver (deferred to PLAN-003):

- Curated collections / `/sources/collections/<slug>` pages.
- Use-case persona pages / `/sources/for/<persona>` pages.
- "Featured / dataset of the week" hero on the front page.
- "New & recently refreshed" strip + per-page RSS feed.
- Social-proof badges ("Used in N Atlas models", citation counts).
- Sparkline + Norway-thumbnail map + sample-row preview (visual richness — text + logos only in v2-foundation).
- `/sources/joinable` crosswalk page.

---

## Architecture overview

**Single source of truth**: the per-source `manifest.yml` files + `publishers.yaml` + `source-categories.yaml` shipped by PLAN-001.

**Build-time generator** at `website/scripts/generate-sources-registry.mjs`:

1. Walks `atlas-data/ingest/src/sources/*/manifest.yml`.
2. Loads `publishers.yaml` + `source-categories.yaml`.
3. Reads per-source `README.md` to extract the `## Atlas summary` section if present.
4. Emits `website/src/data/sources-registry.json` — single file consumed by all React components.
5. Emits `website/docs/sources/<id>.mdx` per source — one MDX per source, URL = `/sources/<id>` (stable, per **[Q6]**).
6. Emits `website/docs/sources/by/<publisher-id>.mdx` per publisher.
7. Emits `website/docs/sources/category/<category-id>.mdx` per category.
8. Emits `website/docs/sources/browse.mdx` — the faceted browse-all page.
9. The front page `website/docs/sources/index.mdx` is hand-authored (uses React components) and stays as-is across regenerations.

**CI drift gate**: extends the existing `check-manifests` workflow to also re-run the generator and `git diff --exit-code` against committed output. If the registry or MDX files drift from the manifests, CI fails.

**No per-source authoring after PLAN-002**: all per-source MDX is generated. Editorial prose lives in the manifest's `description:` + the README's `## Atlas summary` section. The catalog renders both; contributors don't touch generated MDX directly.

---

## Phase 1: Generator script + registry JSON — DONE

**Outcome (2026-05-12)**: Generator runs cleanly, emits `sources-registry.json` with 41 sources / 7 categories / 4 publishers. Full website build (`npm run build`) succeeds — `prebuild` hook regenerates registry automatically. Skipped ajv validation in the generator (the gate already enforces it upstream); trusts the data. Resolved publisher + category at generation time so consumers don't need to join.

### Tasks

- [x] 1.1 Created `website/scripts/generate-sources-registry.mjs`:
  - ESM, runs under Node 20+ (matches existing `snapshot-openapi.mjs` and `snapshot-lineage.mjs`).
  - Uses `js-yaml` (already in `website/node_modules` transitively; add explicit dep if needed).
  - Reads `atlas-data/ingest/src/sources/manifest.schema.json` once and validates each manifest against it using `ajv` (already added in PLAN-001's `atlas-data/ingest/package.json`; either re-add here or invoke through `node --experimental-vm-modules` if cross-package is fragile).
  - Resolves `tags.topic` → category (full object), `publisher` → publisher (full object) at generation time so consumers don't need to do the join.
  - Reads per-source `README.md` and extracts the section under `## Atlas summary` (case-insensitive) if present; null otherwise.
  - Derives `latest_known_year` from `time_coverage.end` (or `null` for irregular).
  - Builds a default `sample_query` URL when the manifest's `sample_query` is empty:
    `https://api-atlas.sovereignsky.no/<raw_table_name>?limit=5` for the first raw table.
  - Derives `feedback_url` = manifest.feedback_url ?? publisher.feedback_url.

- [x] 1.2 Emit `website/src/data/sources-registry.json` with shape:
  ```json
  {
    "generated_at": "2026-05-12T...",
    "manifest_schema_id": "...",
    "categories": [ {...resolved category objects...} ],
    "publishers": [ {...resolved publisher objects...} ],
    "sources": [
      {
        "source_id": "ssb-07459",
        "upstream_title": "...",
        "description": "...",
        "atlas_summary": "...",     // from README, may be null
        "publisher": { "id": "ssb", "display_name": "...", "logo": "..." },
        "category": { "id": "demographics", "name": "Demographics", "emoji": "👥" },
        "tags": { ... },
        "keywords": [...],
        "lifecycle": "stable",
        "time_coverage": { "start": 1986, "end": 2026 },
        "methodology_notes": "...",
        "suggested_joins": ["ssb-10826"],
        "related_by_topic": ["ssb-10826", "ssb-06913", "..."],   // computed
        "related_by_join_keys": ["ssb-10826"],                    // computed from shared dimensions
        "dimensions": [...],
        "sample_query": "https://...",
        "citation": {
          "text": "...",
          "bibtex": "..."
        },
        "feedback_url": "...",
        "eu_theme": "SOCI",
        "license": "NLOD",
        "license_url": "..."
      }
    ]
  }
  ```

- [x] 1.3 Added `npm run sources:generate` + `prebuild` hook to website/package.json. Also added `js-yaml` + `@types/js-yaml` devDeps. to `website/package.json`. Also hook it into a `prebuild` script so `npm run build` regenerates automatically — but the committed JSON is still the contract for CI drift checks.

- [x] 1.4 First generated `sources-registry.json` committed.

### Validation

```bash
cd website
npm run generate:sources
test -f src/data/sources-registry.json && \
  jq '.sources | length' src/data/sources-registry.json  # 41
jq '.categories | length' src/data/sources-registry.json   # 7
jq '.publishers | length' src/data/sources-registry.json   # 4
```

User confirms phase is complete.

---

## Phase 2: React components — DONE

**Outcome (2026-05-12)**: 14 components shipped (slight rename of one — `SourceCategoryList` and `SourcePublisherList` covered Phase 3's category/publisher pages naturally), plus `src/types/sources.ts` and `src/utils/sources.ts`. Shared `styles.module.css` rather than per-component dirs. Typecheck passes; full build passes (components compile + import cleanly; Phase 3 will exercise their rendering). Dropped explicit `JSX.Element` return-type annotations after TS objected — React 18 + TS 5 prefers inference here.

### Tasks

- [x] 2.1 `<SourceHero source={source}>` — the buy-box. Renders:
  - Title + publisher logo + license badge.
  - `<LifecycleBadge lifecycle={source.lifecycle}>` — colour-coded ("Stable" green / "Beta" yellow / "Deprecated" grey / "Broken" red).
  - `<FreshnessBadge>` — "Last refreshed YYYY-MM-DD" (placeholder ISO date pulled from `time_coverage.end` for v2-foundation; PLAN-003 wires real `mart_ingest_health` data).
  - **Primary action** — "Get this data" button that expands an inline panel with the source's `sample_query` URL + a `curl` snippet + a Python `requests` snippet. Copy-to-clipboard buttons.
  - **Secondary actions** — "Cite this source" (anchor `#citation`), "View upstream" (links to `upstream_landing_page` or `upstream_url`), "Report a data issue" (links to `feedback_url` and to the Atlas GitHub issue tracker with a templated body).

- [x] 2.2 `<SourceProvenance source={source}>` — provenance block:
  - Upstream URL + landing page.
  - Attribution string verbatim.
  - License + license URL.
  - `methodology_notes` Markdown (or honest "no methodology notes yet — see upstream documentation" placeholder).

- [x] 2.3 `<SourceDimensions source={source}>` — table rendering of `dimensions[]`:
  - Columns: Code, Meaning, Value format, Notes.

- [x] 2.4 `<SourceCitation source={source}>` — citation block:
  - One-line text citation (publisher, table number, accessed-via, today's date).
  - BibTeX block in a copy-clickable `<pre>`.
  - Permalink: `https://atlas.sovereignsky.no/sources/<id>`.

- [x] 2.5 `<RelatedSources source={source} registry={registry}>` — horizontal card row:
  - Combine `suggested_joins[]` (manifest-authored) + `related_by_topic` + `related_by_join_keys`, dedupe, cap at 6.
  - Each card: title, publisher logo, category emoji, lifecycle badge.

- [x] 2.6 `<SourceCard source={source}>` — used by browse / category / publisher pages:
  - Title, publisher logo, category badge, lifecycle badge, 2-line description, link to `/sources/<id>`.

- [x] 2.7 `<SourceCategoryGrid registry={registry}>` — front-page category grid.
  - One large card per category (using `source-categories.yaml` data + count of sources in it).

- [x] 2.8 `<PublisherStrip registry={registry}>` — horizontal strip of publisher brand cards (logo + count).

- [x] 2.9 `<SourcesBrowse registry={registry}>` — faceted list:
  - Free-text search input.
  - Facet sidebar: provider, geo, eu_theme, cadence, lifecycle (multi-select).
  - Grid of `<SourceCard>` filtered by current selection.
  - URL query params reflect current facet state (deep-linkable).

- [x] 2.10 `<SchemaOrgDataset source={source}>` — emits `<script type="application/ld+json">` with the Schema.org `Dataset` JSON-LD payload. Maps manifest fields to Schema.org properties (`name`, `description`, `creator`, `license`, `temporalCoverage`, `keywords`, `distribution`, `isAccessibleForFree: true`).

### Validation

- [ ] All components typecheck under `tsc --noEmit`.
- [ ] Components are pure (no data fetching) — they read from the registry JSON via props.

User confirms phase is complete.

---

## Phase 3: Per-source MDX generation — DONE

**Outcome (2026-05-12)**: Generator now emits 41 per-source + 7 per-category + 4 per-publisher MDX files. Full build passes — all components render through SSR cleanly. Pulled sidebar reconfig forward from Phase 4 to keep the intermediate state clean (without it, the autogenerated sidebar would have ballooned to 50+ entries).

### Tasks

- [x] 3.1 Extended `generate-sources-registry.mjs` to also write `website/docs/sources/<source_id>.mdx`. Template:

  ```mdx
  ---
  title: "<upstream_title>"
  description: "<description, first sentence ≤ 160 chars>"
  slug: /sources/<source_id>
  sidebar_label: "<source_id>"
  hide_table_of_contents: false
  ---

  import {sourceById} from '@site/src/utils/sources';
  import SourceHero from '@site/src/components/sources/SourceHero';
  import SourceProvenance from '@site/src/components/sources/SourceProvenance';
  import SourceDimensions from '@site/src/components/sources/SourceDimensions';
  import SourceCitation from '@site/src/components/sources/SourceCitation';
  import RelatedSources from '@site/src/components/sources/RelatedSources';
  import SchemaOrgDataset from '@site/src/components/sources/SchemaOrgDataset';

  export const source = sourceById('<source_id>');

  <SourceHero source={source} />

  ## Provenance {#provenance}

  <SourceProvenance source={source} />

  ## Dimensions {#dimensions}

  <SourceDimensions source={source} />

  ## Sample query {#sample-query}

  ```bash
  curl '<source.sample_query>'
  ```

  ## Citation {#citation}

  <SourceCitation source={source} />

  ## Related sources {#related}

  <RelatedSources source={source} />

  ## About this source

  <source.description as rendered Markdown>

  <optional: source.atlas_summary from README>

  <SchemaOrgDataset source={source} />
  ```

  Anchor IDs match the **[Q34]** stable-anchor contract: `#provenance`, `#methodology`, `#dimensions`, `#sample-query`, `#citation`, `#related`.

- [x] 3.2 Add `website/src/utils/sources.ts` — small helpers:
  - `getAllSources()` → reads from `sources-registry.json`.
  - `sourceById(id)` → typed lookup.
  - `sourcesByCategory(catId)` → filter.
  - `sourcesByPublisher(pubId)` → filter.

- [x] 3.3 Generate per-category index MDX files at `website/docs/sources/category/<id>.mdx`:
  - Renders category description + `<SourceCategoryList categoryId={id}>` (a component using `sourcesByCategory`).

- [x] 3.4 Generate per-publisher brand pages at `website/docs/sources/by/<id>.mdx`:
  - Renders publisher logo + bio (from `publishers.yaml`) + `<SourcePublisherList publisherId={id}>`.

### Validation

```bash
ls website/docs/sources/*.mdx | wc -l                       # 41 source pages + index/browse + categories/publishers
ls website/docs/sources/by/*.mdx | wc -l                    # 4 (publishers)
ls website/docs/sources/category/*.mdx | wc -l              # 7 (categories)
cd website && npm run build                                  # passes onBrokenLinks gate
```

User confirms phase is complete.

---

## Phase 4: Top-level pages — index, browse

### Tasks

- [ ] 4.1 Replace the existing stub at `website/docs/sources/index.md` with an MDX that renders the front-page composition (category grid + publisher strip + link to browse). Hand-authored (not generated) so editorial control survives regenerations.

  ```mdx
  ---
  title: Sources
  slug: /sources
  ---

  import SourceCategoryGrid from '@site/src/components/sources/SourceCategoryGrid';
  import PublisherStrip from '@site/src/components/sources/PublisherStrip';
  import {getAllRegistry} from '@site/src/utils/sources';

  export const registry = getAllRegistry();

  # Atlas sources

  Atlas aggregates public Norwegian data from SSB, FHI, Bufdir, and NGO supply
  sources, plus reference geographies. Browse by category, by publisher, or
  search every source.

  ## Browse by category

  <SourceCategoryGrid registry={registry} />

  ## Browse by publisher

  <PublisherStrip registry={registry} />

  [See all 41 sources →](./sources/browse)
  ```

  (No hero, no curated collections, no "for X" strip, no "new & noteworthy" — those land in PLAN-003.)

- [ ] 4.2 Generate `website/docs/sources/browse.mdx` (could also be hand-authored — single-page; doesn't change per source). Renders `<SourcesBrowse registry={registry} />`.

- [ ] 4.3 Update `website/sidebars.ts` to expose `/sources` and its top-level landings (browse + per-category + per-publisher index pages) only — not the 41 per-source pages. Use explicit sidebar items, not `autogenerated`, so the 41 sources don't bloat the sidebar.

  ```ts
  {
    type: 'category',
    label: 'Sources',
    link: { type: 'doc', id: 'sources/index' },
    items: [
      'sources/browse',
      {
        type: 'category',
        label: 'By category',
        items: [
          'sources/category/health',
          'sources/category/demographics',
          // ... 7 entries, generated or hand-listed
        ],
      },
      {
        type: 'category',
        label: 'By publisher',
        items: [
          'sources/by/ssb',
          'sources/by/fhi',
          'sources/by/bufdir',
          'sources/by/redcross',
        ],
      },
    ],
  },
  ```

### Validation

- [ ] `npm run build` succeeds.
- [ ] `npm start` shows the front page at `localhost:3000/sources` with the category grid and publisher strip.
- [ ] Clicking a category card → category landing → source card → per-source page navigation works end-to-end.

User confirms phase is complete.

---

## Phase 5: CI drift gate + contributor docs

### Tasks

- [ ] 5.1 Extend `.github/workflows/check-manifests.yml` (or add a sibling step):
  - After `check-manifests.sh` passes, run `cd website && npm ci && npm run generate:sources`.
  - `git diff --exit-code src/data/sources-registry.json website/docs/sources/` — fail if anything drifts.

- [ ] 5.2 Update `website/docs/contributors/adding-a-source.md` Step 4b: note that after committing a manifest, the next push must also regenerate the catalog. Document `npm run generate:sources` workflow.

- [ ] 5.3 Add `website/docs/contributors/sources-catalog.md` — a short contributor doc on the catalog architecture: where to find the generator, what's generated vs hand-authored, how to add a new category, how to add a new publisher.

- [ ] 5.4 Move PLAN-002 from `plans/active/` → `plans/completed/` once Phase 4 ships and the live site renders the catalog cleanly.

### Validation

- [ ] CI gate triggers on a synthetic manifest change without regenerating registry — drift gate fails.
- [ ] User confirms the catalog renders cleanly at `atlas.sovereignsky.no/sources` after deploy.

---

## Acceptance Criteria

- [ ] `website/scripts/generate-sources-registry.mjs` exists, runs cleanly, emits `sources-registry.json` + 41 per-source MDX + 7 per-category MDX + 4 per-publisher MDX + 1 browse MDX.
- [ ] All 9 React components under `website/src/components/sources/` exist, typecheck, and render against the registry data.
- [ ] `/sources` front page shows category grid + publisher strip.
- [ ] `/sources/browse` shows faceted browse-all with search.
- [ ] `/sources/<source_id>` for all 41 sources renders the product detail page with the stable anchor IDs.
- [ ] `/sources/category/<id>` for all 7 categories.
- [ ] `/sources/by/<publisher>` for all 4 publishers.
- [ ] Schema.org `Dataset` JSON-LD emitted on every per-source page (verified by `curl … | grep '"@type":"Dataset"'`).
- [ ] CI drift gate fails the build when the registry is stale.
- [ ] No more than 6 entries in the rendered Docusaurus sidebar under "Sources" (landing + browse + by-category + by-publisher submenus — not 41 per-source links).
- [ ] Local `npm run build` passes with no broken-link errors (verified per the *Run Docusaurus locally before pushing* discipline).

---

## Implementation Notes

- **Generator language**: JavaScript ESM (`.mjs`) like the existing snapshot scripts. The website's package.json already runs Node 20+; no new TypeScript build step needed.

- **Why MDX per source instead of dynamic `[id].tsx`** — per **[Q7]** resolution. MDX gives stable URLs, sitemap inclusion, OpenGraph cards, indexability for Google Dataset Search. Dynamic routes would lose all of that. Sidebar bloat is solved by explicit `sidebars.ts` listing rather than autogenerated.

- **Single registry JSON vs split files** — per **[Q18]** resolution. ~200 KB at 200 sources is fine for the build; splitting complicates the consumer code.

- **Front page is hand-authored, per-source pages are generated**: this is the dev-templates pattern. Editorial control of the front page survives generator runs; per-source pages stay automatic.

- **Render `methodology_notes` as Markdown**, not plain text. The manifest field allows multi-line block scalars in YAML; the registry preserves the raw string; the React component renders it via `react-markdown` or similar. Add `react-markdown` to `website/package.json` if not already there.

- **Stable anchor IDs** — **[Q34]** is a contract. Once shipped, renaming `#provenance` to `#source` is a breaking change for anyone deep-linking into Atlas (sister documents, third-party tools, LLM crawlers).

- **Schema.org JSON-LD** is invisible to users but crawled by Google Dataset Search and indexed by LLM training. Worth doing — cheap one-time win for SEO + LLM discoverability.

- **The CI drift gate may produce noisy diffs** when a contributor edits a manifest but forgets to regenerate. The error message should tell them exactly what to run: `cd website && npm run generate:sources && git add src/data/sources-registry.json website/docs/sources/`.

- **PLAN-003 builds on top** — it adds collections / use-case pages / featured / new & noteworthy / social proof / sample-row previews / sparklines / Norway map. Nothing in PLAN-002 is throwaway; PLAN-003 layers on it.

---

## Files to Create or Modify

### New files

- `website/scripts/generate-sources-registry.mjs` — the generator (Phase 1).
- `website/src/data/sources-registry.json` — generator output, committed (Phase 1).
- `website/src/utils/sources.ts` — helpers (Phase 3).
- `website/src/components/sources/SourceHero.tsx`
- `website/src/components/sources/SourceProvenance.tsx`
- `website/src/components/sources/SourceDimensions.tsx`
- `website/src/components/sources/SourceCitation.tsx`
- `website/src/components/sources/RelatedSources.tsx`
- `website/src/components/sources/SourceCard.tsx`
- `website/src/components/sources/SourceCategoryGrid.tsx`
- `website/src/components/sources/PublisherStrip.tsx`
- `website/src/components/sources/SourcesBrowse.tsx`
- `website/src/components/sources/SchemaOrgDataset.tsx`
- `website/src/components/sources/LifecycleBadge.tsx`
- `website/src/components/sources/FreshnessBadge.tsx`
- `website/src/components/sources/SourceCategoryList.tsx`
- `website/src/components/sources/SourcePublisherList.tsx`
- `website/docs/sources/browse.mdx` — generated (Phase 3).
- `website/docs/sources/<id>.mdx` × 41 — generated (Phase 3).
- `website/docs/sources/category/<id>.mdx` × 7 — generated (Phase 3).
- `website/docs/sources/by/<id>.mdx` × 4 — generated (Phase 3).
- `website/docs/contributors/sources-catalog.md` — new contributor doc (Phase 5).

### Modified files

- `website/docs/sources/index.md` → replaced with `index.mdx` containing the front-page composition (Phase 4).
- `website/sidebars.ts` — explicit landings-only sidebar config under Sources (Phase 4).
- `website/package.json` — add `generate:sources` npm script, `prebuild` hook, possibly `react-markdown` dep (Phase 1, Phase 2).
- `.github/workflows/check-manifests.yml` — extend with the drift gate (Phase 5).
- `website/docs/contributors/adding-a-source.md` — note the catalog regeneration step (Phase 5).
