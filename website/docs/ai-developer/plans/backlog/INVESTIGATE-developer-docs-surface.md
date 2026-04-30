# Investigate: Developer docs surface — what `developer-atlas.helpers.no` actually serves

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide the structure, content scope, and tooling for `website/docs/developers/` — the docs surface for **external developers consuming Atlas's PostgREST API** to build their own apps (frontends, CLIs, agent integrations, mobile apps, scripts). Output is a content outline + tooling decisions (especially: how the API reference is rendered) + a versioning/deprecation policy. Not the actual content writing — that follows in a PLAN once decisions are settled.

**Last Updated**: 2026-04-30

**Origin**: PLAN-005 splits `atlas-frontend/` into a contributor app and a customer app. The customer app's README is positioned as a "fork-me reference implementation" for external developers. But there's nowhere on Atlas's docs site for those external developers to *land*. They have no quickstart, no API reference, no versioning policy, no agent-integration examples. The contributors and AI-developer audiences each have their own `website/docs/<audience>/` section; external API consumers don't.

This INVESTIGATE settles the questions that block writing real content.

---

## Audience

The audience is **anyone consuming `api-atlas.helpers.no` programmatically to build their own thing**:

- **Frontend developers** — fork `atlas-frontend/` or build a new SPA / SSR app against the API
- **Backend / script developers** — Python, Go, Node CLIs that pull data, ETL pipelines that mirror Atlas data into their own stores
- **Agent / LLM integrators** — wire `api-atlas.helpers.no` into an MCP server, an LLM tool definition, an agent's retrieval layer
- **Mobile developers** — native apps (iOS/Android) that fetch from the API
- **Researchers / journalists with technical skills** — Jupyter notebooks pulling kommune data for analysis

They share the entry point (the API) but have different rendering needs (a CLI dev wants `curl` examples; a frontend dev wants TypeScript types; an agent integrator wants the OpenAPI spec). The docs surface should serve all of them without privileging one.

Out of audience for this INVESTIGATE: end-users browsing `atlas.helpers.no` (their docs are the customer app itself), Atlas contributors (covered by `website/docs/contributors/`), AI agents working *on* Atlas (covered by `website/docs/ai-developer/`).

---

## The decision

**One new docs section: `website/docs/developers/`**, served by the same Docusaurus deploy that becomes `developer-atlas.helpers.no`. Sibling of `contributors/` and `ai-developer/` under the existing `website/docs/` root.

The remainder of this INVESTIGATE captures what goes in that section and how it's tooled.

---

## Decisions to resolve

### [Q1] Section name — `developers/` or `api/`?

- **`developers/`** — audience-named, matches the existing `contributors/` and `ai-developer/` convention. Broader: covers all consumer types, not just API reference.
- **`api/`** — content-named, scoped to the API itself.
- **Recommendation**: **`developers/`** — matches the audience-naming pattern (contributors are people, ai-developers are people, developers are people). The API reference is one section *inside* `developers/`, not the umbrella term.

### [Q2] How is the API reference rendered?

PostgREST auto-generates a Swagger 2.0 spec at `api-atlas.helpers.no/`. That spec is the source of truth for endpoint shapes and column descriptions. Rendering options:

- **(a) Embed Swagger UI** in a Docusaurus page, pointed at `api-atlas.helpers.no/`. Live spec; no build-time generation; always reflects current schema.
- **(b) Embed Redoc** (alternative spec renderer; cleaner UX for read-heavy reference). Same live-spec source.
- **(c) Build-time generate** static markdown from the spec (e.g. via `swagger-markdown` or similar) and check it in. Stale-on-deploy but works without runtime fetch.
- **(d) Hand-write** the API reference. Manual sync after every schema change; defeats the dbt → schema.yml → spec → docs propagation chain.
- **Recommendation**: **(a) Swagger UI embedded in a Docusaurus page**. Live spec means descriptions written in `schema.yml` show up in docs immediately after a deploy without any rebuild. Redoc (b) is a fine alternative if Swagger UI's UX feels dated; either way the source is the same. Hand-written (d) is wrong on every axis.

### [Q3] What pages does `developers/` actually contain?

Proposed initial structure (a content outline; iteration expected):

| Page | Purpose |
|---|---|
| `index.md` | Landing — who this section is for, the three things you can do (read API reference, fork the customer app, integrate as an agent) |
| `getting-started.md` | First `curl http://api-atlas.helpers.no/indicator_summary` walkthrough; shows real output; explains anonymous-read posture |
| `api-reference.md` | Embedded Swagger UI (per [Q2]) showing all `api_v1.*` endpoints |
| `concepts.md` | Canonical conventions: `kommune_nr` (4-digit zero-padded), `fylke_nr`, `orgnr`, etc. — same content [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md) covers for contributors, but framed for consumers |
| `forking-the-customer-app.md` | Atlas's `atlas-frontend/` is the canonical reference Next.js consumer; here's how to fork it, set `NEXT_PUBLIC_API_URL`, deploy your own |
| `agent-integration.md` | How to wire the API into an LLM agent or MCP server — example tool definitions, prompt patterns. Probably stub initially; grows when a real agent integration ships |
| `versioning.md` | The `api_v1` ↔ `api_v2` deprecation policy (resolved in [Q4]) |

- **Recommendation**: ship `index`, `getting-started`, `api-reference`, `concepts`, `forking` in a first PLAN. `agent-integration` and `versioning` follow when content actually exists / policy is settled.

### [Q4] Versioning + deprecation policy

External consumers care: when does `api_v1` change in a breaking way? When does `api_v2` ship? How long do clients have to migrate?

Three sub-decisions:

- **[Q4a] What counts as a breaking change to `api_v1`?**
  - Removing a column → breaking
  - Renaming a column → breaking
  - Changing a column's type (e.g. `text` → `numeric`) → breaking
  - Tightening NULL constraints → breaking
  - Adding a column → **not** breaking (consumers ignore extra fields)
  - Adding a new endpoint → **not** breaking
  - Changing a description text → **not** breaking
- **[Q4b] What's the rule when a breaking change is needed?**
  - Option A: never break `api_v1`; ship `api_v2` as a parallel schema; deprecate `api_v1` on a calendar (e.g. 6 months notice)
  - Option B: allow breaking changes to `api_v1` with a major-version bump in the response payload (`api_v1` becomes "current major; minor bumps are non-breaking")
  - **Recommendation**: **Option A**. PostgREST's wrapper-views model makes parallel `api_v1` + `api_v2` cheap (extend `models/marts/api/v2/`, regenerate). Calendar-based deprecation is the standard external-consumer expectation.
- **[Q4c] How are breaking changes communicated?**
  - Changelog page in `website/docs/developers/changelog.md`
  - Email to keyed users (later, once auth lands; not v1)
  - Banner on `developer-atlas.helpers.no` (cheap; ship with [Q4b] policy page)
  - **Recommendation**: changelog page + banner, both shipping with the versioning page in the first content PLAN.

### [Q5] Cross-linking with `atlas-frontend/`'s own README

The customer app's README markets the folder as forkable. The developer docs at `developer-atlas.helpers.no/forking` say the same thing in more detail. Two source-of-truth options:

- **(a)** The README is the source of truth; the docs page links to it (or embeds it via `import`).
- **(b)** The docs page is the source of truth; the README is a one-paragraph teaser pointing at the docs.
- **(c)** Both exist and stay synchronised manually.
- **Recommendation**: **(b)** — the docs page is the source of truth. The README is a one-paragraph teaser ("forkable reference; see developer-atlas.helpers.no/forking for the full guide"). External developers who clone the repo for code reasons see the teaser; external developers who land via Google or Atlas's site see the docs. Two surfaces, one canonical home.

### [Q6] What about the existing user-facing content under `website/docs/` (concepts/, sources/, measurements/, etc.)?

Today `website/docs/` already has user-facing content (`about/`, `concepts/`, `getting-started/`, `measurements/`, `sector/`, `sources/`). That content is for end-users, not external developers per se — but there's overlap (a developer wants to know what `kommune_nr` means; an end-user wants to know what indicators exist).

- **(a)** Move overlapping content into `developers/` (e.g. `concepts/` → `developers/concepts.md`).
- **(b)** Keep both surfaces; cross-link generously; accept duplication of canonical concepts.
- **(c)** Make `developers/` link out to the user-facing pages where overlap exists rather than duplicating.
- **Recommendation**: **(c)** — the developer section frames concepts in API-consumer terms (column names, types, query shapes), and links to the user-facing content (`concepts/`, `sources/`) for the conceptual / domain background. No duplication.

---

## Out of scope for this INVESTIGATE

- The actual content writing — handled by the follow-on PLAN.
- The Docusaurus deploy mechanics (build pipeline, hosting, custom domain `developer-atlas.helpers.no`) — covered by [INVESTIGATE-deployment-pipeline.md](INVESTIGATE-deployment-pipeline.md).
- Auth / keyed access — separate INVESTIGATE when a real keyed user surfaces; v1 docs reflect anonymous-read posture.
- Splitting Docusaurus into multiple sites (one per audience) vs one site with sections — covered by the deployment-pipeline INVESTIGATE.

---

## Recommended outcome

A new section at `website/docs/developers/` containing:

1. **`index.md`** — landing, audience framing, three-things-you-can-do nav.
2. **`getting-started.md`** — first `curl` walkthrough.
3. **`api-reference.md`** — Swagger UI embedded against the live `api-atlas.helpers.no/` spec ([Q2] resolved as live-spec rendering).
4. **`concepts.md`** — API-consumer-framed conventions; links to user-facing concepts pages for domain depth.
5. **`forking-the-customer-app.md`** — canonical guide for forking `atlas-frontend/`; `atlas-frontend/README.md` is a teaser pointing here ([Q5] resolved as docs-is-source-of-truth).
6. **`versioning.md`** — `api_v1` is stable; breaking changes ship as `api_v2` parallel; calendar deprecation ([Q4] Option A).
7. **`changelog.md`** — version-bump and breaking-change record.

Plus: a banner on `developer-atlas.helpers.no` for any active deprecation announcements (per [Q4c]).

The follow-on **PLAN-006-developer-docs-content** ships these pages, in approximately this order:

1. **Phase 1**: scaffold the section (replace PLAN-005's stub `index.md` with the real landing) + add `getting-started.md` + `api-reference.md` (Swagger UI embed).
2. **Phase 2**: `concepts.md` + `forking-the-customer-app.md` (and update `atlas-frontend/README.md` to teaser shape).
3. **Phase 3**: `versioning.md` + `changelog.md` + banner mechanism.
4. **Phase 4**: `agent-integration.md` (initially stubbed; fills in when a real integration exists).

---

## Cross-references

- [INVESTIGATE-frontend-data-access-architecture.md](INVESTIGATE-frontend-data-access-architecture.md) — established the URL architecture; this INVESTIGATE fills in what `developer-atlas.helpers.no` actually serves.
- [PLAN-005-frontend-split-and-rebuild.md](PLAN-005-frontend-split-and-rebuild.md) — adds a stub `developers/index.md` that this INVESTIGATE's follow-on PLAN replaces with real content.
- [INVESTIGATE-deployment-pipeline.md](INVESTIGATE-deployment-pipeline.md) — Docusaurus deploy + custom domain; separate concern from content.
- [INVESTIGATE-public-api-surface.md](../completed/INVESTIGATE-public-api-surface.md) — the parent that mentioned PLAN-F (publish OpenAPI + docs); this INVESTIGATE realises that work.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — produces the schema descriptions that flow through to the API reference.
- [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md) — canonical conventions; `developers/concepts.md` reframes for API consumers + links here.

---

## Next steps

- [ ] User reviews + accepts the architectural commitments above.
- [ ] On acceptance, move this file `backlog/` → `active/` and draft `PLAN-006-developer-docs-content.md` using the four-phase outline in [Recommended outcome](#recommended-outcome).
- [ ] PLAN-005 (sibling) ships first, including the stub `developers/index.md` that PLAN-006 Phase 1 replaces.
- [ ] On completion of PLAN-006, move this file `active/` → `completed/`.

— signed, the Atlas implementation team (via Claude Code agent), 2026-04-30
