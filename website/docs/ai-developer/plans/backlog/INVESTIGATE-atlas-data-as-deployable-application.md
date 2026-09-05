# INVESTIGATE: Make atlas-data a self-contained application anyone can deploy on UIS

## Status: Backlog

**Question**: What has to be true for `atlas-data` to be a single deployable application — one that gathers all the data and exposes it as a queryable API — installable on a UIS instance by someone who is not us?

**Last Updated**: 2026-09-05

**Priority**: High. It is the shape the whole product is aimed at, and the pieces are closer than the repo layout suggests.

**Origin**: Terje, 2026-09-05: *"the goal is to have a deployment that can be deployed to uis as an application that gathers all the data and makes it possible to query. this so that the frontend can consume the data. the frontend is an example that anyone can use as inspiration to create their own frontend and reporting."*

---

## The goal, stated so it can be tested

Someone with a UIS instance and no connection to this project should be able to install
**one thing** and end up with Norwegian public data, refreshed on a cadence, queryable over
HTTP. The Atlas frontend is then **a** consumer of that API — a reference implementation to fork
or ignore — not a required part of the installation.

That gives a concrete acceptance test for the whole investigation:

> A person who has never seen this repository installs the application on a fresh UIS instance,
> waits for the first refresh, and gets rows back from an HTTP query. Nothing in the process
> requires reading our source, asking us a question, or running a command we wrote by hand.

Everything below is scoped by whether it moves that sentence closer to true.

## What already exists — more than the repo layout suggests

⚠️ **`atlas-data` is already a container deployed on UIS.** Anyone reasoning from the folder
structure will assume otherwise and plan work that is already done.

| piece | state |
|---|---|
| Container image | ✅ `atlas-data/deploy/Dockerfile`, polyglot — TypeScript ingest + Python dbt/Dagster |
| Build and publish | ✅ `.github/workflows/atlas-data-image.yml` → GHCR, date+SHA tags, never `:latest` |
| Runs on UIS | ✅ as a Dagster **code location** — the documented tenant contract |
| Deployed today | ✅ `ghcr.io/terchris/atlas-data:v20260905-d7f884d`, on two clusters |
| Ingest cadence | ✅ declarative, on the assets (`cadence.py`: weekly Sunday 02:00, monthly, scraper) |
| Query **schema** | ✅ owned here — `dbt/scripts/generate_api_v1.py`, `api_v1_generated.sql`, `dagster/…/assets/api_v1.py` |
| Freshness signal | ✅ `raw_sources_were_refreshed_recently`, proven on-cluster 2026-09-05 |

## What is missing — and it is not the container

| piece | state | who owns it today |
|---|---|---|
| **Installer** that registers the tenant | ❌ absent | done by hand, ops-side |
| Code-location declaration | ❌ not in this repo | `.uis.extend/dagster-code-locations.yaml`, cluster-side |
| Database + schema provisioning | ❌ undefined | by hand |
| Secret creation (`env_secrets`) | ❌ undefined | by hand |
| **PostgREST exposure** of `api_v1` | ❌ not declared here | a separate UIS service, deployed by ops |
| Separate git repo | ❌ still a monorepo folder | — |

`atlas-data/README.md` promised `deploy/` would hold "Dockerfile + Dagster code-location manifest
+ ArgoCD app". **Only the Dockerfile exists.** That gap is the actual distance between "we can
deploy it" and "anyone can deploy it", and it is larger than the repo split.

Note the split-trigger conditions in that README have **all three already fired**: real source
code landed, Dagster is deployed pointing at a real image, and other agents now contribute to the
data side. The split is overdue on our own stated criteria.

## 🔴 The blocker nobody wrote down

`atlas-data/README.md` claims imports do not cross the boundary except through the database.
That is true of **runtime** code — the frontends have no package-level dependency on
`atlas-data`, which is a genuinely clean boundary and worth preserving.

**The website build crosses it**, measured 2026-09-05:

```
website/scripts/generate-sources-registry.mjs  → atlas-data/ingest/src/sources/  (prebuild, EVERY build)
website/scripts/snapshot-lineage.mjs           → ../atlas-data/dbt, ../atlas-data/ingest/.env
```

Plus **1,221 `atlas-data/` path references across 141 files** in `website/docs/`.

So a naive `git subtree split` leaves the documentation site unable to build. The `prebuild` step
that emits "41 sources, 7 categories" reads the ingest source tree directly from disk.

### Three options, costed

| # | Option | What it costs | What it buys |
|---|---|---|---|
| 1 | **Commit the generated registry**; `atlas-data` CI regenerates it and opens a PR to the website repo | A cross-repo sync step, and a window where the committed registry is stale. Simplest to build. | Docs build becomes independent immediately. No runtime contract to version. |
| 2 | **`atlas-data` publishes the registry as a release artifact**; the website fetches it at build time | Needs artifact versioning, an offline/air-gapped fallback, and a build that fails honestly when the fetch fails rather than silently using a stale copy. | Matches the pattern the product already commits to — the contract is published output, not a filesystem path. Any third party building their own docs gets the same artifact. |
| 3 | **Keep the website inside the data repo** | Splits the wrong seam: docs about the whole product would live in the data application, and a third-party installer inherits our documentation site. | Avoids the problem entirely. Cheapest today, wrong shape tomorrow. |

**Leaning option 2**, for a reason specific to the stated goal rather than to elegance: the goal
says a stranger should be able to consume this. Option 1 works only for people who can open a PR
against our website repo, and option 3 hands them our docs site. Option 2 is the only one where
the boundary a third party meets is the same boundary we use ourselves — the dogfood argument
that already governs `atlas-frontend`.

⚠️ Not a decision. Option 2 is also the only one with a failure mode that can go quiet — a
fetched artifact that silently falls back to a stale copy is the same disease as the freshness
gap. If it is chosen, the fetch must fail the build loudly.

## First step, decided 2026-09-05 — verify the platform's own PostgREST before designing around it

Terje: *"it uses postgrest. that means we probably should test and make sure that atlas can use
the existing UIS installation of postgrest. Maybe the first step should be to verify that atlas
can use the UIS install of postgrest."*

That is the cheap question, and it collapses a large part of this investigation either way:

- **If Atlas can use the shipped PostgREST**, then the application stays a Dagster tenant that
  produces a schema, the platform exposes it, and questions 1 and 5 below shrink to documenting
  prerequisites rather than building an installer that declares its own query surface.
- **If it cannot**, we need the reason before designing around it, because the reason will
  constrain the design.

It has worked once already — ops deployed PostgREST against `api_v1` on asgard in Phase 1.3b and
it served real rows — so this is a re-verification on the current test target rather than a first
attempt. If it turns out not to be mechanical, that is itself the finding.

**Dispatched 2026-09-05**: `urb-agents` **#125** to tor-agent (create the service against `api_v1`
on imac's cluster, and answer whether UIS expects tenants to use the shipped PostgREST or bring
their own) and **#126** to imac (validate the endpoint, queued behind #125).

⚠️ **Empty views are expected and are a pass.** 24 sources on that instance are genuinely stale
and three have never loaded; the weekly ingest condition fires Sunday 02:00. A well-formed empty
result proves the path Postgres → view → PostgREST → HTTP. The criterion that matters most is
that the role is **read-only**, tried rather than inferred — `api_v1` is a published contract and
a writable one is a security problem, not a bug.

## ✅ Resolved 2026-09-05 — the platform expects tenants to use its PostgREST

tor-agent, who owns UIS, answered this from the source rather than from memory (`urb-agents` #125):

- `service-postgrest.sh` declares `SCRIPT_MULTI_INSTANCE="true"`.
- `configure-postgrest.sh` states that PostgREST is multi-instance and **each consuming application
  gets its own Deployment** in the shared namespace.
- The service page's worked example **is Atlas, by name** — `./uis configure postgrest --app atlas`.

**So an application that declares its own PostgREST is fighting the platform.** Question 5 below
answers *no*: Atlas stays a Dagster code location that produces a schema, and the platform exposes
it. Question 1 shrinks with it — the unit of installation is **not** a bundle of three UIS objects,
and the right output is **documented prerequisites, not an installer** for the query surface.

That deletes a branch of this investigation rather than adding one.

⚠️ **A precise boundary, which corrects an earlier framing in this document.** "UIS expects tenants
to be Dagster code locations only" was already false — PostgREST is a second supported tenant
surface. But that does not generalise to *any service can be declared per tenant*. Two surfaces
exist today; a third would be new platform work, not configuration.

### Known property: the two tenant surfaces are declared differently

| surface | how a tenant declares it |
|---|---|
| Dagster code location | **declarative** — `.uis.extend/dagster-code-locations.yaml`, a file the platform reads |
| PostgREST exposure | **imperative** — a `configure` command that creates roles and a secret, then `deploy` |

There is no `.uis.extend` entry for PostgREST. tor-agent recorded this as a genuine inconsistency in
the tenant-facing surface and deliberately did not change it unattended. **It does not block anything
here**, because the installer left this design with the answer above. Noted so the next person meets
it as a known property rather than a surprise.

### Also settled: the platform's verify does not need our data

`088-test-postgrest.yml` creates its **own** probe table and row in the app's schema, reads it back
over HTTP, and removes it in an `always` block. So a PostgREST pass is independent of whether
`api_v1` has materialised anything — the empty-views caveat this document carried was defending
against a problem the tooling had already solved.

⚠️ That verify **writes into the exposed schema**. Harmless, cleaned up, and exactly why the
`always` block exists — but worth knowing before it runs against a published surface.

### The limit on "tor-agent creates"

**Neither atlas nor tor-agent has a cluster.** tor-agent can produce configuration, procedure and
platform support; it cannot produce a running instance. For anything that only exists once it is
running, a third party with cluster access has to execute it. That is a property of the current
fleet, not of this design, and any plan here that assumes otherwise is wrong.

## ✅ Confirmed on the cluster 2026-09-05 — and it was already running

The tester checked whether the prerequisite existed before anyone built it. It had been running for
**eleven days**:

```
deployment.apps/atlas-postgrest   2/2 Running   11d
labels: app.kubernetes.io/managed-by=uis, name=postgrest, instance=atlas
PGRST_DB_SCHEMAS   = api_v1
PGRST_DB_ANON_ROLE = atlas_web_anon
```

`managed-by=uis` — the platform's own PostgREST, instanced for Atlas. So the design question is
settled by documentation *and* by a running instance: **Atlas uses the shipped PostgREST, and
already does.** `GET /` returns HTTP 200 with swagger and advertises all 13 `api_v1` views, matching
the 13 in the database.

`./uis verify postgrest --app atlas` exits 0 — app can write, API serves it, **API refuses writes**.

### The published surface is genuinely read-only, proven by attempt

Not inferred from grants. All three write methods issued against a live view:

```
DELETE / PATCH / POST  ->  HTTP 401
body: {"code":"42501","message":"permission denied for view indicator_summary"}
```

`42501` is **Postgres** refusing, not PostgREST declining to try — the strongest form the answer can
take. The tester used filters matching nothing on DELETE and PATCH so no data could be lost even had
the write been permitted, then confirmed the insert did not land. `atlas_web_anon` holds SELECT only
on all 13 views.

### ⚠️ Atlas defect: the OpenAPI document advertises writes that do not exist

The generated spec lists `post` and `delete` on **every** view. That is PostgREST describing the
relation, not stating permission — but the effect is that **our published contract tells a reader the
API is writable when it is not.**

This matters more for Atlas than for a typical tenant, because the entire point of this surface is
that strangers consume it without asking us. Someone building against the spec writes code that 401s
at runtime and reasonably concludes our API is broken rather than our documentation wrong.

Owned here, not by the platform. The fix belongs with
[INVESTIGATE-developer-docs-surface](INVESTIGATE-developer-docs-surface.md).

### 🔴 There is no external exposure, and that blocks the stated goal

```
atlas-postgrest.postgrest.svc.cluster.local:3000   type: ClusterIP
ingress matching postgrest/atlas: none
```

**Cluster-internal only.** Distinct from the DNS finding — even with working DNS there is no ingress
for this service. Together they mean there is currently nothing outside the cluster for a frontend to
point at.

That collides with the goal this investigation exists to serve: *the frontend is an example anyone can
use as inspiration to create their own*. A reference implementation that only runs inside the cluster
it reads from is not forkable by a stranger.

**Exposing it is a human decision** — public exposure of a published contract, per this repo's
contracts and fleet rule 7. Raised with Terje 2026-09-05; not an agent's call and not blocked on
design work here.

### Correction to a detail

The database on that cluster is **`atlas`**, not `atlas_db`. `atlas_db` is the local convention in
`ingest/.env` and the dbt profile. Deployed truth differs from local convention; do not hardcode
either.

## Questions to resolve

1. **What is the unit of installation?** A Dagster code location plus a PostgREST instance plus a
   database is three UIS objects. Does the application declare all three, or does it stay a
   Dagster tenant and document the rest as prerequisites? The goal sentence implies the former.
2. **Who provisions the database and the role?** Today: by hand. A stranger has no hand to use.
3. **What does the installer look like?** The UIS Dagster page says an application's own installer
   writes its `.uis.extend` entry and creates its secrets. We have no installer. Is it a script in
   `deploy/`, a Helm chart, or an ArgoCD application?
4. **How does a third party point it at their own database and registry?** Every value we hardcode
   is a value they cannot change.
5. **Does `api_v1` stay the contract?** It is generated here and exposed by a UIS service deployed
   elsewhere. If the application is to be self-contained, that exposure has to be declared by it.
6. **What is the minimum viable install?** Probably not 41 sources. A stranger evaluating this
   wants a small subset that works in minutes.
7. **Does the repo split come first, or last?** It may be easier to build the installer inside the
   monorepo and split once it works — the split is the reversible-looking step that is hardest to
   reverse.
8. **What happens to `atlas-private-data-repo`?** `frr` reads a private tree that is absent on any
   public deployment. A stranger's install must not fail because of a source they cannot have.

## What would make this investigation wrong

- ~~If UIS expects tenants to be Dagster code locations **only**…~~ **Answered 2026-09-05, and the
  framing was wrong**: PostgREST is a second supported tenant surface, so it was never
  Dagster-only. But declaring your own PostgREST *does* fight the platform, so questions 1 and 5 do
  collapse into "document the prerequisites". See the resolved section above.
- If the frontend is not in fact forkable without our repo, the reference-implementation goal
  needs its own investigation first. Current evidence says it is: no package-level dependency on
  `atlas-data`, and it reads only the public API with no database role.

## Related

- [INVESTIGATE-deployment-pipeline](INVESTIGATE-deployment-pipeline.md) — ⚠️ premise partly
  overtaken; the deployment shipped. Re-read before opening.
- [INVESTIGATE-private-atlas-deployments](INVESTIGATE-private-atlas-deployments.md) — per-tenant
  private deployments. This investigation is its public counterpart and may absorb some of it.
- [INVESTIGATE-developer-docs-surface](INVESTIGATE-developer-docs-surface.md) — what a third-party
  consumer reads once they have an install.
- `atlas-data/README.md` — the split-trigger conditions, all three now fired.
