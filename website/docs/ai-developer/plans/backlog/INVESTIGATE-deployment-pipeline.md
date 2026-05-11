# Investigate: Deployment pipeline

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide how every Atlas-side **deployable** artefact — the Docusaurus site (which also hosts the Scalar API playground and dbt-docs) and the `atlas-data` polyglot image that registers as a Dagster code location — goes from a developer's commit to running on UIS. Covers CI test gates, image build + registry, hostnames, secrets, database migrations, rollback, the cross-repo handshake with the UIS Dagster install, and which environments exist (prod-only or also staging / PR previews).

**Last Updated**: 2026-05-11 (third full rewrite — see "What's changed since the previous draft").

**Origin**: Atlas was pre-production when the original draft was written (2026-04-23). Since then PostgREST has shipped and become UIS-owned (PLAN-004), the frontend has split into two apps (PLAN-005), the source catalogue has grown to ~38 sources (PLAN-007), the docs tree has moved under `website/docs/` (PLAN-003), and **UIS has begun documenting how Dagster will run in their stack** ([`urbalurba-infrastructure/.../INVESTIGATE-dagster.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md)). The high-level deploy architecture is settled in [`docs/stack/suggested-stack.md`](https://github.com/terchris/atlas/tree/main/docs/stack/suggested-stack.md); **what's still missing is the CI side, the release flow for Atlas-owned artefacts, and the cross-repo handshake with UIS Dagster.** This investigation enumerates what to build and what to decide so we can split it into ordered PLANs.

---

## What's changed since the previous draft

The earlier version (2026-04-23, status-updated 2026-04-27) framed Atlas as having two deployable artefacts (one Next.js frontend + the `atlas-data` image) running on a Dagster-deferred v1 stack. Eight things have shifted:

1. **PostgREST shipped and is UIS-owned** (PLAN-004, #29, #30) — the API service is no longer hypothetical and is **not in Atlas CI scope**. UIS deploys and operates it. Atlas's responsibility ends at writing `marts.*` and the `api_v1.*` wrapper views.
2. **Frontend split** (PLAN-005, #33) — `atlas-frontend` became two apps: `atlas-frontend/` (customer, PostgREST consumer) and `atlas-contributor-frontend/` (contributor diagnostics, direct Postgres).
3. **Docs are under `website/docs/`** (PLAN-003 phase 1, #27) — every relative path in the previous draft's cross-references was stale. **Docusaurus** is now in the repo as `website/` and will be a deployable artefact when its build is wired up.
4. **Source catalogue grew** — bufdir, ssb-crime, ssb-10826, ssb-13995, Red Cross supply (#36, #38, #57, #58, #71, etc.). The `atlas-data` image is now real workload; CI needs to handle ≥38 ingest scripts and a non-trivial dbt project.
5. **v1 deploy surface narrowed (2026-05-11)** — both Next.js frontends are **kept in the repo but not deployed in v1**. The customer surface for humans is **Docusaurus at `atlas.helpers.no`**.
6. **Dagster is back in v1** (2026-05-11) — `suggested-stack.md` previously deferred Dagster to v2 with v1 ingest running as "CLI scripts under cron." UIS has since drafted [`INVESTIGATE-dagster.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md). Atlas's v1 ingest plan is now **Dagster-driven, not cron-driven**. No K8s CronJobs in this design. The `atlas-data` image becomes a Dagster code-location image (polyglot Python + Node + dbt + dagster).
7. **Scalar + dbt-docs collapse into Docusaurus** (2026-05-11) — rather than separate `developer-atlas.helpers.no` (Scalar) and `dbt-atlas.helpers.no` (dbt-docs) hostnames, both ship as **pages/subpaths inside the Docusaurus site**: Scalar at `/api`, dbt-docs at `/lineage/`. One container, one hostname, one deploy. The `developer-atlas` hostname is dropped from the plan; the `<role>-atlas` convention only applies to UIS-owned platform components (`api-atlas`, etc.).
8. **No Cloudflare Tunnel in v1** (2026-05-11) — earlier framing assumed Atlas's public surface would be exposed via Cloudflare Tunnel. v1 drops the Tunnel; everything goes through **UIS's standard Traefik ingress**, with the `atlas.*` host rule covering `atlas.helpers.no` (prod) and `atlas.localhost` (UIS local dev). Cloudflare Tunnel remains an option for later but is not assumed.

---

## What's already settled (don't re-litigate)

From [`docs/stack/suggested-stack.md`](https://github.com/terchris/atlas/tree/main/docs/stack/suggested-stack.md) and [`urbalurba-infrastructure/.../INVESTIGATE-dagster.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md):

- **Hosting platform**: UIS (Kubernetes, **Traefik ingress**, observability stack). No Cloudflare Tunnel in v1.
- **Postgres**: shared UIS instance; Atlas owns `raw.*`, `marts.*`, and `api_v1.*` schemas. Dagster gets its own database (`dagster`) on the same instance for run metadata.
- **PostgREST**: deployed by UIS (Helm chart). Reads `api_v1.*` by default; other schemas reachable via `Accept-Profile` header. **Not an Atlas CI concern.** Exposed at `api-atlas.helpers.no` / `api-atlas.localhost` via UIS ingress.
- **Dagster**: deployed by UIS via the official `dagster/dagster` Helm chart (OSS distribution). Webserver + daemon + run pods all live in a `dagster` namespace owned by UIS. Atlas contributes a **code location** (a polyglot Docker image) that Dagster registers via `dagster-user-deployments.deployments[]` in the Helm values. **Atlas does not deploy or operate the Dagster platform** — that's UIS's responsibility.
- **No CronJobs**. Scheduling is owned by Dagster (`@schedule` declarations inside Atlas's Python module).
- **No ArgoCD for the data side in v1** — per UIS Dagster doc, Atlas image updates happen via **manual `helm upgrade`** of the UIS Helm release after the Atlas image tag is bumped in values. ArgoCD remains an option for the Docusaurus deploy but is not assumed.
- **Observability**: Loki / Prometheus / Grafana, already in UIS. Dagster exposes Prometheus metrics on the webserver and daemon.
- **Internal admin access**: Dagster UI is internal-only day 1 (network-gated via the UIS cluster); Authentik OIDC via Traefik middleware later.

From the implementation work since:
- **`dbt build` is the test gate** for any pipeline change — see [`project-atlas.md`](../../project-atlas.md).
- **dbt invocation pattern**: `uv run --env-file ../ingest/.env dbt <cmd>` — locally and in CI. Inside the polyglot image, `dagster-dbt` invokes dbt natively (no shell wrapper).
- **PostgREST schema routing**: `api_v1` is the default; `marts.*` and `raw.*` need `Accept-Profile` per request.
- **Neither Next.js frontend is deployed in v1** — `atlas-frontend/` and `atlas-contributor-frontend/` stay in the repo as runnable local-dev surfaces, with the deploy story deferred.

---

## v1 deployable artefacts

The complete set of things that go from commit to running. **Two deployed**, two kept-in-repo-but-not-deployed, two UIS-owned for context.

| Artefact | Type | Owner | Production hostname | Local dev hostname | Notes |
|---|---|---|---|---|---|
| Docusaurus (with Scalar + dbt-docs as pages) | Static site, K8s deployment, public | Atlas | `atlas.helpers.no` | `atlas.localhost` | Single Docusaurus container exposes **everything human-facing for Atlas**: `/` landing + narrative docs, `/api` Scalar interactive playground (loads PostgREST OpenAPI spec from `api-atlas.helpers.no/`), `/lineage/` dbt-docs static site. Served behind UIS Traefik ingress. |
| `atlas-data` polyglot image | Docker image registered as Dagster code location (no HTTP exposed) | Atlas (image); UIS (registration) | n/a — addressed inside Dagster as code location `atlas-data` | n/a | Python 3.11 + Node 20 + uv + dbt + `dagster` + `dagster-dbt` + `dagster-k8s` + `dagster-pipes` + the ingest TS + the dbt project. **Same image runs as two pod types**: the always-on code-location pod (`dagster api grpc`) and the ephemeral run pods that Dagster's `K8sRunLauncher` spawns on materialisation. Built and tagged in Atlas CI, pushed to GHCR; deployed by bumping the tag in UIS Helm values + `helm upgrade`. |
| **PostgREST** | K8s deployment, public | **UIS** | `api-atlas.helpers.no` | `api-atlas.localhost` | Listed for context; **not in Atlas CI/CD**. UIS Traefik ingress. |
| **Dagster (platform)** | Webserver + daemon + metadata DB, K8s deployment, internal | **UIS** | `dagster.<uis-domain>` (TBD) | `dagster.localhost` | Listed for context; **not in Atlas CI/CD**. UIS PLAN-001 stands the platform up empty; Atlas PLAN-002 registers the first code location. |
| `atlas-frontend` (customer) | Next.js — **not deployed in v1** | Atlas | *(not deployed)* | `localhost:3001` (direct, no UIS routing) | Customer Next.js consumer of PostgREST. Kept in repo as a runnable local surface and code reference; deploy story revisited later. |
| `atlas-contributor-frontend` | Next.js — **not deployed in v1** | Atlas | *(not deployed)* | `localhost:4000` (direct, no UIS routing) | Contributor diagnostics with direct Postgres role. Local-dev only by design. |

**Hostname convention**: Atlas has **one human-facing hostname**, `atlas.<base>` (where `<base>` is `helpers.no` in prod and `localhost` in UIS dev). The `<role>-atlas.<base>` prefix pattern applies only to **UIS-owned platform components** addressed in the Atlas context — currently `api-atlas` (PostgREST). UIS's own components (Dagster UI, Grafana, etc.) keep their own UIS-scoped hostnames. Atlas itself is **one site at one hostname**; Scalar and dbt-docs live as subpaths under that site, not as separate hostnames.

**Ingress**: standard UIS Traefik. A single ingress with the `atlas.*` host rule covers `atlas.helpers.no` (prod) and `atlas.localhost` (UIS local dev). Same manifest, same image, different environments.

---

## What's missing — the CI + release questions

### Components and what each needs

| Artefact | Build | Test gate | Package | Deploy |
|---|---|---|---|---|
| Docusaurus (with Scalar + dbt-docs as pages) | `npm run build` (in `website/`); pull latest dbt-docs artefact and unpack into `static/lineage/` before the Docusaurus build; the `/api` route uses `@scalar/api-reference-react` (or a `<script>`-tag page) pointed at `api-atlas.helpers.no/` | Link-check, build-must-pass; verify the Scalar spec URL is reachable at build/deploy time | Single Docker image (nginx or static-host) containing the Docusaurus output, including the Scalar page at `/api` and dbt-docs at `/lineage/` | K8s Deployment via UIS Traefik ingress; hostname `atlas.helpers.no` (prod) / `atlas.localhost` (dev) via the `atlas.*` host rule |
| `atlas-data` polyglot image | Multi-stage Dockerfile: Node 20 deps (`pnpm install` in `ingest/`, includes `@dagster-io/dagster-pipes`) → Python 3.11 deps (`pip install dagster dagster-dbt dagster-k8s dbt-postgres`) → runtime layer with both + `atlas-data/dbt/` + Dagster `definitions.py` | (a) `tsc --noEmit` (ingest); (b) `dbt parse`; (c) full `dbt build` against ephemeral Postgres in CI; (d) `dagster definitions validate` (or equivalent — verifies the Python module imports cheaply); (e) `dagster api grpc` smoke test in CI (boot the gRPC server, confirm it responds) | Single image tagged `ghcr.io/helpers-no/atlas-data:vX.Y.Z`. ~1.5–2 GiB. Multi-stage + BuildKit cache critical. | Atlas CI pushes the image to GHCR with a unique tag. UIS-side: bump `dagster-user-deployments.deployments[].image.tag` in the Dagster Helm values; `helm upgrade`. Dagster's webserver/daemon reconnect to the new gRPC server automatically. |
| `raw.*` migrations | n/a (SQL files in `atlas-data/migrations/`) | Apply to ephemeral Postgres in CI | Bundled inside the polyglot image | Runs as a Dagster asset (with downstream-dependency edges so it executes before any ingest asset), or as a one-shot `kubectl run` against the polyglot image. See Q7. |

Both Next.js apps still get CI **typecheck/build** gates (cheap, prevents regression for the local-dev surfaces) but no Dockerfile, no image push, no UIS deploy in v1.

### Decisions to make

1. **CI host** — GitHub Actions, GitLab CI, or self-hosted runner inside UIS? Atlas's repo is on GitHub. GHA is the obvious default; self-hosted-on-UIS is more sovereign-stack-aligned but adds operational surface. UIS may already have a preference — check before deciding.
2. **Image registry** — UIS's Dagster doc names **GHCR** (`ghcr.io/helpers-no/atlas-data`) as the expected registry for the polyglot image. Confirm GHCR is the chosen registry for the Docusaurus image too (consistency), or whether UIS prefers a UIS-hosted registry (Harbor) for some/all.
3. **Deploy mechanism for the Docusaurus image** — UIS's Dagster doc commits to **manual `helm upgrade`** for the `atlas-data` code location in v1 (no ArgoCD-driven tag-following). Docusaurus is a simpler workload; it could follow the same manual pattern, use ArgoCD if UIS has it wired up for other apps, or use UIS's existing service-deployment playbook. Decide before the Docusaurus deploy PLAN.
4. **Branch / release strategy** — trunk-based (every `main` commit publishes a new image + auto-deploys) or release branches / tags? Atlas is small + single-developer; trunk-based is simplest. **Caveat for the polyglot image**: per UIS Dagster doc, every image must have a unique tag (Helm only rolls a Deployment if the image field changes), so `latest` is not a safe default — `vX.Y.Z` or `sha-<commit>` per build.
5. **Environments** — prod-only, dev + prod, dev + staging + prod, or PR-preview environments? Pre-production status argues for *prod only* now; preview environments add real value when external reviewers join. Note: `atlas.localhost` is the natural UIS local-dev environment for the Docusaurus image; `dagster.localhost` for the code-location image.
6. **Secrets management** — sealed-secrets, external-secrets-operator, ArgoCD's vault plugin, or 1Password Connect? UIS likely already has a pattern — check before inventing.
7. **Database migrations** — when and how does `npm run migrate` run? Three options:
    - (a) **Dagster asset with dependency edges** — declare a `raw_schema_migrations` asset that every ingest asset depends on. Dagster guarantees it runs first. Idempotent migration runner makes this safe to fire on every materialisation.
    - (b) **One-shot `kubectl run` against the polyglot image** — operator runs `kubectl run --image=ghcr.io/helpers-no/atlas-data:vX.Y.Z -- npm run migrate` before doing the Helm upgrade. Explicit, manual, clear.
    - (c) **Image entrypoint side-effect** — migrations run when the code-location pod starts. Rejected (violates the "keep `definitions.py` cheap to import" discipline from the UIS Dagster doc).
    Recommend (b) for the very first deploy and (a) once `dagster-dbt` is wired and asset dependencies are reliable. Migration runner already implemented in `atlas-data/ingest/scripts/migrate.ts`.
8. **CI test gates per artefact** — minimum bar:
    - Both Next.js apps: `tsc --noEmit` + `npm run build` on PR + main (cheap regression gate; no deploy).
    - `atlas-data` polyglot image: `tsc --noEmit` + `dbt parse` + Python module import-smoke on PR; full `dbt build` against ephemeral Postgres + `dagster api grpc` smoke + image build on main.
    - Docusaurus: `npm run build` + link-check + verify Scalar spec URL responds.
9. **Ephemeral Postgres in CI** — service container in GHA running the same Postgres major version as UIS. dbt seed + build against it; tear down after. Also serves the `dagster api grpc` smoke test if any boot-time queries are needed.
10. **Image build cache for the polyglot image** — uv venv + dbt + Node deps + dagster pip layers all slow cold. BuildKit cache to GHCR is the obvious answer; verify the GHA runner has enough disk for layer caching.
11. **Image tagging for `atlas-data`** — per UIS Dagster doc, **unique tags are mandatory** (Helm rollout depends on the image field changing). Use semver (`v1.2.3`) for human-readable rollbacks + commit SHA (`sha-abc1234`) for traceability. Never use `latest` for this image. Docusaurus tagging is less critical and can follow the same pattern for consistency.
12. **Rollback for `atlas-data`** — UIS-side `helm rollback` on the Dagster release reverts the image tag and re-rolls the code-location pod. dbt-model rollback is harder (data already transformed); convention: never destructive `dbt run --full-refresh` from CI; only manual + reviewed.
13. **PR validation vs main jobs** — PR: typecheck + dbt parse + `dagster definitions validate` + Docusaurus build (fast, advisory). Main: full `dbt build` + image build + push + (manual) Helm-values bump (slow, blocking on the push).
14. **Next.js test runners** — neither frontend has Vitest/Playwright. Worth adding now? Probably wait until either app actually starts shipping again; typecheck + build is the minimum bar.
15. **Secrets needed at runtime**:
    - Docusaurus: none (Scalar spec URL is public; dbt-docs is static).
    - `atlas-data` polyglot image: `ATLAS_DATABASE_URL` (owner role for `raw.*` + `marts.*`); no API keys for current sources (Brreg / FHI / SSB are all open). Secret name and shape coordinated with UIS Helm values (per the Dagster doc's `code-location-values.yaml` fragment).
    - Both Next.js apps: not deployed in v1; secrets are local-dev only.
16. **The atlas-data repo split** — `atlas-data/README.md` lists trigger conditions for moving it out of the monorepo. The polyglot-image deploy story is the strongest signal yet for splitting — but for v1 it's still cheaper to keep everything in the monorepo and let the Atlas CI build the image from there. Revisit if/when CI complexity makes the split worth it.
17. **Schema-change coordination** — when a `marts.*` or `api_v1.*` change ships, the **Scalar page at `/api`** auto-reflects it (loads the spec live from `api-atlas.helpers.no`) and **dbt-docs at `/lineage/`** rebuilds on the next Docusaurus deploy. No human coordination needed for v1 because neither Next.js frontend is deployed.
18. **Drift detection** — depends on Q3. ArgoCD-managed Docusaurus deploys get drift detection free; manual `kubectl apply` deploys do not.
19. **dbt-docs artefact source** — two ways to produce the bundle that ships into Docusaurus at `/lineage/`:
    - (a) **From CI** — Atlas CI runs `dbt docs generate --static` against the ephemeral Postgres after `dbt build`; emits a static bundle; Docusaurus build pulls it into `website/static/lineage/`.
    - (b) **From `dagster-dbt`** — the manifest produced by `dagster-dbt` at code-location load time is the canonical source; a small CI job (or a Dagster asset) runs `dbt docs generate --static` against the live manifest and publishes the bundle.
    Recommend (a) for v1 — decouples docs publishing from Dagster runtime. Revisit when `dagster-dbt` is wired if (b) becomes more attractive.
20. **dbt-docs freshness** — should the bundle update on every `atlas-data` main commit (tight coupling, every schema change rebuilds docs) or on a daily/weekly schedule (looser, possibly stale)? Probably every main commit; the build is fast.
21. **PostgREST CORS / spec exposure** — for the Scalar page at `atlas.helpers.no/api` to call PostgREST on `api-atlas.helpers.no` from the browser, PostgREST needs CORS configured to allow the `atlas.helpers.no` origin (and `atlas.localhost` for local dev). Coordinate with UIS — likely a one-line config change in their Helm values.
22. **Scalar pinning strategy** — pin a specific `@scalar/api-reference` version (reproducible, requires manual bumps) or `@latest` (always fresh, can break silently)? Default to pinned with a quarterly bump. Pinning lives in Docusaurus's `package.json` (if using the React component) or in the `<script>` `src=` attribute (if using the CDN bundle).
23. **`@dagster-io/dagster-pipes` pinning** — UIS Dagster doc notes the npm package is at `0.1.0` with slower cadence than the Python SDK. **Pin the version explicitly in `ingest/package.json`**; bump deliberately when needed.
24. **`definitions.py` import discipline** — per UIS Dagster doc, the module must stay cheap to import (no DB connections, no eager I/O at module scope) because every run pod cold-starts by importing it. Worth codifying as a CI lint or code-review rule in Atlas's Dagster PLANs.

---

## Cross-repo coordination (Atlas ↔ UIS)

The polyglot image's deploy involves both repos. The UIS Dagster doc lays out the phasing; here's how it lands on the Atlas side:

| Phase | UIS repo | Atlas repo |
|---|---|---|
| Today | nothing about Dagster | nothing about Dagster |
| UIS PLAN-001 done | Dagster deployed with empty `deployments[]`; `dagster.<uis-domain>` reachable | unchanged |
| Atlas PLAN-002 done | `deployments[]` references new Atlas image tag; `helm upgrade` applied | `@dagster-io/dagster-pipes` added; one source Pipes-enabled; polyglot image built and published; `definitions.py` cheap-to-import |
| Atlas PLAN-003 done | image tag bumped in `deployments[]`; `helm upgrade` applied | remaining 40+ sources Pipes-enabled; schedules defined in `@schedule` declarations; dbt assets wired via `dagster-dbt` |

The phasing assumes UIS PLAN-001 ships first (Dagster platform up, empty workspace). **The order is still being discussed** — see Open Question 1. Atlas can do prep work (building the polyglot image, wiring `@dagster-io/dagster-pipes` into one source, drafting `definitions.py`) before UIS PLAN-001 ships; the dependency only fires when there's an actual Dagster instance to register the code location with.

---

## Recommended v1 priority order

Independent of the cross-repo Dagster track (which runs on its own timeline), the Atlas-side work order is:

1. **Docusaurus skeleton + deploy** — landing page + nav stub, live at `atlas.helpers.no` via UIS Traefik. Gets the deploy plumbing proven (image build → GHCR → UIS K8s manifest → Traefik ingress) on the lowest-stakes content. ~1–2 days.
2. **Scalar page at `/api`** — first real Docusaurus page. Half a day. Suddenly the playground is live.
3. **dbt-docs at `/lineage/`** — CI step: `dbt docs generate --static` → unpack into `website/static/lineage/`. Half a day.
4. **Fill in Docusaurus content over time** — getting-started, concepts, forking guide. Content-writing pace, not infra.
5. **Dagster (cross-repo)** — independent track from #1–4. Can start prep in parallel.

---

## Open Questions

1. **Sequencing — Atlas-side Dagster prep first, or UIS Dagster install first?** UIS Dagster doc assumes UIS PLAN-001 ships before Atlas PLAN-002 (so there's an empty Dagster to register against). Discussion in progress with UIS contributor: can Atlas usefully build the polyglot image, wire Pipes into one source, draft `definitions.py`, and validate it locally (via `dagster dev`) before the UIS install lands? If yes, the order can flip — Atlas ships first; UIS PLAN-001 + Atlas's code-location registration ship together. Resolve before drafting PLAN-002.
2. **GitHub Actions vs self-hosted CI?** UIS philosophy is sovereign Kubernetes. A self-hosted GHA runner *inside* UIS is a reasonable middle ground. Worth asking before defaulting to GHA cloud.
3. **Does UIS already have a sealed-secrets / external-secrets pattern Atlas should follow?** Check the UIS repo before proposing one.
4. **Where do deploy manifests for Docusaurus live?** In the Atlas repo (Atlas-side), in the UIS repo (centralised), or both (Atlas-side templates referenced by UIS-side apps)? Convention varies by UIS install. For the polyglot image this is settled (UIS Helm values own the registration); for the Docusaurus deploy it's open.
5. **Should `dbt seed` re-run on every deploy or only when seed CSVs change?** Re-running is safe (idempotent) and keeps `dim_kommune` in sync if a seed gets bumped. The cost is a few seconds per deploy. Default to always-run.
6. **When does either Next.js frontend get a deploy story?** Currently both are local-dev only. Triggers worth watching: a real need to demo `/data` over the internet, a contributor who needs the diagnostics UI off their own machine, or a fork-ready audience who wants a live reference site. Revisit then.
7. **Should Atlas have its own pre-deploy migration runner pod, or rely on the operator to invoke it manually before `helm upgrade`?** The UIS Dagster doc is silent on this; tied to decision Q7 above.

---

## Cross-references

### Atlas-internal
- [`docs/stack/suggested-stack.md`](https://github.com/terchris/atlas/tree/main/docs/stack/suggested-stack.md) — high-level deployment architecture (PostgREST, Dagster).
- [`website/docs/ai-developer/project-atlas.md`](../../project-atlas.md) — command reference, marts contract, devcontainer-or-not.
- [`atlas-data/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/README.md) — `atlas-data` purpose; the `atlas-data/dagster/` slot reserved for Dagster `@asset` definitions.
- [`atlas-data/ingest/scripts/migrate.ts`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/scripts/migrate.ts) — existing migration runner; the migration-deploy PLAN wires it into either a Dagster asset (Q7a) or a one-shot pod (Q7b).
- [`atlas-frontend/README.md`](https://github.com/terchris/atlas/tree/main/atlas-frontend/README.md) — customer Next.js app; **not deployed in v1**, retained as a local-dev reference.
- [`atlas-contributor-frontend/README.md`](https://github.com/terchris/atlas/tree/main/atlas-contributor-frontend/README.md) — contributor diagnostics; local-dev only by design.
- [`website/docs/ai-developer/plans/completed/INVESTIGATE-public-api-surface.md`](../completed/INVESTIGATE-public-api-surface.md) — why PostgREST and how it's exposed (UIS-owned).
- [`website/docs/ai-developer/plans/backlog/INVESTIGATE-developer-docs-surface.md`](INVESTIGATE-developer-docs-surface.md) — narrative-docs content scope. Now served from Docusaurus root on `atlas.helpers.no`; the file needs reconciling (it still names a separate `developer-atlas.helpers.no` hostname that this plan no longer uses).
- [`website/docs/ai-developer/plans/backlog/PLAN-008-developer-discovery-surface.md`](PLAN-008-developer-discovery-surface.md) — Scalar + lineage panel inside `atlas-frontend`; v1 ship paused because `atlas-frontend` isn't deployed. Phase 3 (dbt-docs hosting) supersedes into the Docusaurus deploy described here.

### UIS-side (cross-repo)
- [UIS repo](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/) — sovereign K8s stack Atlas runs on.
- UIS PostgREST install — the deployed `api-atlas.helpers.no` / `api-atlas.localhost` instance.
- [`urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md`](https://github.com/helpers-no/urbalurba-infrastructure/tree/main/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) — UIS Dagster install (Helm chart, resource sizing, code-location pattern, manual `helm upgrade`). The authoritative source for everything about how Dagster runs in UIS; this doc defers to it.

### External
- [Scalar API Reference](https://github.com/scalar/scalar) — MIT-licensed; embedded in the Docusaurus `/api` page.
- [Dagster OSS](https://docs.dagster.io/) — orchestration platform UIS will install.
- [`@dagster-io/dagster-pipes`](https://www.npmjs.com/package/@dagster-io/dagster-pipes) — official TypeScript Pipes SDK; pinned version added to `ingest/package.json` in Atlas PLAN-002.
- [GitHub Actions services](https://docs.github.com/en/actions/using-containerized-services/about-service-containers) — ephemeral Postgres in CI.

---

## Not in scope for this investigation

- **PostgREST CI/CD** — UIS owns it.
- **Dagster platform install** — UIS owns it. Tracked in their INVESTIGATE-dagster.md.
- **Cloudflare Tunnel** — not used in v1; everything goes through standard UIS Traefik ingress. Revisit later if there's a reason to expose Atlas surfaces outside the UIS ingress.
- **Authentik / Okta / Gravitee / Azure APIM** — v1.5+; not v1.
- **Building any of this** — this is task enumeration. Implementation PLANs follow.
- **Picking a release-versioning convention** — defer to the CI-bootstrap PLANs once they're drafted (within the constraint that `atlas-data` tags must be unique).
- **Deciding whether `atlas-data/` splits into its own repo** — tracked in `atlas-data/README.md`. Polyglot-image complexity is a new pressure but not a v1 forcing function.
- **A standalone Scalar deployment** — Scalar ships as `/api` inside the Docusaurus site; no separate hostname, app, or pipeline. `developer-atlas.helpers.no` is dropped from the plan.
- **A standalone dbt-docs deployment** — dbt-docs ships as `/lineage/` inside the Docusaurus site; no separate hostname, app, or pipeline.
- **Deploying either Next.js frontend in v1** — both stay in the repo as local-dev surfaces. Re-evaluate when there's a concrete need to expose them publicly.
- **Reconciling PLAN-008 and INVESTIGATE-developer-docs-surface.md to this new picture** — tracked separately; mentioned here in cross-references for awareness.
- **The Dagster `@asset` content itself** — schedules, asset bodies, lineage wiring belong in Atlas PLAN-002 / PLAN-003 (counterparts to UIS PLAN-002 / PLAN-003 in the UIS doc), not in this deployment-pipeline investigation.
