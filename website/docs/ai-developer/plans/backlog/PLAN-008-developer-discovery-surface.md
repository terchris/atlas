# PLAN-008: Atlas-native developer discovery surface

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Three improvements to the customer frontend's `/data` surface for developer-facing depth, all building on what PLAN-007 Phase 4.1 shipped:

1. Replace the JSON-dump spec viewer at `/data/[schema]/[table]/spec` with **Scalar** — interactive OpenAPI rendering with a built-in "try it out" client.
2. Add a **lineage panel** on `/data/[schema]/[table]` showing which raw ingest sources contribute to each endpoint, with click-throughs.
3. Auto-generate **dbt docs** in CI and host at `atlas.helpers.no/lineage/` for the full DAG deep-dive.

After this PLAN, a developer landing on `/data/api_v1/distrikt_summary` can see the table's data, click "View spec" to interactively call the API, see "Built from 3 sources" with click-throughs to each, and click "See full data flow" to drill into the dbt DAG. No new backend infrastructure; no OpenMetadata deployment.

**Investigation**: [INVESTIGATE-data-discovery-surface.md](INVESTIGATE-data-discovery-surface.md) — see "Atlas-native human discovery — the lighter near-term path" section. This PLAN is the implementation of the recommended near-term option for **[Q1]**, deferring OpenMetadata adoption until/unless the trigger criteria fire.

**Last Updated**: 2026-05-07

**Prerequisites**:
- ✅ PLAN-007 Phase 4.1 (the `/data` rewrite + `/data/[schema]/[table]/page.tsx` route) — modifies the same files this PLAN extends.
- ✅ `api_v1.meta_endpoints` (PLAN-007 Phase 3) — the lineage panel reads from it.
- ✅ `seeds/sources/lineage.csv` (PR #77) — the lineage data substrate, 129 edges.
- ✅ dbt project at `atlas-data/dbt/` — `dbt docs generate` runs against it for Phase 3.

**Blocks**: None — every prerequisite is shipped.

---

## Phase 1: Scalar spec viewer

Replace the JSON-dump in `/data/[schema]/[table]/spec/page.tsx` with `@scalar/api-reference-react`. Renders the OpenAPI spec interactively with a built-in "try it" client, three-panel layout, syntax highlighting.

### Tasks

- [ ] 1.1 `npm install @scalar/api-reference-react` in `atlas-frontend/`. Verify no peer-dep warnings against React 19 / Next 16.
- [ ] 1.2 Update `/data/[schema]/[table]/spec/page.tsx`:
  - Drop the `JSON.stringify` block + the `<pre><code>` render.
  - Build a synthetic single-endpoint OpenAPI doc from `slice.definition` + `slice.path` + `slice.context` (preserving today's "this page is about ONE endpoint" framing rather than dumping the whole multi-schema spec).
  - Render `<ApiReferenceReact configuration={{ content: syntheticSpec, ... }} />`.
  - Keep the existing `<nav>` (← Back to catalog · View as table) and the upstream-link section. Replace only the JSON section.
- [ ] 1.3 If Scalar emits hydration warnings under Next 16 App Router (uncertain per the agent's research), wrap in a `<Suspense>` or `'use client'` boundary as needed.
- [ ] 1.4 Verify the rendered page works for endpoints in all three schemas (`api_v1.distrikt_summary`, `marts.dim_kommune`, `raw.ssb_08764`) — the synthetic-spec approach must not regress for non-default-schema endpoints.

### Validation

```bash
cd atlas-frontend && npm run typecheck && npm run lint && npm run build
npm run dev

# Spec page renders Scalar (look for Scalar's class names in HTML)
curl -sS http://localhost:3001/data/api_v1/distrikt_summary/spec | grep -c "scalar-app\|api-reference\|ScalarApi"  # > 0

# Try-it-out button is present
curl -sS http://localhost:3001/data/api_v1/distrikt_summary/spec | grep -c "Try it"  # > 0

# Cross-schema works
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/data/marts/dim_kommune/spec  # 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/data/raw/ssb_08764/spec      # 200
```

### Done when

- The spec page renders interactively (Scalar UI, not raw JSON).
- "Try it out" works against the live PostgREST endpoint for at least one api_v1, one marts, one raw endpoint.
- `npm run build` succeeds; bundle size delta documented (informational; not a gate).

---

## Phase 2: Lineage panel on the table viewer

Add a section to `/data/[schema]/[table]/page.tsx` between the header and the data table showing which raw sources contributed to this endpoint. Reads from existing lineage data; no new ingestion.

### Tasks

- [ ] 2.1 Extend `mart_meta_endpoints.sql`:
  - Add `source_ids text[]` column derived from `array_agg(source_id ORDER BY source_id) FROM marts.lineage WHERE model_name = mart_meta_endpoints.table_name`.
  - For endpoints with no lineage match (e.g. `mart_meta_*` itself, dim seeds), `source_ids` is an empty array `{}`.
  - Update `schema.yml` description for the new column. Run `dbt run --select mart_meta_endpoints` + `./apply-api-v1.sh` so `api_v1.meta_endpoints` exposes the new column.
- [ ] 2.2 Update the lineage extractor at `atlas-data/dbt/scripts/extract_lineage.py` if it doesn't already aggregate per-model — the current file emits `(model, source_id)` rows; the dbt model's `array_agg` handles aggregation.
- [ ] 2.3 Add a "Built from" panel to `atlas-frontend/src/app/data/[schema]/[table]/page.tsx`:
  - Render between the `<form>` (search) and the `<section>` (data table).
  - Skeleton: "Built from N sources: [source_id_1] · [source_id_2] · …", each source as a `<Link href="/data/raw/{table}">` (mirrors the convention from PR #85's source cards).
  - Each pill carries the source_id; clicking opens the raw table viewer.
  - Show a "See full data flow →" link to `/lineage/#model__<table_name>` (Phase 3 destination; safe-to-render-now even before Phase 3 ships — it'll just 404 until then).
  - Hide the panel for endpoints with `source_ids = []` (e.g. meta_* tables).
- [ ] 2.4 Optionally fetch `meta_sources` to enrich each pill with the source's friendly description / row count. Decision: defer to a follow-up if it adds a request-amplification problem; for v1, just the source IDs as click-through links.

### Validation

```bash
# meta_endpoints exposes source_ids
curl -sS "http://api-atlas.localhost/meta_endpoints?endpoint=eq.api_v1.distrikt_summary" | jq '.[0].source_ids'
# → ["brreg-enheter", "redcross-branches", "ssb-klass-kommuner"]

# Frontend renders the panel
curl -sS http://localhost:3001/data/api_v1/distrikt_summary | grep -c "Built from"  # > 0
curl -sS http://localhost:3001/data/api_v1/distrikt_summary | grep -c "/data/raw/redcross_branches"  # > 0

# Endpoints with no lineage hide the panel
curl -sS http://localhost:3001/data/api_v1/meta_endpoints | grep -c "Built from"  # → 0
```

### Done when

- `api_v1.meta_endpoints.source_ids` is populated for every endpoint with at least one lineage edge.
- The "Built from N sources" panel renders on every `/data/[schema]/[table]` page where `source_ids` is non-empty.
- Each source pill links to `/data/raw/<table_name>` and resolves correctly.
- Endpoints with no lineage (meta_* and seeds) don't show an empty/awkward panel.

---

## Phase 3: dbt docs auto-hosted at `/lineage/`

Run `dbt docs generate` in CI; serve the output at `atlas.helpers.no/lineage/`. Each `/data/[schema]/[table]` page links to the matching dbt-docs node for the full DAG view.

### Tasks

- [ ] 3.1 Add `dbt docs generate` to whatever CI pipeline runs the dbt build. Output lands in `atlas-data/dbt/target/` (`manifest.json`, `catalog.json`, `index.html`, etc.).
- [ ] 3.2 Decide hosting shape — three options, pick one:
  - **(a)** Mount the `target/` directory as a static site under `atlas-frontend`'s public/ at build time (a build script copies `target/manifest.json` etc.). Simplest; ships in the same Next.js app.
  - **(b)** Serve from Atlas's nginx/ingress at `atlas.helpers.no/lineage/` as a separate static site, deployed alongside the customer frontend.
  - **(c)** Use a separate subdomain `lineage.atlas.helpers.no` — cleaner but adds DNS coordination.

  Recommendation: **(a)** for v1 — minimum infra change, kept inside the customer-frontend deploy unit.
- [ ] 3.3 Implement the chosen hosting. For (a): a small `atlas-frontend/scripts/copy-dbt-docs.ts` (or a `prebuild` npm script) that copies `../atlas-data/dbt/target/{manifest,catalog,run_results}.json` + `index.html` into `atlas-frontend/public/lineage/`. Verify the resulting URLs work (`http://localhost:3001/lineage/` loads the dbt docs UI).
- [ ] 3.4 Update Phase 2's "See full data flow →" link to the right anchor format. dbt docs uses URLs like `#!/model/model.atlas.<model_name>`. Decide whether the deep link can target the specific model or just the index.
- [ ] 3.5 Add a small note on the `/data` footer ("See the full data flow at /lineage/") so users discover it without having to navigate from a specific endpoint page.

### Validation

```bash
# CI emits target/manifest.json
ls -la atlas-data/dbt/target/manifest.json   # exists, recent

# atlas-frontend exposes /lineage/
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/lineage/        # 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/lineage/index.html  # 200

# dbt docs loads + has Atlas's models
curl -sS http://localhost:3001/lineage/manifest.json | jq '.nodes | keys | length'  # > 50

# Deep link from /data card resolves
curl -sS "http://localhost:3001/data/api_v1/distrikt_summary" | grep -oE 'href="/lineage[^"]*"'  # > 0
```

### Done when

- `dbt docs generate` runs as part of the build.
- `/lineage/` renders the dbt docs UI.
- The "See full data flow →" link from Phase 2's lineage panel reaches the dbt docs for that specific model (or the index, if deep-linking proves unreliable).

---

## Acceptance criteria

- [ ] `/data/[schema]/[table]/spec` renders Scalar UI with a working "try it" panel. JSON dump is gone.
- [ ] `/data/[schema]/[table]` shows a "Built from N sources" panel for endpoints with lineage; sources are click-throughs to `/data/raw/<table>`.
- [ ] `/lineage/` is reachable; dbt docs renders the full DAG.
- [ ] PLAN-007's `/data` UX is unchanged (no regression in the catalog or table viewer behaviour beyond the new lineage panel).
- [ ] Production build (`npm run build`) succeeds with the Scalar dependency added.
- [ ] Bundle size delta of Phase 1 documented; no other bundle-size gates set.

---

## Out of scope

- **OpenMetadata deployment.** That's the alternative path the INVESTIGATE keeps deferred; this PLAN is the lighter near-term answer. Lift OpenMetadata only when its triggers fire (federated lineage / glossary / data-asset registry / sister dataset).
- **A custom DAG renderer (react-flow / mermaid).** That was option L3b in the strategic discussion; defer until evidence shows dbt docs is too coarse-grained for users.
- **Scalar's commercial features** (Scalar Cloud, custom domains, hosted portal). The OSS `@scalar/api-reference-react` library is the only dependency added.
- **Glossary terms / canonical concepts** — OpenMetadata territory; out of scope.
- **Cross-dataset search by column name** — interesting future feature; not blocking.
- **Per-source detail page at `/data/sources/[source_id]`** — that's PLAN-007 Phase 4.3, separate scope. Phase 2's lineage pills will link to `/data/raw/<table>` until 4.3 ships, then can be redirected to the source detail page.

---

## Files to modify

**New:**
- `atlas-frontend/scripts/copy-dbt-docs.ts` (Phase 3, option (a)) — pre-build script that copies `target/` into `public/lineage/`.

**Updated (atlas-frontend):**
- `atlas-frontend/package.json` — add `@scalar/api-reference-react` dep; add `prebuild` script for Phase 3.
- `atlas-frontend/src/app/data/[schema]/[table]/spec/page.tsx` — Scalar render replaces JSON dump.
- `atlas-frontend/src/app/data/[schema]/[table]/page.tsx` — lineage panel inserted.
- `atlas-frontend/src/app/data/page.tsx` — footer mention of `/lineage/`.

**Updated (atlas-data):**
- `atlas-data/dbt/models/marts/api/mart_meta_endpoints.sql` — add `source_ids text[]` column.
- `atlas-data/dbt/models/marts/api/schema.yml` — describe the new column.

**Generated (committed or build-time):**
- `atlas-frontend/public/lineage/{manifest,catalog,run_results}.json` + `index.html` — dbt docs output, refreshed on every build.

---

## Cross-references

- [INVESTIGATE-data-discovery-surface.md](INVESTIGATE-data-discovery-surface.md) — parent INVESTIGATE; this PLAN executes the "Atlas-native human discovery" recommendation.
- [PLAN-007 — data display open by default](../completed/PLAN-007-data-display-open-by-default.md) — the `/data` rewrite this PLAN extends. Phase 4.1's `/data/[schema]/[table]/page.tsx` is the file that gets the lineage panel.
- [PLAN-004 — postgrest api_v1 wrapper](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the wrapper-generation pipeline that emits `api_v1.meta_endpoints` (which gets the new `source_ids` column).
- `atlas-data/dbt/seeds/sources/lineage.csv` (PR #77) — the lineage data substrate Phase 2's panel reads.
- Scalar — [github.com/scalar/scalar](https://github.com/scalar/scalar). MIT, npm package `@scalar/api-reference-react`.
- dbt docs — built into dbt Core; `dbt docs generate && dbt docs serve`.

---

## Implementation notes

- **Order matters.** Phase 1 (Scalar) is independent and can ship alone. Phase 2 (lineage panel) depends on the dbt model + apply-api-v1.sh roundtrip — bundle the dbt change + frontend change into one commit (or two ordered commits) to avoid a window where the panel renders but `source_ids` is missing. Phase 3 (dbt docs) is independent of Phases 1 and 2; can ship in parallel.
- **No back-compat shims.** Same posture as PLAN-007 Phase 4.1 — the prior JSON-dump spec viewer is replaced wholesale, no opt-out flag.
- **Forkability check.** All three phases keep the customer-frontend self-contained: Scalar is one npm dep; lineage panel reads only from the public PostgREST surface; dbt docs hosting is a build-time copy from `../atlas-data/dbt/target/` (forks that omit the `atlas-data/` directory just won't have `/lineage/` populated — graceful degradation).
- **Browser test.** Per CLAUDE.md, ship validation includes opening each modified page in a browser. Specifically: `/data/api_v1/distrikt_summary/spec` to verify Scalar renders + try-it works; `/data/api_v1/distrikt_summary` to verify the lineage panel; `/lineage/` to verify dbt docs.
