# Plan: Split atlas-frontend — rename existing to contributor app, scaffold fresh customer app

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed (2026-04-30)

Shipped on Atlas `main` as PR [#33](https://github.com/terchris/atlas/pull/33), squash-merged at commit [`2266f21`](https://github.com/terchris/atlas/commit/2266f21). All six phases complete; all acceptance criteria satisfied.

**Outcome**: the repo now has two top-level Next.js apps:

- **`atlas-contributor-frontend/`** — today's original `atlas-frontend/` renamed wholesale. Direct Postgres against `marts.*`, dev/staging only, port 4000. Used by ingest authors and dbt model writers to verify ingestion + dbt output. Homepage rewritten to clearly identify its contributor audience and surface 8 diagnostic tools as visible card-style affordances.
- **`atlas-frontend/`** — fresh scaffold consuming `api-atlas.helpers.no` via typed fetch, port 3001, deploys to `atlas.helpers.no`. Forkable as a reference implementation for external developers (zero DB drivers, no monorepo cross-imports, self-contained `package.json` + README). Three views per `api_v1.*` endpoint, all introspection-driven (no hardcoded endpoint names anywhere): `/data` catalog, `/data/[endpoint]` table viewer with pagination + sort + search, `/data/[endpoint]/spec` per-endpoint OpenAPI spec slice.

Phase 5 deliverables shipped beyond the original PLAN scope:
- Generic table viewer at `/data/[endpoint]` with shadcn-style Table primitives (no Radix dep)
- URL-driven pagination, click-to-cycle column sort, search via PostgREST `or= ilike` across string columns
- Per-endpoint spec viewer at `/data/[endpoint]/spec`

`website/docs/developers/` stub created per Phase 6.6; full content tracked by [INVESTIGATE-developer-docs-surface.md](../backlog/INVESTIGATE-developer-docs-surface.md) (still in backlog/, the natural follow-on PLAN-006).

**Investigation**: [INVESTIGATE-frontend-data-access-architecture.md](INVESTIGATE-frontend-data-access-architecture.md) — settled all architectural commitments (URL anchors, naming, monorepo, no shared code, customer-app forkability). Now also in `completed/`.

**Last Updated**: 2026-04-30 — moved active/ → completed/

**Prerequisites**:
- PostgREST live with `api_v1.*` wrapper layer (PLAN-004 + UIS PLAN-002, verified 2026-04-30 — see [`talk2.md`](https://github.com/terchris/atlas/blob/main/website/docs/ai-developer/plans/talk/talk2.md), Messages 1–4).
- `api-atlas.localhost` reachable from host machine.

**Blocks**:
- The actual `atlas.helpers.no` production deploy depends on Phase 6 of this PLAN finishing **and** [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md) shipping a deployment story.

---

## Phase 1: Rename `atlas-frontend/` → `atlas-contributor-frontend/`

Whole-folder git move. Today's content unchanged; just lives under a new name that matches its actual job.

### Tasks

- [x] 1.1 `git mv atlas-frontend atlas-contributor-frontend` from a feature branch.
- [x] 1.2 Update inbound references across the repo:
  - [`website/docs/contributors/setup.md`](../../../contributors/setup.md) — currently mentions `atlas-frontend/` for the optional frontend setup; update path + frame as the contributor diagnostic app.
  - [`website/docs/contributors/index.md`](../../../contributors/index.md) — same.
  - [`website/docs/contributors/data-journey.md`](../../../contributors/data-journey.md) — Stage 8 (Next.js queries).
  - `CLAUDE.md` at repo root — section "Atlas-frontend" or "Key Folders".
  - `atlas-data/CONTRIBUTING.md` if it references the path.
  - Any other markdown that has `atlas-frontend/` as a literal path.
  - Run `grep -rn "atlas-frontend" website/ docs/ atlas-data/ CLAUDE.md` and fix every hit.
- [x] 1.3 Verify `cd atlas-contributor-frontend && npm install && npm run dev` still works against direct Postgres. Spot-check `/coverage-gap/barnefattigdom` and `/admin/supply/redcross-branches` render rows.
- [x] 1.4 Add a one-paragraph banner at the top of `atlas-contributor-frontend/README.md` that says "this is the contributor app — direct DB access for ingestion verification — not for prod deploy. Customer-facing app is the new `atlas-frontend/`."

### Validation

```bash
grep -rn "atlas-frontend" website/ docs/ atlas-data/ CLAUDE.md  # should match the new customer app references only after Phase 2; for now expect zero hits
cd atlas-contributor-frontend && npm install && npm run dev
# In another terminal:
curl -fsS http://localhost:3000/coverage-gap/barnefattigdom > /dev/null && echo ok
```

### Done when

- Branch contains the rename + all inbound references updated.
- `npm run dev` in the renamed folder works as before.
- No literal references to `atlas-frontend/` remain pointing at the old (now nonexistent) path.

---

## Phase 2: Scaffold fresh `atlas-frontend/` as a PostgREST consumer

Fresh Next.js app at the repo root. No carryover from `atlas-contributor-frontend/`. Independence from day one.

### Tasks

- [x] 2.1 `npx create-next-app@latest atlas-frontend --typescript --app --no-src-dir` (or `--src-dir` to match Atlas conventions — match what `atlas-contributor-frontend/` uses for symmetry, even though they don't share code).
- [x] 2.2 Configure environment:
  - `.env.example` at root: `NEXT_PUBLIC_API_URL=http://api-atlas.localhost`.
  - **Do not** include `DATABASE_URL` or any DB role.
  - **Do not** install `postgres.js` or any DB driver.
- [x] 2.3 **Port assignment**: change `npm run dev` to use port 3001 (`"dev": "next dev -p 3001"` in `package.json`). Avoids collision with `atlas-contributor-frontend/`'s default 3000. Document in the README.
- [x] 2.4 Write the customer app's `README.md` to market the folder as a forkable reference:
  - "What this is": Atlas's customer-facing Next.js consuming `api-atlas.helpers.no`.
  - "How to run locally": `cp .env.example .env.local && npm install && npm run dev`.
  - "How to fork": clone or copy the folder, set `NEXT_PUBLIC_API_URL` to your own PostgREST endpoint.
  - "What you can build": explain that `api-atlas.helpers.no` is the same API external developers use; this folder is the canonical example.
- [x] 2.5 Forkability discipline: enforce no upward imports.
  - Add a top-of-file comment in any shared lib explaining the forkability constraint.
  - Optional ESLint rule: `no-restricted-imports` blocking `../atlas-data`, `../website`, `../atlas-contributor-frontend`.

### Validation

```bash
cd atlas-frontend && npm install && npm run dev
# Visit http://localhost:3001 — Next.js default page renders.
# Verify package.json contains zero DB-driver dependencies:
jq '.dependencies | keys[]' atlas-frontend/package.json | grep -iE 'postgres|prisma|drizzle|pg'  # should print nothing
# Verify .env.example does not contain DATABASE_URL:
grep -i database_url atlas-frontend/.env.example  # should print nothing
```

### Done when

- Fresh `atlas-frontend/` with default Next.js scaffold renders at `localhost:3001`.
- Zero DB driver dependencies in `package.json`.
- `.env.example` only references `NEXT_PUBLIC_API_URL`.
- README markets the app as forkable.

---

## Phase 3: Build `src/lib/api.ts` — typed fetch helpers against `api_v1.*`

Types are generated from PostgREST's OpenAPI spec via `openapi-typescript`. Single source of truth: the live spec at `GET /`. Hand-typed types are zero — every column type, format, and JSDoc description flows from `schema.yml` → dbt-osmosis → `COMMENT ON COLUMN` → PostgREST spec → `api-types.ts`.

### Tasks

- [x] 3.1 Add dev dependency: `npm install -D openapi-typescript`.
- [x] 3.2 Generate types: `npx openapi-typescript http://api-atlas.localhost/ -o src/lib/api-types.ts`.
- [x] 3.3 Add an npm script: `"api:types": "openapi-typescript http://api-atlas.localhost/ -o src/lib/api-types.ts"`.
- [x] 3.4 Write `src/lib/api.ts` — a thin `fetch` wrapper that:
  - Reads `process.env.NEXT_PUBLIC_API_URL`.
  - Returns typed responses using `api-types.ts`.
  - Surfaces clear errors on 4xx/5xx (use Next.js error boundary patterns).
  - Provides a helper to fetch row counts via `Prefer: count=exact` headers (used by the catalog page in Phase 4).
  - **Has no SQL. Has no `postgres.js` import. Imports only from `node_modules` and `./api-types`.**
- [x] 3.5 Document in the README: "after schema changes on the API side, refresh types with `npm run api:types`."

### Validation

```bash
cd atlas-frontend
npm run api:types  # regenerates types successfully
cat src/lib/api-types.ts | head  # contains paths and components
# Smoke test from a temp page or a node script:
node -e "fetch('http://api-atlas.localhost/indicator_summary?limit=1').then(r=>r.json()).then(console.log)"
```

### Done when

- `src/lib/api.ts` + `src/lib/api-types.ts` exist.
- `npm run api:types` regenerates the types file from a live PostgREST.
- Hand-typed types are zero (everything sourced from the OpenAPI generator).

---

## Phase 4: First customer-facing route — `/data` catalog page

Build a self-describing data catalog at `/data` driven entirely by PostgREST introspection: `GET /` for the endpoint list + column types + descriptions, `Prefer: count=exact` for row counts, and `api_v1.indicator_summary` for the per-source indicator breakdown. Zero new mart views; zero atlas-data work in this phase. The catalog is the customer app's value-prop demonstration: *"this app dogfoods the API by being the catalog of what's in the API."*

### Tasks

- [x] 4.1 Build `app/data/page.tsx`:
  - Fetch the OpenAPI spec at `process.env.NEXT_PUBLIC_API_URL` (root). Extract `paths` (the endpoint list) and `definitions` (column types + descriptions).
  - For each path (excluding `/`), fetch its row count via `lib/api.ts`'s `Prefer: count=exact` helper.
  - For `/indicator_summary`, fetch the rows and group by `source_id` to render the per-source indicator catalogue (sources, contents codes per source, latest year).
  - Render as a clean, public-facing landing — table or card grid. Each cataloged endpoint links to a detail page (built piecemeal across Phase 5).
  - Loading + error states. Server component (Next.js fetches at request time; no client-side state needed).
- [x] 4.2 Add a homepage (`app/page.tsx`) that introduces Atlas and links to `/data`. One-liner now; can grow with marketing later.
- [x] 4.3 Verify the catalog reflects every `api_v1.*` endpoint without hardcoding any of them — adding a new mart view + regenerating `api_v1` should make it appear in the catalog automatically on next page load.

### Validation

```bash
curl -fsS http://localhost:3001/data > /dev/null && echo ok                         # catalog renders
curl -s http://localhost:3001/data | grep -i "indicator_summary"                    # spec-derived endpoint name appears
curl -s http://localhost:3001/data | grep -i "kommune_local_chapters"               # all 9 endpoints appear
grep -rn "DATABASE_URL\|postgres(" atlas-frontend/                                  # should print nothing
grep -rn "indicator_summary\|coverage_gap" atlas-frontend/app/data/page.tsx         # endpoints are NOT hardcoded — should print 0 hits
```

### Done when

- `/data` lists every `api_v1.*` endpoint with row count and column-level descriptions sourced from the live OpenAPI spec.
- The page is fully introspection-driven — no hardcoded endpoint names, no manual table of contents.
- `atlas-frontend/` has zero `DATABASE_URL` reference and zero `postgres.js` usage.
- The PLAN-004 validation gates still pass (no `api_v1.*` changes in this phase).

---

## Phase 5: Scale out — detail pages linked from the catalog

Open-ended phase. Each cataloged endpoint can grow a detail page; new mart views in `atlas-data/` unlock new endpoints. Pace driven by what customer-facing pages we actually want to ship, not by mirroring the contributor app one-for-one.

### Two natural early scale-outs (illustrative; pick when ready):

- **`/coverage-gap/barnefattigdom`** — pure detail page, zero atlas-data work. `api_v1.coverage_gap_barnefattigdom` is already in the surface. Renders the kommune-level child-poverty cut as a sortable table or bar chart. Demonstrates the "fetch-detail-from-existing-mart" pattern.
- **`/kommuner/[kommune_nr]`** — exercises the new-mart-view workflow end-to-end:
  1. Add `atlas-data/dbt/models/marts/api/mart_kommune_overview.sql` (kommune metadata: kommune_nr, name, fylke_name, population, etc.).
  2. Add `schema.yml` description for every column (PLAN-004's runtime description gate enforces this).
  3. Run `dbt run --select mart_kommune_overview` + `./regenerate-api-v1.sh` + `./apply-api-v1.sh`.
  4. Verify `curl http://api-atlas.localhost/kommune_overview?kommune_nr=eq.0301` returns rows.
  5. `npm run api:types` regenerates the customer app's types — the new endpoint appears automatically.
  6. Implement `app/kommuner/[kommune_nr]/page.tsx`. The catalog at `/data` picks up the new endpoint on next page load with no code change.

### Generic per-route flow

- [x] 5.x.1 Confirm the route's data needs map to an existing `api_v1.*` view. If not, add a `mart_<feature>` view first; regenerate + apply `api_v1`; rerun `npm run api:types`.
- [x] 5.x.2 Implement the route in `atlas-frontend/app/<path>/page.tsx` against `lib/api.ts` with typed responses from `api-types.ts`.
- [x] 5.x.3 Confirm the catalog at `/data` shows the new endpoint without code changes (the introspection-driven render handles it).
- [x] 5.x.4 Add a smoke check (curl + grep on rendered HTML, or a Playwright test if testing infra lands).

### Done when

This phase has no "complete" condition — it's continuous. Treat it as the steady-state activity that follows the PLAN, not a phase to close out.

---

## Phase 6: Document both apps in `setup.md` + cross-references

Update contributor docs to reflect the split.

### Tasks

- [x] 6.1 Update [`website/docs/contributors/setup.md`](../../../contributors/setup.md) to describe **two** Next.js apps:
  - `atlas-contributor-frontend/` — direct Postgres, what contributors run during ingestion verification.
  - `atlas-frontend/` — PostgREST consumer, the customer-facing app, ports 3001 in dev.
  - Reference each app's own README for fork/extend.
- [x] 6.2 Update [`website/docs/contributors/index.md`](../../../contributors/index.md) "Where things live" table to list both apps.
- [x] 6.3 Update [`website/docs/contributors/data-journey.md`](../../../contributors/data-journey.md) Stage 8 — clarify that the customer app dogfoods the API and that the contributor app keeps direct-DB access for verification work.
- [x] 6.4 Update [`CLAUDE.md`](https://github.com/terchris/atlas/blob/main/CLAUDE.md) "Key Folders" section.
- [x] 6.5 Update [`atlas-data/CONTRIBUTING.md`](https://github.com/terchris/atlas/tree/main/atlas-data/CONTRIBUTING.md) if it references the frontend path.
- [x] 6.6 Scaffold a stub for the **external developer docs surface** at `website/docs/developers/index.md`. Single page with:
  - One paragraph framing the audience (people consuming `api-atlas.helpers.no` to build their own apps — frontend, CLI, agent, mobile, scripts).
  - A pointer to the customer app's README at `atlas-frontend/` as the canonical fork-me reference.
  - A pointer to the live Swagger 2.0 spec at `api-atlas.helpers.no/` for the schema.
  - A "content TBD" note pointing at [INVESTIGATE-developer-docs-surface.md](../backlog/INVESTIGATE-developer-docs-surface.md) for the planned full developer docs (getting started, API reference rendering, versioning policy, examples).
  - **No content beyond the stub** — full developer docs are a separate effort, deliberately out of scope for PLAN-005.

### Validation

```bash
grep -rn "atlas-frontend\|atlas-contributor-frontend" website/ CLAUDE.md atlas-data/CONTRIBUTING.md
# Every match should refer to the correct app for its context (customer-facing for atlas-frontend; contributor-facing for atlas-contributor-frontend).
```

### Done when

- All contributor docs distinguish the two apps clearly.
- A new contributor reading setup.md cold knows which app to run for what purpose.

---

## Acceptance Criteria

- [x] `git log --diff-filter=R --summary` shows the rename `atlas-frontend → atlas-contributor-frontend`.
- [x] Fresh `atlas-frontend/` exists with zero DB driver dependencies.
- [x] `atlas-frontend/src/lib/api.ts` + `api-types.ts` exist; `npm run api:types` regenerates types from live PostgREST.
- [x] `/data` catalog at `localhost:3001/data` lists every `api_v1.*` endpoint with row count and descriptions, sourced from the live OpenAPI spec, with **no hardcoded endpoint names** in the page source.
- [x] `app/page.tsx` (homepage) renders and links to `/data`.
- [x] setup.md, index.md, data-journey.md, CLAUDE.md describe the two apps correctly.
- [x] No literal `atlas-frontend/` reference in the repo points at the wrong app for its context.
- [x] `website/docs/developers/index.md` exists as a stub pointing at the customer app's README + the live OpenAPI spec, with a forward reference to `INVESTIGATE-developer-docs-surface.md`.

(Detail pages, any new `mart_*` views, and the actual developer-docs content are out of PLAN-005's scope — Phase 5 scale-out and the developer-docs INVESTIGATE handle them.)

---

## Files to Modify

**Renamed (whole folder):**
- `atlas-frontend/` → `atlas-contributor-frontend/`

**New (created in Phase 2+):**
- `atlas-frontend/` — fresh Next.js scaffold
- `atlas-frontend/src/lib/api.ts`, `atlas-frontend/src/lib/api-types.ts`
- `atlas-frontend/app/page.tsx` — homepage linking to `/data`
- `atlas-frontend/app/data/page.tsx` — introspection-driven catalog
- `atlas-frontend/.env.example`
- `atlas-frontend/README.md` — forkable framing

**New (Phase 5, scale-out — not part of PLAN-005's acceptance):**
- Detail-page route files (`app/coverage-gap/barnefattigdom/page.tsx`, `app/kommuner/[kommune_nr]/page.tsx`, etc.)
- New `mart_*` views in `atlas-data/dbt/models/marts/api/` when a route needs data not in `api_v1.*` today (with `schema.yml` descriptions; regenerate + apply `api_v1`)

**Updated docs:**
- `website/docs/contributors/setup.md`
- `website/docs/contributors/index.md`
- `website/docs/contributors/data-journey.md`
- `CLAUDE.md`
- `atlas-data/CONTRIBUTING.md` (if it references the frontend)
- Any other markdown matching `grep -n "atlas-frontend"`

**New (stub for external developer docs):**
- `website/docs/developers/index.md` — placeholder; real content tracked by `INVESTIGATE-developer-docs-surface.md`

---

## Out of Scope

- The contributor app's specific feature set (FK integrity dashboards beyond what's already there, dbt test result surfacing, etc.) — separate design conversation, see "Out of scope" in the INVESTIGATE.
- Production deploy of `atlas.helpers.no` — covered by [INVESTIGATE-deployment-pipeline.md](../backlog/INVESTIGATE-deployment-pipeline.md).
- Production deploy of `developer-atlas.helpers.no` (Docusaurus) — same.
- Auth / JWT for the contributor app's optional staging URL — separate plan.
- Migrating the customer app to call PostgREST through an API gateway (Gravitee/APIM) — v1.5+ insertion, not a v1 concern.

---

## Cross-references

- [INVESTIGATE-frontend-data-access-architecture.md](INVESTIGATE-frontend-data-access-architecture.md) — the architectural commitments this PLAN executes.
- [INVESTIGATE-public-api-surface.md](../completed/INVESTIGATE-public-api-surface.md) — the parent investigation; this PLAN is the realisation of its [Q18] (PLAN-E).
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the api_v1 wrapper layer + auto-generator + 5 gates that this PLAN consumes.
- [`talk2.md`](https://github.com/terchris/atlas/blob/main/website/docs/ai-developer/plans/talk/talk2.md) — cross-repo coordination thread that captured the PostgREST integration verification.
- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend/) — the codebase that gets renamed in Phase 1.
- [`website/docs/contributors/setup.md`](../../../contributors/setup.md) — gets updated in Phase 6.

---

## Implementation Notes

- **Order matters within Phase 1.** Do the `git mv` before updating doc references — references update against the new path. If you update docs first, the path doesn't exist yet and the reviewer flags broken links.
- **Phase 2 + Phase 3 are blocking for Phase 4.** Don't try to write the catalog page before the API client exists.
- **The catalog page must stay introspection-driven.** Do not hardcode endpoint names in `app/data/page.tsx` — fetch them from PostgREST's spec at request time. The validation grep enforces this. The whole point of the catalog as the first route is that it self-updates as `api_v1.*` evolves.
- **Phase 5 is open-ended on purpose.** Don't artificially close it. Treat each new customer route as its own small PR. Atlas-data coupling appears only when a route needs data not yet in `api_v1.*`; the `mart_*` view auto-generator from PLAN-004 makes it a one-line addition + regenerate, not a structural change.
- **Forkability discipline** (Phase 2.5) is the single hardest convention to maintain. ESLint rule + a comment at the top of `lib/api.ts` are the lightest enforcement; periodic review of the customer app's import graph catches drift.
