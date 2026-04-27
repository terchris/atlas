# Investigate: Deployment pipeline

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide how Atlas's two deployable artefacts — the Next.js frontend and the `atlas-data` container image (TypeScript ingest + dbt + Dagster user-code) — go from a developer's commit to running on UIS, including: CI test gates, image build + registry, GitOps wiring to ArgoCD, secrets, database migrations, rollback, and which environments exist (just prod, or also dev/staging/PR previews).

**Last Updated**: 2026-04-23

**Origin**: Atlas is pre-production — every change today goes to local dev. As we accumulate real `marts.*` tables (after PLAN-foundation-reference-tables) and start ingesting NGO supply data (INVESTIGATE-ngo-supply-data-model PLAN-A onward), we need a real path from commit → running system. The high-level deploy architecture is already settled in [`docs/stack/suggested-stack.md`](../../../stack/suggested-stack.md): ArgoCD watches the `atlas-data` image tag, reloads Dagster's code location; Next.js deploys via ArgoCD too; observability via UIS. **What's missing is the CI side and the release flow.** This investigation enumerates what to build and what to decide.

---

## Status update (2026-04-27): Dagster moved to v2

Per the 2026-04-27 update to [`docs/stack/suggested-stack.md`](../../../stack/suggested-stack.md), **Dagster is no longer in v1** — it's a v2 / Future component. v1 ingestion runs as **CLI npm scripts under cron** (likely a Kubernetes CronJob) — no orchestrator UI, no Dagster Pipes, no code-location reload. v1 design is structured so Dagster can be inserted later cleanly (pod-spawnable scripts).

A new v1 component appeared in the same update: **PostgREST** (auto-API on `marts.*`, deployed via ArgoCD as its own service). See [`INVESTIGATE-public-api-surface.md`](INVESTIGATE-public-api-surface.md) for the API plan.

**What this changes about this investigation:**

- **Most of the Dagster-specific deployment questions defer to v2.** Image-driven Dagster code location, ArgoCD watching image tag for code-reload, Dagster sensors firing migrations — all still valid for when Dagster lands, but not v1 work.
- **v1 deployment surface is simpler than this plan assumes.** Three artefacts to deploy: Next.js frontend (K8s app), PostgREST (K8s app), atlas-data image used as a CronJob runner (the same image that will become Dagster's user-code image in v2 — built once, used in both modes).
- **CI test gates and DB migrations are still needed in v1.** The "test gates" section, "image build + push", and "DB migration job" sections of this plan remain relevant. The "Dagster sensor / ArgoCD pre-sync hook" question for migrations gets a simpler answer in v1: a Kubernetes Job triggered manually or via ArgoCD pre-sync hook.
- **The phasing changes.** Originally PLAN-A through PLAN-F all assumed Dagster as the orchestrator. With Dagster deferred, v1 PLANs split into two waves: **(1) v1 deployment** — Next.js + PostgREST + cron-driven ingest, GHA CI, ArgoCD wiring (no Dagster). **(2) v2 Dagster cutover** — once Dagster is installed in UIS, migrate the cron-driven ingest to Dagster Pipes; the existing image just needs Dagster user-code added.

The body of this plan below describes the v2 end-state. Use it as the target architecture; the v1 path is a subset (drop Dagster, add PostgREST as a separate K8s app).

---

## What's already settled (don't re-litigate)

From [`suggested-stack.md`](../../../stack/suggested-stack.md):

- **Orchestration**: Dagster (OSS, installed in UIS via Helm — [INVESTIGATE-dagster.md](../../../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) tracks the install).
- **GitOps**: ArgoCD (already in UIS).
- **Image-driven Dagster code location**: ArgoCD watches the `atlas-data` image tag; on push, Dagster's user-code deployment reloads.
- **Single image for the data side**: TypeScript ingest + dbt + Dagster user-code ship as one Docker image.
- **Next.js deploys as a K8s app via ArgoCD** with Cloudflare Tunnel exposing `atlas.helpers.no`.
- **Observability**: Loki / Prometheus / Grafana, all in UIS.
- **Postgres**: shared UIS instance; Atlas owns `raw.*` and `marts.*`.
- **Internal admin UI access**: Tailscale (day 1) → Authentik OIDC (later).

From this conversation:
- **dbt invocation pattern**: `uv run --env-file ../ingest/.env dbt <cmd>` — locally and in production (the same uv-pinned env ships in the atlas-data image).
- **`dbt build` is the test gate**: any pipeline change must end with a clean `dbt build`. Per [`project-atlas.md`](../../project-atlas.md#always-run-dbt-test-after-pipeline-changes).

---

## What's missing — the CI + release questions

### Components and what each needs

| Artefact | Build | Test | Package | Deploy |
|---|---|---|---|---|
| Next.js frontend | `npm run build` | `npm run typecheck`; future Playwright/Vitest | Docker image | K8s deployment via ArgoCD |
| `atlas-data` image | `npm run typecheck` (ingest) + `dbt parse` + `uv pip install` | dbt test (against ephemeral Postgres in CI) | Single Docker image (Python 3.12 + Node 20 + dbt + ingest + dagster user-code) | Dagster code-location reload via ArgoCD watching image tag |
| dbt seeds | n/a (CSVs in repo) | dbt seed + dbt test | Bundled in atlas-data image | Run by Dagster as a scheduled asset |
| `raw.*` migrations | n/a (SQL files) | Apply to ephemeral Postgres in CI | Bundled in atlas-data image | Run by `npm run migrate` from a one-shot job (Dagster sensor? ArgoCD pre-sync hook?) |

### Decisions to make

1. **CI host** — GitHub Actions, GitLab CI, Jenkins, or self-hosted runner inside UIS? Atlas's repo is on GitHub (terchris/atlas). GHA is the obvious default; self-hosted-on-UIS is more sovereign-stack-aligned but adds operational surface.
2. **Image registry** — GHCR (free for public/open repos, lives next to the source), Docker Hub (rate-limited), or a UIS-hosted registry (Harbor inside UIS)? Trade-off: GHCR is zero-friction; UIS-hosted is more sovereign.
3. **Branch / release strategy** — trunk-based (every main commit deploys) or release branches / tags? Atlas is small and single-developer right now; trunk-based is simplest. Once a second developer joins, revisit.
4. **Environments** — just prod, or dev + prod, or dev + staging + prod, or PR-preview environments? Pre-production status argues for *just prod* now; preview environments add real value when external reviewers join.
5. **Secrets management** — sealed-secrets, external-secrets-operator, ArgoCD's vault plugin, or 1Password Connect? UIS likely already has a pattern; check before inventing.
6. **Database migrations** — when and how does `npm run migrate` run? Options: (a) Dagster job that runs before any ingest asset, with idempotent migrations; (b) ArgoCD pre-sync Job that runs migrations against the live DB; (c) manual `kubectl exec` into a one-shot pod. Pre-prod can do (c); production needs (a) or (b).
7. **Test gates in CI** — minimum bar: `tsc --noEmit` (frontend + ingest), dbt parse + dbt seed/test against an ephemeral Postgres. Stretch: Playwright e2e, accessibility checks, link checking on `docs/`.
8. **Ephemeral Postgres in CI** — service container in GHA (or sidecar container in self-hosted) running the same Postgres major version as UIS. dbt build against it; rollback.
9. **Image build cache** — atlas-data layers (Python venv with dbt + Node deps + uv) are slow to build cold. BuildKit cache to GHCR or buildx layer cache to local runner?
10. **Image tagging** — semantic versioning (`v1.2.3`), commit SHA (`sha-abc1234`), branch (`main-latest`), or all three? ArgoCD's image-watcher policy depends on this.
11. **Rollback** — ArgoCD app sync to previous git revision rolls back the deployment. dbt model rollback is harder (data already transformed); convention should be: never destructive `dbt run --full-refresh` from CI; only manual + reviewed.
12. **PR validation jobs** — what runs on PR (faster, advisory) vs. main (slower, blocking)? PR: typecheck + dbt parse. Main: full dbt build + image push + deploy.
13. **Frontend testing** — Atlas has `npm run typecheck` but no test runner configured. Worth adding Vitest + Playwright now or wait until UI matures?
14. **Next.js production build target** — Vercel-style serverless, or a Node server in K8s? Atlas's [`project-atlas.md`](../../project-atlas.md) says K8s; the build needs `output: 'standalone'` in next.config.ts and a small Dockerfile.
15. **Secrets needed at build time** — none expected (Atlas reads `DATABASE_URL` at runtime). Confirm.
16. **Secrets needed at runtime** — `DATABASE_URL` (read-only role for Next.js, owner role for dbt/ingest pods), Brreg API key (none — open data), FHI API key (none), SSB API key (none). Future: Authentik OIDC client secrets, Cloudflare API for tunnel rotation.
17. **The atlas-data split** — when atlas-data eventually splits into its own repo (per [`atlas-data/README.md`](../../../../atlas-data/README.md) trigger conditions), does each repo get its own pipeline or one combined? Likely separate; plan accordingly.
18. **Dagster code-location update mechanism** — does ArgoCD trigger a Dagster GraphQL `reloadRepositoryLocation` mutation, or does Dagster pull the image on a schedule? Affects how fast a deploy goes live.
19. **Schema-change coordination** — when a `marts.*` schema change ships, the Next.js frontend may break until it's redeployed too. How is this coordinated? Manual "data pipeline first, then frontend" sequence, or atomic deploy via a release tag covering both? See [`project-atlas.md`](../../project-atlas.md#the-marts-contract).
20. **Drift detection** — should the deployed manifests be regularly diffed against git? ArgoCD has this built in. Just confirm it's enabled.

---

## Likely shape of the eventual PLANs

Probably 3–4 ordered PLANs, depending on what UIS resolves first:

- **PLAN-A — CI bootstrap (frontend)**: GHA workflow that runs typecheck + Next.js build on every PR and main commit. No deploy yet. Fast to land; gives immediate value (broken-PR signal). Doesn't require UIS-side decisions.

- **PLAN-B — CI bootstrap (atlas-data)**: GHA workflow that runs typecheck + dbt parse + dbt build against an ephemeral Postgres service container on every PR and main commit. No image push yet.

- **PLAN-C — atlas-data image build + push**: Dockerfile (Python 3.12 + Node 20 + uv + dbt + Node deps + repo source). GHA pushes to GHCR on main commits, tagged with semver + commit SHA. Requires Dagster install in UIS to be useful (otherwise the image just sits there).

- **PLAN-D — ArgoCD wiring**: depends on Dagster being installed. ArgoCD app + image-updater config; the manifests probably live in a UIS-side repo (per UIS's GitOps convention). Possibly UIS-side work, not Atlas-side.

- **PLAN-E — Next.js Dockerfile + deploy**: parallel to PLAN-C. `output: 'standalone'` in next.config.ts; small Dockerfile; ArgoCD app for the deployment.

- **PLAN-F — DB migration job**: how `npm run migrate` runs in production. Likely a Dagster asset that runs before any ingest asset, with the migration runner already present in `atlas-data/ingest/scripts/migrate.ts`.

- **PLAN-G — Secrets + monitoring + rollback runbook**: the operational glue. Probably the last to write because it depends on what the prior plans land.

A–B can land independently of UIS work. C–F wait on UIS Dagster install.

---

## Open Questions

1. **Is GitHub Actions appropriate, or is there a sovereign-stack preference for self-hosted CI?** UIS philosophy is "sovereign Kubernetes platform". A self-hosted GHA runner in UIS is a reasonable middle ground.
2. **Does UIS already have a sealed-secrets / external-secrets pattern Atlas should follow?** Check the UIS repo before proposing one.
3. **Where do ArgoCD application manifests for Atlas live?** In this repo (Atlas-side), in the UIS repo (centralised), or both (Atlas-side templates referenced by UIS-side ArgoCD apps)?
4. **Single image or two for atlas-data?** Currently planned as one (Python+Node+dbt). Splitting (one for ingest, one for dbt) gives cleaner failure modes but doubles the registry footprint. Probably one image; revisit if cold-start latency hurts.
5. **What's the ArgoCD image-updater pattern in UIS?** Some installs use it, others use direct manifest commits via CI. Affects whether the GHA workflow needs to commit a manifest after image push.
6. **Should `dbt seed` re-run on every deploy or only when seed CSVs change?** Re-running is safe (idempotent for our seeds) and keeps dim_kommune in sync if we ever forget. The cost is a few seconds per deploy.

---

## Cross-references

### Atlas-internal
- [`docs/stack/suggested-stack.md`](../../../stack/suggested-stack.md) — the high-level deployment architecture (ArgoCD, Dagster, image-driven code location).
- [`docs/ai-developer/project-atlas.md`](../../project-atlas.md) — devcontainer-or-not, command reference, the marts contract that constrains schema-change coordination.
- [`atlas-data/README.md`](../../../../atlas-data/README.md) — the split-trigger conditions for splitting atlas-data into its own repo.
- [`atlas-data/ingest/scripts/migrate.ts`](../../../../atlas-data/ingest/scripts/migrate.ts) — the existing migration runner that PLAN-F would wire into Dagster.
- [`docs/research/data-sources.md`](../../../research/data-sources.md) — confirms which upstream sources need API keys (none for current 19; check before adding new).

### UIS-side (cross-repo)
- [UIS repo](../../../../../urbalurba-infrastructure/) — the sovereign K8s stack Atlas runs on.
- [`urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md`](../../../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/INVESTIGATE-dagster.md) — Dagster install plan; blocks Atlas's image-deploy story.

### External
- [ArgoCD docs](https://argo-cd.readthedocs.io/) — for the GitOps mechanics.
- [Dagster code locations](https://docs.dagster.io/concepts/code-locations) — for how user-code reloads work.
- [GitHub Actions services](https://docs.github.com/en/actions/using-containerized-services/about-service-containers) — for ephemeral Postgres in CI.

---

## Not in scope for this investigation

- Building any of it. This is a **task enumeration** — the implementing PLANs follow when we're ready.
- Picking a release-versioning convention (defer to PLAN-A/B).
- UIS-side work (Dagster install, ArgoCD app config). Owned by the UIS repo.
- Deciding whether `atlas-data/` splits into its own repo. Tracked separately in `atlas-data/README.md`.
- Authentik / OIDC integration for Dagster UI. Day 2 work; Tailscale fronts it for now.
