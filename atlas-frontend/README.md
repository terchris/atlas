# atlas-frontend

The customer-facing Next.js app for Atlas. Lives at **`atlas.helpers.no`**. Consumes Atlas's public PostgREST API at **`api-atlas.helpers.no`** — no direct Postgres access, no DB role, no SQL in this codebase.

This folder is also positioned as a **forkable reference implementation** for external developers building their own apps on top of Atlas's API. Clone or copy it, change `NEXT_PUBLIC_API_URL`, and you have a working starting point.

## Run locally

```bash
cd atlas-frontend
cp .env.example .env.local
npm install
npm run dev
```

Default dev URL: <http://localhost:3001>. (The contributor diagnostic app at `atlas-contributor-frontend/` runs on port 4000; this app uses 3001 so they coexist locally.)

For the API to respond, Atlas's PostgREST instance has to be reachable at `NEXT_PUBLIC_API_URL`. In the standard local-dev setup this is `http://api-atlas.localhost`, exposed via UIS — see [`website/docs/contributors/setup.md`](../website/docs/contributors/setup.md).

## How to fork this

External developers building their own UI on top of Atlas's data should fork or copy this folder, not the rest of the Atlas monorepo. Steps:

1. Copy `atlas-frontend/` to your own repo (or fork the entire Atlas repo and trim).
2. Set `NEXT_PUBLIC_API_URL` in `.env.local` to your chosen Atlas instance — `https://api-atlas.helpers.no` for the canonical public Atlas, or your own PostgREST endpoint for a private mirror.
3. `npm install && npm run dev` and start customising routes.

The folder is **self-contained**: zero imports from elsewhere in the Atlas monorepo, no shared types or components from `atlas-data/` / `atlas-contributor-frontend/` / `website/`. The only dependency on Atlas is the HTTP API.

## What's in here

**Library:**
- **`src/lib/api.ts`**: PostgREST fetch helpers (`fetchRows`, `fetchCount`, `fetchSpec`). Each accepts an optional `acceptProfile` for non-default schemas — required for reaching `marts.*` and `raw.*` (the default schema is `api_v1`). All helpers use `cache: "no-store"` so data displays are always live; see the `fetchRows` jsdoc for the rationale.
- **`src/lib/api-types.ts`**: regenerable TypeScript types from PostgREST's OpenAPI spec — run `npm run api:types` after the spec changes.
- **`src/lib/catalog-filter.ts`**: pure helpers for the `/data` tag-filter sidebar (faceted-search semantics: AND across namespaces, OR within).

**Routes:**
- **`app/page.tsx`**: homepage with two calls-to-action — *Browse all endpoints* and *Sources*.
- **`app/data/page.tsx`**: tag-filtered endpoint catalog. Reads `api_v1.meta_endpoints` (119 rows across `api_v1` + `marts` + `raw` schemas) and renders a sidebar with 6 namespace-grouped facets (`provider`, `topic`, `geo`, `cadence`, `eu_theme`, `layer`) plus endpoint cards. URL-driven filter state — see *Tag URLs* below.
- **`app/data/[schema]/[table]/page.tsx`**: per-endpoint table viewer. Sends `Accept-Profile: <schema>` for non-default schemas; supports `?page=`, `?pageSize=`, `?sort=`, `?q=` (full-text across string columns).
- **`app/data/[schema]/[table]/spec/page.tsx`**: per-endpoint OpenAPI spec viewer.
- **`app/data/sources/page.tsx`**: sources index — every upstream Atlas ingests, grouped by provider, with freshness signals + tag pills.
- **`app/data/sources/[source_id]/page.tsx`**: per-source detail page — manifest metadata + freshness + raw ingest table link + list of derived endpoints (joined live against the lineage seed).

### Tag URLs

The `/data` page is fully URL-driven. Bookmarkable filter combinations:

```
/data?tag=topic:income                                  # every income-related endpoint
/data?tag=topic:income&tag=geo:kommune                  # AND across namespaces
/data?tag=topic:income&tag=topic:education              # OR within a namespace
/data?tag=provider:ssb&tag=cadence:annual               # SSB tables published annually
/data?tag=layer:api_v1                                  # only the curated public-API surface
/data?q=oslo                                            # free-text search over endpoint names + tags
```

Tag pills on each card are clickable to add to the active filter; clicking again removes them.

The full architectural rationale lives at [`website/docs/ai-developer/plans/completed/INVESTIGATE-frontend-data-access-architecture.md`](../website/docs/ai-developer/plans/completed/INVESTIGATE-frontend-data-access-architecture.md). The phased build logs are at [PLAN-005](../website/docs/ai-developer/plans/completed/PLAN-005-frontend-split-and-rebuild.md) (initial split + introspection-driven catalog) and [PLAN-007](../website/docs/ai-developer/plans/completed/PLAN-007-data-display-open-by-default.md) (open-by-default rewrite + tag filter + multi-schema routes).

## What's deliberately not in here

- No `postgres.js`, `pg`, `prisma`, `drizzle`, or any other DB driver — and never will be. Direct DB access lives in the **contributor diagnostic app** (`atlas-contributor-frontend/`), which is a separate Next.js app for ingestion verification, not a public-facing surface.
- No imports from `atlas-data/` or `atlas-contributor-frontend/`. The forkability constraint requires zero coupling beyond the HTTP API.
- No design-system inheritance from the contributor app. The customer app's UI is built fresh against its public-facing audience.

## See also

- [`api-atlas.helpers.no`](https://api-atlas.helpers.no) — the public API this app consumes (Swagger 2.0 spec at `/`).
- [`website/docs/developers/`](../website/docs/developers/) — the docs surface for external developers consuming the API (in development under `INVESTIGATE-developer-docs-surface.md`).
- [`atlas-contributor-frontend/`](../atlas-contributor-frontend/) — the sibling app for contributors, with direct Postgres access for verification work.
