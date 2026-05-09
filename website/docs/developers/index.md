# For external developers building on Atlas

This section is for **anyone consuming Atlas's public PostgREST API** to build their own thing — frontends, CLIs, agent integrations, mobile apps, scripts. If you're contributing *to* Atlas itself (writing dbt models, adding ingest sources), see [`/contributors/`](../contributors/) instead.

> **Status: stub.** Real content (getting-started walkthrough, embedded API reference, versioning policy, examples) is being designed in [INVESTIGATE-developer-docs-surface.md](../ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md). For now, the pointers below are the canonical entry points.

## Open by default

Atlas's posture: **anything not explicitly gated is queryable**. The public PostgREST API exposes three schemas, all anonymous-read:

| Schema | What's in it | When you'd query it |
|---|---|---|
| `api_v1` | Curated wrapper views — the production-stable contract surface | When you want guaranteed-stable column shapes for a published product |
| `marts` | Every dbt-built mart (dim, fact, indicator, supply, ref) | When you want the working dataset that hasn't been frozen into an `api_v1` view yet |
| `raw` | Verbatim ingest landings — every row Atlas pulled from upstream | When you want full provenance or are debugging a transformation |

Private schemas (`private_marts`, `private_raw`) carry personal data (e.g. Red Cross volunteer records via the FRR integration) and stay outside the schema list — `atlas_web_anon` has no grants on them; PostgREST returns 404 even with explicit `Accept-Profile: private_marts`.

### Reaching non-default schemas

PostgREST routes header-less requests to the **first** schema in `--schemas`, which Atlas configures as `api_v1`. To reach `marts.*` or `raw.*`, send `Accept-Profile: <schema>` per request:

```bash
# Default (api_v1) — header omitted
curl -s "$ATLAS/distrikt_summary?limit=2"

# marts schema — explicit Accept-Profile
curl -s -H 'Accept-Profile: marts' "$ATLAS/dim_kommune?limit=2"

# raw schema — same pattern
curl -s -H 'Accept-Profile: raw' "$ATLAS/ssb_08764?limit=2&region_code=eq.0301"
```

Naive `curl /dim_kommune` (without the header) returns 404 because PostgREST resolves it as `api_v1.dim_kommune` which doesn't exist. That's correct routing, not a misconfiguration.

### Catalog as a queryable endpoint

The catalog itself is exposed as a queryable endpoint — no separate scraping or hand-rolled discovery needed:

```bash
# Every endpoint Atlas serves, with provider/topic/geo/cadence/eu_theme/layer tags
curl -s "$ATLAS/meta_endpoints" | jq '.[0]'

# Every upstream Atlas ingests, with freshness signals
curl -s "$ATLAS/meta_sources?provider=eq.ssb" | jq '.[0]'

# Per-source × per-upstream-dimension editorial pass-through
curl -s "$ATLAS/meta_dimensions?source_id=eq.ssb-08764"
```

These are the same endpoints the customer frontend at <https://atlas.helpers.no/data> reads — your app gets the same introspection surface for free.

### Tag-filter URL pattern (for the human catalog)

The customer app at `atlas.helpers.no/data` is fully URL-driven. External developers can deep-link to filtered views:

| URL | What it shows |
|---|---|
| `/data` | Every endpoint, no filter |
| `/data?tag=topic:income` | Every income-related endpoint |
| `/data?tag=topic:income&tag=geo:kommune` | AND across namespaces — income AND kommune-level |
| `/data?tag=topic:income&tag=topic:education` | OR within a namespace — income OR education |
| `/data?tag=provider:ssb&tag=cadence:annual` | SSB tables published annually |
| `/data?tag=layer:api_v1` | Only the curated public-API surface |
| `/data?q=oslo` | Free-text search across endpoint names + tags |

Same logic at the catalog-data layer — the URL params translate to filter passes against `meta_endpoints.tags`. Useful if you want to embed a "show me Atlas data about my topic" link in your own product.

## Where to start today

### 1. Read the API spec directly

PostgREST self-describes. The full schema (every endpoint, every column type, every description) is at the API root:

```bash
curl https://api-atlas.helpers.no/             # Swagger 2.0 spec — human and machine readable
curl http://api-atlas.localhost/               # local dev (UIS rancher-desktop)
```

Pretty-print it with `jq`:

```bash
curl -s http://api-atlas.localhost/ | jq '.paths | keys[]'                    # list every endpoint
curl -s http://api-atlas.localhost/ | jq '.definitions.indicator_summary'     # one view's columns + descriptions
```

Per-endpoint row counts without fetching the data:

```bash
curl -sI -H "Prefer: count=exact" http://api-atlas.localhost/indicator_summary?limit=0 | grep -i content-range
# → Content-Range: */163
```

### 2. Fork the customer app as a starting template

[`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) is Atlas's public-facing Next.js app, deployed at `atlas.helpers.no`. It's also positioned as a **forkable reference implementation** — clone the folder, change `NEXT_PUBLIC_API_URL`, and you have a working starting point for your own UI on Atlas's API. Its README has the fork-me walkthrough.

The customer app demonstrates the patterns this docs surface will eventually formalise: typed fetch helpers (`src/lib/api.ts` — note the `acceptProfile` option for non-default schemas), OpenAPI codegen for types (`src/lib/api-types.ts`), a tag-filtered catalog page driven by `meta_endpoints` (`app/data/page.tsx`), per-endpoint table viewer with multi-schema dispatch (`app/data/[schema]/[table]/page.tsx`), and the no-DB-driver / no-`postgres.js` discipline.

## What's coming

Per [INVESTIGATE-developer-docs-surface.md](../ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md), the planned full content for this section:

- **Getting started** — first `curl` walkthrough with real responses.
- **API reference** — embedded Swagger UI live-pointed at `api-atlas.helpers.no/`.
- **Concepts** — canonical conventions (`kommune_nr`, `fylke_nr`, `orgnr`) framed for API consumers.
- **Forking the customer app** — full guide; the `atlas-frontend/README.md` becomes a teaser pointing here.
- **Versioning** — the `api_v1` ↔ `api_v2` deprecation policy.
- **Changelog** — version-bump and breaking-change record.
- **Agent integration** — wiring the API into LLM agents / MCP servers.

The follow-on PLAN-006 ships these. Until it does, this index page + the customer app's README + the live spec are the entry points.

## See also

- [`atlas-frontend/`](https://github.com/terchris/atlas/tree/main/atlas-frontend) — the canonical fork-me reference implementation.
- [`api-atlas.helpers.no/`](https://api-atlas.helpers.no/) — the live API + spec.
- [`/contributors/`](../contributors/) — internal docs for people contributing to Atlas itself.
- [PLAN-004-postgrest-api-v1-wrapper.md](../ai-developer/plans/completed/PLAN-004-postgrest-api-v1-wrapper.md) — how the `api_v1` schema is generated and validated. Useful background if you want to understand the contract guarantees.
