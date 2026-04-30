# Investigate: One frontend or two? Splitting atlas-frontend into a contributor app and a customer app

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Completed (2026-04-30)

Architectural commitments here are realized in code via [PLAN-005-frontend-split-and-rebuild](PLAN-005-frontend-split-and-rebuild.md), shipped on Atlas `main` as PR [#33](https://github.com/terchris/atlas/pull/33) / [`2266f21`](https://github.com/terchris/atlas/commit/2266f21). All seven items in the [Recommended outcome](#recommended-outcome) are live: the two-app split (`atlas-frontend/` + `atlas-contributor-frontend/`), monorepo layout, the URL anchors (atlas.helpers.no consumes api-atlas.helpers.no, developer-atlas.helpers.no future-deploys Docusaurus), customer app self-contained / forkable, no shared code between the apps, the wholesale rename + greenfield rebuild, and the production-posture rule (only customer + Docusaurus reach the internet). Moved backlog/ → completed/ alongside the PLAN.

**Goal**: Establish that today's single `atlas-frontend/` splits into two top-level Next.js apps — one for **Atlas contributors** (today's code, renamed to `atlas-contributor-frontend/`; verifies ingestion worked, direct Postgres, dev/staging only) and one for **Atlas customers / external developers** (a fresh `atlas-frontend/` consuming the public PostgREST API, deploys to `atlas.helpers.no`, structured to be forkable as a reference implementation). Output is the architectural commitments + the migration sketch — not the actual implementation (a follow-on PLAN handles that).

**Last Updated**: 2026-04-30

**Origin**: PLAN-004 verified PostgREST live on 2026-04-30. Drafting PLAN-E (Next.js dogfood migration) exposed a question the parent INVESTIGATE didn't resolve: today's `atlas-frontend/` was built entirely as contributor verification work (FK integrity, raw counts, "did the ingest land what I expected") that happens to live behind public-shaped URLs. The first attempt at this INVESTIGATE framed the question as "should one app have two data-access interfaces?" — terje pushed back: the deeper question is whether these are even the same app. Two audiences, two goals, two codebases.

---

## The deployable-artifact landscape

Atlas serves three external surfaces (plus one internal):

| URL | Artifact | Audience | Data access | Status |
|---|---|---|---|---|
| `atlas.helpers.no` | `atlas-frontend/` (Next.js) | End users / data consumers — journalists, citizens, kommune workers viewing kommune statistics, NGO coverage, indicators | Consumes `api-atlas.helpers.no` over HTTP. No DB role. | Doesn't exist yet; this INVESTIGATE proposes scaffolding it fresh as a PostgREST consumer |
| `api-atlas.helpers.no` | PostgREST projecting `api_v1.*` | External developers (apps consuming the data programmatically) + the customer Next.js as a dogfood consumer | The data source itself — Postgres `api_v1.*` schema | Deployed locally as `api-atlas.localhost`; prod deploy via UIS Cloudflare Tunnel pending |
| `developer-atlas.helpers.no` | `website/` (Docusaurus) | External developers learning to use the API — read docs, copy curl examples, study the dogfood `atlas-frontend/` source | Static site — no runtime data access; embeds API examples and links | Source exists at `website/docs/`; Docusaurus build + deploy is a future plan |
| (dev/staging only, no public URL) | `atlas-contributor-frontend/` (Next.js) | Atlas contributors — ingest authors, dbt model writers verifying ingestion landed correctly | Direct Postgres on `marts.*` + `raw.*` for diagnostics | Today's `atlas-frontend/` becomes this via wholesale folder rename |

The rule that emerges from the URL story:

- **`atlas.helpers.no` MUST consume `api-atlas.helpers.no`.** That's the dogfood claim — the public site uses the same public API external developers do, no shortcuts.
- **`developer-atlas.helpers.no` documents `api-atlas.helpers.no`.** It also points readers at `atlas.helpers.no`'s source as the canonical dogfood example.
- **The contributor app never reaches the public internet.** Its job is "verify data was ingested correctly during dev" — it's a tool, not a product surface.

---

## The two audiences

### Contributors (internal)

People building Atlas: ingest module authors, dbt model writers, the operator running `npm run ingest:redcross-branches` and wanting to know it actually landed rows. Their needs:

- **Verify data**: did the ingest write what was expected? Did dbt build the dim_chapter row counts I'd expect? Are FK integrity invariants holding?
- **No PostgREST dependency**: contributors should be able to spin up their dev environment and check the data without configuring + deploying PostgREST. Direct Postgres connection is fine.
- **Simple UI**: tables, counts, raw rows, expected-vs-actual diagnostics. No public-facing polish needed.

### Customers / external developers (external)

People consuming Atlas's public data via the API to build their own things: Tilskuddsmatcher, journalists, civic-tech developers, NGOs that want to embed Atlas data. Their needs:

- **Polished public site**: kommune detail pages, indicator visualisations, the actual `atlas.helpers.no` experience.
- **Dogfood example**: by reading `atlas.helpers.no`'s code they should see how to consume the API the same way they would. No DB credentials in the frontend, only HTTP calls to PostgREST.
- **No internal noise**: FK integrity dashboards have no place here.

These are different applications with different audiences, different deploy targets, and different UI affordances. **The current `atlas-frontend/` was built entirely as contributor verification work** — every route queries Postgres directly, every page exists to confirm an ingest or dbt model produced what it should. It looks like a public site only because the URLs (`/coverage-gap/barnefattigdom`, `/kommuner/[kommune_nr]`) are public-shaped; the implementation is contributor-shaped throughout.

In other words: today's `atlas-frontend/` is what we now call `atlas-contributor-frontend/`. The customer-facing app doesn't exist yet.

---

## The decision

**Two top-level Next.js apps, one per audience:**

- **`atlas-frontend/`** — customer-facing. PostgREST only. Deploys to `atlas.helpers.no`. Self-contained / forkable.
- **`atlas-contributor-frontend/`** — contributor-facing. Direct Postgres for ingestion verification. Dev/staging only.

No hybrid-in-one-app. The audiences live on different URLs with different deploy stories and (for the customer app) a forkability constraint that doesn't apply to the rest of the monorepo. Trying to mix them in one codebase muddies all three.

The remainder of this INVESTIGATE captures the detail decisions that follow from this choice.

---

## What today's `atlas-frontend/` becomes

The whole folder is the contributor app. Concretely:

1. **Rename** `atlas-frontend/` → `atlas-contributor-frontend/` as a single git move. No per-route classification, no split. Every existing route comes along.
2. **Scaffold a fresh `atlas-frontend/`** as the customer-facing app. PostgREST consumer from day one. No DB role, no `postgres.js`. Self-contained / forkable per the constraints in [Recommended outcome](#recommended-outcome).
3. The customer-facing app starts with **zero routes** and grows as customer-shaped pages are designed. The first ones probably mirror what the contributor app already verifies — `/kommuner/[kommune_nr]`, `/coverage-gap/*`, an indicator browser — but they're rebuilt against `api_v1.*` with different UX expectations (polished, public-friendly, no diagnostic noise).

This wholesale rename is cleaner than splitting route-by-route because the existing routes weren't built with the customer audience in mind — they're contributor verification tools that happen to have public-shaped URLs.

---

## Out of scope for this INVESTIGATE

- The actual migration (folder rename + new app scaffold + first customer routes) — that's the follow-on PLAN.
- The contributor app's specific feature set beyond "verify data was ingested" — separate design conversation once the structural decision is made. Includes whether the contributor app surfaces `dbt test` output / `target/run_results.json` / dbt-osmosis docs alongside live SQL diagnostics.
- Production deploy mechanics (covered by [INVESTIGATE-deployment-pipeline.md](INVESTIGATE-deployment-pipeline.md)).
- Auth on the contributor app's staging URL (separate concern).

---

## Recommended outcome

Two top-level Next.js apps, with the constraints below:

1. **`atlas-frontend/`** — customer-facing, PostgREST only, deploys to `atlas.helpers.no`. **`atlas-contributor-frontend/`** — contributor-facing, direct Postgres, dev/staging only.
2. **Monorepo**, both apps live in this repo alongside `atlas-data/` and `website/` (Docusaurus).
3. **URL anchors** — non-negotiable shape:
   - `atlas.helpers.no` (customer Next.js) MUST consume `api-atlas.helpers.no` — no shortcuts, no DB role.
   - `api-atlas.helpers.no` (PostgREST) is the data source for both the customer Next.js and external developers building their own consumers.
   - `developer-atlas.helpers.no` (Docusaurus, future deploy) documents the API and points at `atlas.helpers.no`'s source as the canonical dogfood example.
   - Contributor app has no public URL; lives in dev/staging only.
4. **Customer app is self-contained / forkable from day one**:
   - No imports from `atlas-data/`, `website/`, or `atlas-contributor-frontend/`.
   - No shared monorepo packages — codegen from OpenAPI is the answer if duplication becomes painful, not a `packages/atlas-types/`.
   - Self-contained `package.json` and README that markets the folder as a forkable starting point.
   - Future-proofs the option of splitting `atlas-frontend/` into its own repo without a refactor.
5. **No shared code between the two apps**, even within the monorepo. The contributor app can pull in conveniences from `atlas-data/` (dbt artifact paths, ingest module shape) since it doesn't have the forkability constraint; the customer app cannot.
6. **Migration sketch**: rename current `atlas-frontend/` → `atlas-contributor-frontend/` (whole-folder move; every existing route comes along). Scaffold a fresh `atlas-frontend/` as a clean PostgREST consumer with zero routes initially. New customer-facing routes get built greenfield against `api_v1.*` as they're designed.
7. **Production posture**: only `atlas-frontend/` and `developer-atlas.helpers.no` reach the internet; `atlas-contributor-frontend/` is a dev/staging-only diagnostic surface; `api-atlas.helpers.no` is the shared data plane both public surfaces consume.
8. **What carries vs. what doesn't on the rename**: today's `atlas-frontend/` content (design tokens, shadcn/ui setup, existing routes, `postgres.js` lib) all moves with the rename to `atlas-contributor-frontend/` — no churn there. The fresh `atlas-frontend/` starts much simpler: minimal Next.js scaffold, fetch helpers, `NEXT_PUBLIC_API_URL`, no design-system inheritance. UI design for the customer app is a fresh start, not a migration.
9. **The customer app's growth couples loosely to `atlas-data/`**: the first customer-facing route may need a new `mart_*` view in `models/marts/api/` (e.g. `mart_kommune_overview` for `/kommuner/[kommune_nr]`). The auto-generator + 5 gates from PLAN-004 mean adding one is a one-line + regenerate operation, not a structural change.

The follow-on PLAN-005-frontend-split-and-rebuild covers the move, with phases:

1. **Rename**: `git mv atlas-frontend atlas-contributor-frontend`. Update references in setup.md, ingest-modules.md, package paths, etc. Verify the contributor app still runs against direct Postgres.
2. **Scaffold fresh `atlas-frontend/`**: `npm create next-app`, configure `NEXT_PUBLIC_API_URL`, write a self-contained README that markets the folder as a forkable starting point. No DB role, no `postgres.js`.
3. **Build `src/lib/api.ts`**: typed fetch helpers against `api_v1.*`. Generate types from the PostgREST OpenAPI spec or hand-write — Phase-1 decision.
4. **First customer-facing route**: pick one (likely `/kommuner/[kommune_nr]` or `/coverage-gap/barnefattigdom`); design + implement against PostgREST as the proof-of-concept. Add any missing `mart_*` views to `models/marts/api/` if needed; regenerate + apply `api_v1`.
5. **Scale out**: more routes follow as customer-facing pages are designed. Pace driven by what customer-facing pages we actually want to ship, not by mirroring the contributor app one-for-one.
6. **Document both apps in setup.md**: contributors run `atlas-contributor-frontend/`; the customer app's own README explains the dogfood/forkable role.

---

## Cross-references

- [INVESTIGATE-public-api-surface.md](../completed/INVESTIGATE-public-api-surface.md) — parent; this addresses [Q18] (PLAN-E shape).
- [INVESTIGATE-postgrest-api-v1-wrapper.md](../completed/INVESTIGATE-postgrest-api-v1-wrapper.md) — sibling; the API contract that the customer app consumes.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — implemented `api_v1.*` + auto-generator + 5 gates.
- [INVESTIGATE-deployment-pipeline.md](INVESTIGATE-deployment-pipeline.md) — production deploy mechanics; the customer-app-no-DB-role recommendation here interacts with that.
- [`atlas-frontend/`](../../../../../atlas-frontend/) — current codebase that gets split.

---

## Next steps

- [ ] User reviews + accepts the architectural commitments above.
- [ ] On acceptance, move this file `backlog/` → `active/` and draft [`PLAN-005-frontend-split-and-rebuild.md`](PLAN-005-frontend-split-and-rebuild.md) using the six-phase outline in [Recommended outcome](#recommended-outcome).
- [ ] On completion of the PLAN, move this file `active/` → `completed/`.

— signed, the Atlas implementation team (via Claude Code agent), 2026-04-30
