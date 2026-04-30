# Atlas stack — v1 scope

Atlas is a Norwegian public-facing portal to the NGO sector. It consumes public data sources (24 Samfunnspuls-traced sources + broader catalogue in `docs/research/data-sources.md`), transforms them into a consumption-ready schema in Postgres, and serves them through a Next.js app. Atlas is deployed at [atlas.helpers.no](https://atlas.helpers.no), running on top of the **Urbalurba Infrastructure Stack (UIS)** — a Kubernetes-based platform that provides Postgres, observability, identity, networking, and GitOps. Atlas reuses UIS services rather than installing its own.

This document has been **significantly narrowed** from its original "enterprise analytics stack" framing after investigating Atlas's actual data profile and source mix (see `docs/research/samfunnspuls/desktop-field-notes.md`, `docs/research/samfunnspuls/data-sources.md`, and `website/docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`). Atlas's data is small — O(10⁴–10⁵) rows per source, mostly annually updating, consumed by one Next.js app with no auth requirements in v1. Most enterprise analytics components solve problems we don't have.

**Last narrowed**: 2026-04-21.

**Updated 2026-04-27**: **PostgREST promoted to v1** after the **dogfood decision**: Atlas's Next.js will be migrated to consume the same public HTTP API that external consumers (developers, journalists, Tilskuddsmatcher / Lisa-style NGO staff) use. External consumers get *only* API access — no direct DB role. The Next.js → Postgres direct path becomes Next.js → PostgREST → Postgres; Next.js becomes the first external-shaped consumer that exercises (and hardens) the contract.

For v1: **no API gateway, no auth.** PostgREST sits directly behind Cloudflare Tunnel as a public read-only API. Authentik (already in UIS) and Gravitee (already in UIS) — and their production equivalents Okta + Azure APIM — are available infrastructure to add **later** (v1.5+), when the v1 read-anon surface needs rate-limiting, keyed access, or per-tenant policies (e.g. when Lisa as a keyed user lands, or when public abuse becomes a real problem). Detailed analysis in [`../ai-developer/plans/completed/INVESTIGATE-public-api-surface.md`](../ai-developer/plans/completed/INVESTIGATE-public-api-surface.md).

---

## Decisions at a glance

### ✅ In scope for v1

| Component | Role | UIS status |
|---|---|---|
| **PostgreSQL** | Primary data store — `raw.*` landing, `marts.*` serving | ✅ already in UIS |
| **dbt Core** | SQL transformations from `raw.*` to `marts.*`. Runs as CLI in v1 (npm scripts / cron); migrates to Dagster-orchestrated pods in v2. Ships in the `atlas-data` image. | not a service |
| **TypeScript ingestion** | Source fetchers, one file per data source. Runs as CLI in v1 (npm scripts / cron); migrates to Dagster-orchestrated pods in v2. Ships in the `atlas-data` image. | not a service |
| **Next.js** | Public frontend, React Server Components. After dogfood migration: queries the API (not Postgres directly). | 🟦 application code on K8s |
| **PostgREST** *(added 2026-04-27)* | Auto-generated REST API on `marts.*` views. Generates OpenAPI from schema introspection. Runs as a single read-only Postgres role. Public + anonymous in v1 — same surface for Next.js and external consumers (dogfood). | ⚠️ requires install (Helm chart, single binary, low-ops) |

### 🟡 Future (not in v1)

Components Atlas may add when specific triggers fire. v1 is built so insertion is clean — ingest scripts are pod-spawnable, the marts surface is stable, the API service is stateless.

| Component | What it adds | Trigger that would fire it |
|---|---|---|
| **Dagster** | Orchestration: schedules, freshness policies, lineage, operator UI for ingestion + dbt jobs. Spawns pods from the `atlas-data` image via Dagster Pipes. | Source count or cadence outgrows manual / cron runs. v1 ingest scripts and dbt are structured to be pod-spawnable so insertion is clean. [INVESTIGATE-dagster.md](../../../urbalurba-infrastructure/website/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) is filed in the UIS repo. |
| **Authentik** (SSO, in UIS) / **Okta** (prod) | Identity provider for keyed/OAuth API access. | First real authenticated user materialises — Lisa as keyed user, internal NGO staff with per-tenant scope, write endpoints. |
| **Gravitee** (API gateway, in UIS) / **Azure APIM** (prod) | API gateway in front of PostgREST: imports OpenAPI, enforces rate-limit / auth / caching / request validation / CORS. | Public-anonymous v1 outgrows itself — abuse pressure, keyed access needed, write endpoints land. PostgREST stays unchanged; only the deployment topology shifts. |
| **Metabase** (reporting / BI) | Browse-and-query UI for analysts. | Internal analyst or NGO staff (Signe, Lisa) actively want a no-code data surface alongside the public API. |
| **Cube** (semantic API / metric store) | Multi-protocol API (REST + GraphQL + SQL) with metric definitions colocated with the API. | Consumer count grows beyond Next.js + a handful of external devs, AND metric governance becomes a dominant concern. dbt's own evolving semantic-layer story may overlap; revisit then. |

---

## v1 architecture

Updated 2026-04-27 to insert PostgREST as the API layer (dogfood pattern). Next.js no longer reads `marts.*` directly; it goes through the same public read-only API external consumers use. **No gateway, no auth in v1** — added later when those needs emerge.

```
  Upstream sources (SSB, Udir, IMDi, NAV, Brreg, NGO websites, …)
             │
             │  HTTP fetch / HTML scrape / bulk download
             ▼
  TypeScript ingest (CLI — `npm run ingest:<source>`; cron-driven)
             │
             ▼
  raw.*      (landing tables — Postgres)
             │
             │  dbt run (CLI; cron-driven)
             ▼
  marts.*    (consumption tables — Postgres)
             │
             │  read-only role
             ▼
  PostgREST  (auto-API service; generates OpenAPI from schema)         ◄── public, anonymous, read-only
             │
             │  HTTPS via Cloudflare Tunnel (api.atlas.helpers.no)
             ▼
  ┌────────────────────────────────────────┬───────────────────────────────┐
  │ Next.js (atlas.helpers.no)             │ External consumers            │
  │ — RSC fetch via API                    │ — devs, journalists           │
  │ — same surface as external consumers   │ — Tilskuddsmatcher / Lisa     │
  └────────────────────────────────────────┴───────────────────────────────┘
             │
             ▼
  Browsers / consumer applications  (MapLibre map + Digdir Designsystemet UI)
```

In v2, **Dagster** sits between the ingest scripts and `raw.*` (and between dbt and `marts.*`) — orchestrating both via Dagster Pipes against the same `atlas-data` image. The v1 design is structured so that insertion is clean: ingest scripts are pod-spawnable as-is, dbt has no v1 dependency on Dagster.

dbt MCP server (per the parallel [INVESTIGATE-semantic-foundation-before-expansion.md](../ai-developer/plans/backlog/INVESTIGATE-semantic-foundation-before-expansion.md) thread) sits alongside this surface as the *agent* interface (Claude / GPT / MCP clients reading `manifest.json`). MCP and HTTP API are complementary: same `marts.*` source-of-truth, different access patterns.

When v1 outgrows public-anonymous (rate-limit pressure, keyed users, write endpoints), Authentik + Gravitee (local) and Okta + Azure APIM (prod) get inserted in front of PostgREST — they're already provisioned in UIS / Azure. That's a v1.5+ change, not a v1 change.

One end-to-end journey for one source — the design that grounded this v1 stack before implementation — is documented in [`../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md). For the live source pattern as currently implemented, see [`../../atlas-data/ingest/src/sources/README.md`](../../atlas-data/ingest/src/sources/README.md).

