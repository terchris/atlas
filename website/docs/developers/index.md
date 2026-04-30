# For external developers building on Atlas

This section is for **anyone consuming Atlas's public PostgREST API** to build their own thing — frontends, CLIs, agent integrations, mobile apps, scripts. If you're contributing *to* Atlas itself (writing dbt models, adding ingest sources), see [`/contributors/`](../contributors/) instead.

> **Status: stub.** Real content (getting-started walkthrough, embedded API reference, versioning policy, examples) is being designed in [INVESTIGATE-developer-docs-surface.md](../ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md). For now, the two pointers below are the canonical entry points.

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

The customer app demonstrates the patterns this docs surface will eventually formalise: typed fetch helpers (`src/lib/api.ts`), OpenAPI codegen for types (`src/lib/api-types.ts`), an introspection-driven catalog page (`app/data/page.tsx`), and the no-DB-driver / no-`postgres.js` discipline.

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
