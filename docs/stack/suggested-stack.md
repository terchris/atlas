# Atlas stack — v1 scope

Atlas is a Norwegian public-facing portal to the NGO sector. It consumes public data sources (24 Samfunnspuls-traced sources + broader catalogue in `docs/research/data-sources.md`), transforms them into a consumption-ready schema in Postgres, and serves them through a Next.js app. The data platform is deployed on the **Urbalurba Infrastructure Stack (UIS)** at [uis.sovereignsky.no](https://uis.sovereignsky.no/), maximising reuse of services already running there.

This document has been **significantly narrowed** from its original "enterprise analytics stack" framing after investigating Atlas's actual data profile and source mix (see `docs/research/samfunnspuls/desktop-field-notes.md`, `docs/research/samfunnspuls/data-sources.md`, and `docs/ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`). Atlas's data is small — O(10⁴–10⁵) rows per source, mostly annually updating, consumed by one Next.js app with no auth requirements in v1. Most enterprise analytics components solve problems we don't have.

**Last narrowed**: 2026-04-21.

---

## Decisions at a glance

### ✅ In scope for v1

| Component | Role | UIS status |
|---|---|---|
| **PostgreSQL** | Primary data store — `raw.*` landing, `marts.*` serving, `dagster.*` metadata | ✅ already in UIS |
| **Dagster** | Orchestration: schedules, freshness policies, lineage, single operator UI for all ingestion + transformation jobs | ⚠️ requires install — [INVESTIGATE-dagster.md](../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) filed in UIS repo |
| **dbt Core** | SQL transformations from `raw.*` to `marts.*`. Runs inside pods Dagster spawns on demand — not a service. Ships in the `atlas-data` image. **Scope constraint**: use the seven patterns listed under "dbt scope" below; advanced features (incremental strategies, snapshots, exposures, Python models, custom macros beyond `dbt_utils`) are out of scope until a concrete need emerges. | not a service |
| **TypeScript ingestion** | Source fetchers, one file per data source. Runs inside pods Dagster spawns via Dagster Pipes — not a service. Ships in the `atlas-data` image. | not a service |
| **Next.js** | Public frontend, React Server Components querying `marts.*` directly via a read-only Postgres role. | 🟦 application code on K8s |
| **Kubernetes + ArgoCD** | Platform and GitOps deploy | ✅ already in UIS |
| **Observability** (Prometheus, Grafana, Loki, Tempo, OpenTelemetry) | Metrics, logs, traces, alerts — including Dagster freshness alerts to Slack | ✅ already in UIS |
| **JupyterHub** | Optional analyst exploration against a read-only role on `marts.*` | ✅ already in UIS |
| **Networking** (Traefik, Cloudflare Tunnel / Tailscale) | Public exposure + internal admin access | ✅ already in UIS |

### ❌ Removed from v1 (evaluated, decided no)

Each of these was in the original stack draft. Recording *why* we said no so we don't re-evaluate unnecessarily.

| Component | Why not for v1 |
|---|---|
| **Airbyte** | No off-the-shelf connectors for Norwegian public-sector APIs (SSB, Udir, IMDi, NAV, Brreg, Kartverket). We'd write ~20 Airbyte Custom Connectors, which is the same work as plain TypeScript scripts, but with Airbyte's platform overhead on top. |
| **Apache Spark** | Dataset is O(10⁴–10⁵) rows per source; Postgres handles joins and aggregations comfortably. Spark solves big-data problems Atlas doesn't have. |
| **Cube** (semantic API / metric store) | One consumer (Next.js), no multi-tenant auth, small data. Cube's strengths — caching for BI workloads, multi-consumer metric definitions, JWT row-level security — don't apply. dbt + Postgres indexes are sufficient. Revisit if consumer count grows beyond the Next.js app. |
| **Metabase** (reporting / BI) | Nice-to-have for internal analysts (Signe, Lisa-style staff), not on the public path. Revisit when an actual analyst user emerges. |
| **Authentik** (SSO) | `goal.md` v1 non-goal: no user login. Atlas is a public portal reading public data. Revisit when admin-only areas appear. |
| **Gravitee** (API gateway) | Without public auth or a public-API rate-limiting need, no problem to solve. |
| **OpenMetadata** (governance) | Heavy relative to our source count. `docs/research/samfunnspuls/data-sources.md` is our catalogue; Dagster's Assets UI provides lineage and run history. |
| **Backstage** (developer portal) | Dropped — a nice portal for discovering internal services, but not v1-critical. |
| **Full Supabase bundle** | Redundant with UIS — UIS already provides Postgres, auth (Authentik), observability, and networking. Supabase's value is mostly in greenfield environments with no platform. We cherry-pick individual components (see deferred list) if they earn their keep. |

### 🟡 Deferred to v1.5 or later

| Component | When we'd add it | What it gives |
|---|---|---|
| **PostgREST** (standalone) | When we want a public open-data API over `marts.*` — serves Dev (persona 15) and Ola (persona 6). Doesn't replace the Next.js → Postgres path; it's a parallel reader. | Auto-generated REST API from the schema, tiny Haskell binary, near-zero ops. Separate from Supabase. |
| **Supabase Studio** (standalone) or **Metabase** | When the team wants a better UX for browsing data than pgAdmin | Admin / ad-hoc query UI |
| **Qdrant** (vector search) | v2 — semantic search over NGO documents (sector research, organisation profiles) | Already in UIS, unused in v1 |
| **Elasticsearch** (full-text) | If a specific full-text search need emerges | Already in UIS, optional |
| **LiteLLM / Open WebUI** | v2 — "ask the data" features, summarisation | Already in UIS |

---

## v1 architecture

```
  Upstream sources (SSB, Udir, IMDi, NAV, Brreg, NGO websites, …)
             │
             │  HTTP fetch / HTML scrape / bulk download
             ▼
  Dagster   (schedules, runs, UI, freshness alerts — UIS platform)
             │
             │  spawns pods from atlas-data image, via Pipes
             ▼
  atlas-data image  (TypeScript ingest + dbt + Dagster user code)
             │
             ▼
  raw.*      (landing tables — Postgres)
             │
             │  dbt run (downstream Dagster asset)
             ▼
  marts.*    (consumption tables — Postgres)
             │
             │  read-only role, direct Postgres connection
             ▼
  Next.js    (React Server Components, server-rendered pages)
             │
             ▼
  Browser    (MapLibre map + Digdir Designsystemet UI)
```

One end-to-end journey for one source — the design that grounded this v1 stack before implementation — is documented in [`../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md`](../ai-developer/plans/completed/INVESTIGATE-data-journey-pattern.md). For the live source pattern as currently implemented, see [`../../atlas-data/ingest/src/sources/README.md`](../../atlas-data/ingest/src/sources/README.md).

---

## UIS services we use (zero install)

Everything below is already running in UIS and Atlas reuses it as-is:

- **Storage & data**: PostgreSQL (shared, gets a `dagster` database + `atlas` database with `raw.*`, `marts.*` schemas), Redis (reserved for future caching), Qdrant (reserved for future semantic search), Elasticsearch (optional)
- **Processing & analytics**: JupyterHub (analyst exploration, optional)
- **Identity & gateway**: Authentik (unused by Atlas v1 public path), Traefik
- **Observability**: Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector
- **Platform**: Kubernetes, ArgoCD, pgAdmin, RedisInsight
- **Networking**: Cloudflare Tunnel (public Next.js), Tailscale (internal admin access to Dagster UI)

## What we install in UIS

Just one new service:

### Dagster

- **Distribution**: Dagster OSS (Apache 2.0) — not Dagster Cloud
- **Chart**: official `dagster/dagster` Helm chart
- **Namespace**: `dagster` (new, matches Backstage pattern)
- **Metadata DB**: reuse shared UIS PostgreSQL (new `dagster` database + user)
- **Executor**: Kubernetes — spawns one pod per run step
- **Auth (day 1)**: none (operator tool, Tailscale-gated)
- **Auth (later)**: Traefik + Authentik OIDC middleware

Investigation and proposed PLAN files filed in the UIS repo: [INVESTIGATE-dagster.md](../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md). Follows the UIS "adding a service" workflow.

## What lives in `atlas-data` (not in UIS)

Atlas-data is a **separate repo** (currently colocated as `atlas-data/` during research — see `atlas-data/README.md`). Its only role is to produce the `marts.*` tables.

```
atlas-data/
├── ingest/       # TypeScript — one file per source
├── dbt/          # dbt Core project — transformations
├── dagster/      # Dagster user-code Python package
├── migrations/   # raw schema SQL
├── deploy/       # Dockerfile + code-location + ArgoCD app manifest
└── docs/         # operational: adding-a-source.md, runbook.md
```

CI builds one Docker image (Python + Node + dbt + our code). ArgoCD in UIS watches the image tag and reloads Dagster's code location on each push.

Repo structure motivated in the stack-narrowing discussion. The contract between `atlas-data` and `atlas` (frontend) is the `marts.*` schema and nothing else.

## Repo topology

| Repo | Contains | Deploy surface |
|---|---|---|
| `atlas` (this repo) | Next.js frontend, strategic/research docs, stack docs | Next.js app → K8s in UIS, behind Traefik |
| `atlas-data` (future — currently `atlas-data/`) | TypeScript ingest + dbt + Dagster user code + migrations | Docker image → Dagster code location in UIS |

Contract between them: `marts.*` in Postgres. Frontend has a read-only role; data-side has full control of `raw.*` and `marts.*`.

---

## Data flow

1. **Upstream sources** publish data on their own schedules (SSB annually, NGO websites updated ad-hoc).
2. **Dagster schedule or sensor** fires — either a cron or a polling sensor watching SSB's release calendar.
3. **Dagster spawns a pod** from the `atlas-data` image, runs the relevant TypeScript ingestion via Dagster Pipes.
4. **Ingestion writes to `raw.*`** in Postgres, returns structured metadata (row count, latest year).
5. **Dagster auto-triggers downstream dbt models** — per-source `indicators__*` → union `indicator_values` → join `kommune_indicators`.
6. **dbt writes `marts.*`** and runs tests. Failed tests mark the asset red and stop downstream reads.
7. **Next.js server components query `marts.*`** via a read-only Postgres role.
8. **Browser receives a server-rendered page** — MapLibre map + Digdir-styled UI.

No Cube, no Airbyte worker pool, no API gateway in the middle, no auth mint. Direct path from source to pixels.

---

## dbt scope

Ratified for v1 on 2026-04-21 with an intentionally narrow feature surface. The entire dbt usage in Atlas is these seven patterns:

1. `{{ config(materialized='table') }}` or `materialized='view'` at the top of each model.
2. `{{ source('raw', '<table>') }}` — reference a raw landing table.
3. `{{ ref('<model>') }}` — reference another dbt model (this is what builds the DAG).
4. `schema.yml` — per-model description + tests.
5. Four built-in tests — `not_null`, `unique`, `relationships`, `accepted_values` (or `accepted_range`).
6. CLI commands — `dbt run`, `dbt test`, `dbt run --select <model>`, `dbt docs generate`.
7. One Jinja convenience — `dbt_utils.union_relations` for the `indicator_values` union across per-source models.

Out of scope for v1 (revisit when a concrete need emerges): incremental models, snapshots, exposures / metrics semantic layer, Python models, custom macros beyond `dbt_utils`, hooks, complex seed usage, dbt Cloud / SaaS features.

---

## Open items still to settle

Tracked here so they don't get lost:

1. **Map library** — MapLibre GL vs. Leaflet. `goal.md` leaves it TBD. Either works; pick once.
2. **Kommune boundary source** — Kartverket GeoJSON as a static build-time asset assumed. Geonorge WFS at runtime is the alternative (heavier, probably not worth it).
3. **Next.js caching strategy** — route-level `revalidate` tied to asset cadence, or Postgres listen/notify to invalidate on materialisation. Implementation detail.
4. **When to split `atlas-data/` into its own git repo** — triggers listed in `atlas-data/README.md`.

None block building v1.

---

## Deployment context (UIS)

Atlas is deployed within the Sovereign Sky Infrastructure (UIS):

- **Kubernetes**: for Next.js, Dagster, and all pods Dagster spawns on demand
- **ArgoCD**: GitOps for Dagster install, for Dagster's user-code deployment pointing at the `atlas-data` image, and for the Next.js app
- **Observability**: Dagster logs → Loki, Dagster metrics → Prometheus, Postgres metrics → Prometheus, everything viewable in Grafana
- **Networking**: Next.js public via Cloudflare Tunnel (`atlas.helpers.no`); Dagster UI internal via Tailscale (day 1, pending Authentik OIDC later)

## Install summary

| Component | Action | Effort | Blocking for v1? |
|---|---|---|---|
| **Dagster** | Helm install via UIS service pattern | Medium | Yes — [INVESTIGATE filed](../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) |
| **Atlas-data Docker image** | Build + push via CI | High (custom code) | Yes |
| **Next.js frontend** | Build + deploy as K8s app | High (custom code) | Yes |
| **PostgREST** (optional, v1.5) | Helm install + read-only role | Low | No |

Everything else listed as "✅ already in UIS" costs zero.

---

*Generated for Sovereign Sky / Urbalurba Infrastructure Stack (UIS). Narrowed from original draft through data-source investigation and stack-narrowing discussions, 2026-04-21.*
