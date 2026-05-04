# Investigate: Data discovery & innovation surface — what should innovators (humans + LLMs) actually use to find, understand, and query Atlas data

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide the surface stack — **discovery** (browse / search / lineage), **query / semantic** (typed joins, measures, programmatic access), and **governance** (auth, rate-limit, audit) — that exposes Atlas's `marts.*` data to innovators (developers, developers paired with LLMs, researchers). Output is a per-surface decision plus a map of which UIS-stack services play which role, and which surfaces are deferred. Not the implementation — that follows in one or more PLANs once decisions land.

**Last Updated**: 2026-05-01

**Origin**: Conversation with the user about how to make Atlas data available so innovators can "create relations between the data". Cube.dev was raised as a candidate semantic layer; the UIS stack ([uis.sovereignsky.no](https://uis.sovereignsky.no/)) ships OpenMetadata, Unity Catalog, Backstage, PostgREST, JupyterHub, Qdrant, LiteLLM, Open WebUI, and several others that overlap or compete with that idea. This INVESTIGATE settles which surfaces Atlas builds, which UIS services we lean on, and what stays out of scope until a real consumer pulls on it.

This investigation is downstream of [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md), which already settled "MCP via dbt-mcp + Postgres MCP" as the LLM-facing **machine semantic interface**. That decision stands. This INVESTIGATE asks the broader question — what's the **whole** innovator-facing surface, including non-MCP paths and the UIS services Atlas could rent vs. duplicate.

---

## Audience

The audience is **innovators building new things on top of Atlas data**:

- **Developers** — forking [`atlas-frontend/`](../../../../../atlas-frontend/), building their own SPA / CLI / mobile app / ETL pipeline against `api-atlas.helpers.no`.
- **Developers paired with LLMs** — using Claude / GPT / Cursor / an MCP-aware agent to ideate, scaffold, retrieve, and write code against Atlas. The LLM is doing the discovery; the human is reviewing.
- **Researchers / journalists with technical skills** — notebooks against PostgREST, possibly via UIS's JupyterHub, possibly via Open WebUI's chat-with-data flow.
- **Future agentic clients** — autonomous agents that need to introspect Atlas's schema, find joinable datasets, and pull rows without human-in-the-loop schema reading.

Shared need across all four: **understand which datasets relate to which** (kommune_nr is the join key into SSB indicators; orgnr is the join key into Brreg + Folkehjelp + Red Cross supply; year is the join key for time-series alignment). Today that knowledge lives in dbt model descriptions, [`docs/research/common-schema.md`](../../../../docs/research/common-schema.md), and per-source READMEs — readable by humans, partially readable by LLMs, not introspectable as data.

Out of audience: Atlas contributors (covered by `website/docs/contributors/`); end-users browsing `atlas.helpers.no` (the customer app itself is their surface); UIS platform operators (covered by their own docs).

---

## The three surfaces

Innovators meet Atlas through three distinct surfaces. Conflating them into one tool is where these stacks usually go sideways.

| Surface | What innovators do here | Tool category | Atlas today | UIS-stack candidate |
|---|---|---|---|---|
| **Discovery** | "What datasets exist? What columns? How are they joined? What's fresh? What's the lineage?" | Data catalog | dbt model docs + READMEs + `mart_ingest_health` (machine surface via dbt-MCP per [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md)) | OpenMetadata, Backstage |
| **Query / semantic** | "Give me kommune-level mobbing × bor_alene joined for 2020–2024" | Semantic layer / API | PostgREST `api_v1.*` (per [PLAN-004](../completed/PLAN-004-postgrest-api-v1-wrapper.md)) | PostgREST (already in use); +Cube.dev if added |
| **Governance** | "Who can read what? Rate limits? Audit trail? API keys?" | API gateway / catalog ACL | None — anonymous-read | Gravitee, Authentik, Unity Catalog |

Each surface has its own answer to "is this innovator-ready?" and its own tooling. This INVESTIGATE settles each independently.

**Clients vs. surfaces.** The three rows above are *surfaces* — protocols / contracts Atlas exposes. **Clients** sit on top of them: JupyterHub (notebooks against the query surface), Metabase (visual SQL / BI client — pending in UIS, scoped internal-team-only per UIS's `INVESTIGATE-metabase.md` in the urbalurba-infrastructure repo), Open WebUI (chat client against MCP). Adding a client changes who can use Atlas, not what Atlas exposes. Whether Metabase stays internal or becomes innovator-facing is **[Q7]** below.

---

## UIS-stack services relevant to this question

The full inventory at [uis.sovereignsky.no](https://uis.sovereignsky.no/) lists 31 services across observability, AI, analytics, identity, databases, management, applications, networking, and integration. Filtered to ones that could play a role in Atlas's innovator-facing surface:

| Service | UIS category | Possible Atlas role |
|---|---|---|
| **OpenMetadata** | Analytics / Data Governance | Discovery surface — catalog, lineage, search, glossary; has a dbt connector that reads `manifest.json` |
| **Unity Catalog** | Analytics / Data Catalog | Governance surface — table-level ACLs, asset registry; designed for AI + data assets together |
| **Backstage (RHDH)** | Management / Developer Portal | Innovator landing — software catalog of APIs, datasets, components |
| **PostgREST** | Integration / API Platform | **Already Atlas's query surface** — `api-atlas.helpers.no` |
| **Gravitee** | Integration / API Gateway | Governance surface — keys, rate limits, plans in front of PostgREST |
| **Authentik** | Identity / Auth | Governance surface — SSO / API keys for keyed-tier consumers |
| **JupyterHub** | Analytics / Notebooks | Innovator analytical surface — notebooks against `api-atlas.helpers.no` or read-only Postgres role |
| **Metabase** *(pending in UIS — Atlas is the request origin)* | Analytics / BI (planned) | Visual SQL / BI exploration client. UIS scopes it Tailscale-gated, internal-team-only (data-quality cross-source comparison, dim-spine modelling, ad-hoc team questions). **Caveat: Metabase is a SQL/JDBC client — it cannot connect to PostgREST.** See **[Q7]** below. |
| **Qdrant** | Databases / Vector | Could power semantic search across catalog descriptions / source READMEs / common-schema prose |
| **LiteLLM** | AI / API Gateway | LLM-routing layer; useful if Atlas hosts a "chat with the data" surface |
| **Open WebUI** | AI / Chat | Hosted chat UI for non-coding innovators ("ask Atlas in natural language") |

Things UIS does **not** ship that this INVESTIGATE has to consider: **Cube.dev** (semantic layer), **dbt's own Semantic Layer consumption APIs** (Cloud-only), **Hex / Mode / Hashboard** (BI). Adding any of them is a new service, with operational cost.

---

## Decisions to resolve

### [Q1] Discovery surface — dbt-MCP, OpenMetadata, both, or Backstage?

[INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md) already settled the **machine** discovery surface as **dbt-MCP** (with Postgres MCP for fetch). What this question asks: what's the **human** discovery surface, and is it the same thing?

- **(a) dbt-MCP only** — minimal, but only LLM/agent clients see it. A human Googling "Atlas kommune dataset" finds nothing browsable.
- **(b) OpenMetadata only** — UIS already runs it. Has a dbt connector that ingests `manifest.json` automatically, so the catalogue stays in sync without parallel YAML. Renders lineage, supports glossary terms, supports search.
- **(c) Both — dbt-MCP for agents, OpenMetadata for humans** — same source (dbt's `manifest.json` + `meta:` fields); two projections. The dbt-osmosis CI gate from PLAN-A in semantic-foundation already enforces "every column documented", which is the input both surfaces consume.
- **(d) Backstage** — wrong shape. Backstage is a software catalog (services, components, APIs) and treats datasets as second-class. It can register `api-atlas.helpers.no` as one entity, but it doesn't show columns, lineage, or freshness the way OpenMetadata does.
- **Tentative recommendation**: **(c)** — both, with dbt as single source of truth. Cost is one OpenMetadata dbt connector (UIS already runs the service). Benefit: human innovators land on a browse-able catalog without us building one; agents keep MCP. Verify before locking: how stable is OpenMetadata's dbt Core connector, and does UIS's instance accept external dbt projects, or is it tenant-scoped to UIS's own data? **[Q8]** below.

### [Q2] Query / semantic surface — PostgREST alone, or PostgREST + a semantic layer?

PostgREST already ships against `api_v1.*` and `api_v2.*` is the path forward for breaking changes (per [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md) [Q4]). The question: do innovators need an additional **semantic layer** that declares joins / measures / dimensions on top of PostgREST?

- **(a) PostgREST + great metadata only** — declare canonical join keys (`kommune_nr` → `dim_kommune`, `orgnr` → `dim_chapter`, `period_start_year` → time alignment) in dbt `meta:`, surface them via dbt-MCP, and document them in [website/docs/developers/concepts.md](../../../../developers/concepts.md). LLMs are given the OpenAPI spec + the join cheatsheet and figure out the joins. Cheapest. Most fragile for LLMs that mis-join (the `dim_kommune is_active` 5× row trap is a live example).
- **(b) PostgREST + Cube.dev** — Cube reads dbt's `manifest.json`, declares `joins:` and `measures:` in YAML, and exposes a REST + GraphQL + SQL + **MCP** API. LLMs query the semantic layer; Cube enforces correct joins. Adds one service to operate (Cube core is OSS, deployable to UIS's k8s). Adds a second schema layer to maintain alongside dbt. **Prior context**: Cube was evaluated and rejected for the *separate* role of "multi-tenant end-user dashboards" (per UIS's `INVESTIGATE-metabase.md`). That rejection does not bind this question — agent-facing semantic-layer over `marts.*` is a different role — but the earlier reject is a useful precedent on operational-cost framing.
- **(c) PostgREST + dbt's own Semantic Layer** — `semantic_models:` in the dbt project plus the dbt SL APIs. **Dead end for Atlas**: per [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md) Option D, the consumption side of dbt SL is dbt-Cloud-only. Atlas runs dbt Core. Not viable without adopting dbt Cloud.
- **(d) Defer** — ship (a) now; revisit Cube only when a real innovator says "I cannot write correct joins against PostgREST." YAGNI argument.
- **Tentative recommendation**: **(d) → (a) → re-evaluate Cube on signal**. The dbt-osmosis "every column documented" gate plus declared join keys in `meta:` plus the dbt-MCP exposure means an LLM has structured access to "kommune_nr is the join key into dim_kommune (filter is_active=true)". That's the same primitive Cube would expose, without operating a second service. The case for Cube grows specifically if (1) we add many measures (rates, ratios, deltas) that aren't already in `marts.*`, or (2) external LLM consumers consistently mis-join. Trigger conditions in **[Q9]** below.

### [Q3] Governance surface — Unity Catalog / Gravitee / Authentik now, or deferred?

Atlas today is anonymous-read; PostgREST sits behind Cloudflare; there is no auth, no rate limit, no audit.

- **(a) Defer** — anonymous-read is the goal; Cloudflare absorbs DoS; no keyed users exist. Adding Unity Catalog / Gravitee / Authentik is YAGNI.
- **(b) Pre-stage Gravitee + Authentik** — even if v1 is anonymous, route PostgREST through Gravitee so adding a keyed tier later is config not architecture.
- **(c) Adopt Unity Catalog** — register `marts.*` as governed assets; useful when private Atlas deployments ([INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md)) need ACLs.
- **Tentative recommendation**: **(a) defer**, with a documented trigger. Lift the defer when **either** (i) a keyed/paid tier is decided, or (ii) a private deployment ([INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md)) needs role-based access. At that point Gravitee + Authentik handle the API-key tier; Unity Catalog only enters if the private-deployment story needs cell-level governance, which is a stretch for Atlas's data shape.

### [Q4] Innovator landing page — `developer-atlas.helpers.no`, Backstage, or both?

- **(a) `developer-atlas.helpers.no`** — already scoped in [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md). Docusaurus site with API reference, getting-started, concepts, forking guide, agent-integration page.
- **(b) Backstage** — UIS-hosted developer portal; could register Atlas as a "system" with its API as a "component" and link out.
- **(c) Both** — primary landing on `developer-atlas.helpers.no`; Atlas appears in UIS's Backstage as one entity among UIS's catalog, mostly for UIS-internal discoverability.
- **Tentative recommendation**: **(a)** primary; **(c)** if UIS contributors want Atlas in their Backstage catalog. Atlas is an external-facing project; its landing page lives on its own domain. Backstage's audience is UIS-internal, not innovators forking Atlas.

### [Q5] Natural-language / chat surface — Open WebUI as a "talk to Atlas" front-end?

Some innovators (especially journalists, NGO staff, policy researchers) won't write SQL or REST queries. Today they have nothing. UIS ships LiteLLM + Open WebUI; with a system prompt + tool definitions pointing at Atlas's MCP servers, they could chat.

- **(a) Out of scope for v1** — focus on developers and dev+LLM; chat surface is downstream.
- **(b) Stand up an Atlas-themed Open WebUI instance** — preconfigured with system prompt, dbt-MCP + Postgres MCP tools, example questions. Hosted on UIS.
- **(c) Document the pattern** — write a guide on `developer-atlas.helpers.no/agent-integration.md` showing how an innovator wires Atlas MCP servers into their own Claude Desktop / OpenAI / Open WebUI client; don't host one.
- **Tentative recommendation**: **(c) for v1**, **(b) on demand**. The pattern is more valuable than a hosted instance — agentic clients are the trajectory; hosted chat is a single-user product. The agent-integration page already exists in scope per [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md).

### [Q6] Join discoverability — the crux

The user's framing was "innovators can create relations between the data". This is the question that decides whether (a) or (b) wins in **[Q2]**. Three concrete sub-options:

- **(a) Declarative `meta:` on dbt models** — every `marts.*` model gets `meta: { joins: [{ key: "kommune_nr", to: "dim_kommune", filter: "is_active = true" }] }`. dbt-osmosis + a small CI check enforces presence. dbt-MCP exposes it. The OpenAPI spec gets a `x-atlas-joins` extension. LLMs read it directly.
- **(b) A canonical-IDs cheatsheet doc** — one page (`developers/canonical-ids.md` or extending [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md)) listing every join key + which datasets share it + the gotchas (the `dim_kommune is_active` trap is the worked example). Linked from the API reference page. LLMs are given this doc as part of their system prompt.
- **(c) Both** — (a) is the machine-readable source of truth; (b) is the human-readable rendering, generated from the same `meta:` blocks.
- **Tentative recommendation**: **(c)**. (a) alone leaves humans needing to read JSON; (b) alone has drift risk. Together, the doc is generated from the `meta:` blocks at build time, so it can't drift. The generator is ~50 lines of TS that reads `manifest.json`. Same input feeds OpenMetadata + dbt-MCP, so this is one decision shipped three places.

### [Q7] Exploration client — Metabase, internal-only (per UIS scope) or also innovator-facing?

UIS is on track to deploy Metabase OSS — see UIS's `INVESTIGATE-metabase.md` (urbalurba-infrastructure repo). That investigation is **request-from-Atlas**: Atlas is the first consumer. UIS scopes Metabase as **internal team validation, Tailscale-gated** — for data-quality cross-source comparison, dim-spine modelling during `marts.*` development, and ad-hoc team questions. UIS's investigation explicitly excludes Metabase from "the public-facing Atlas portal", "public open-data APIs", and "multi-tenant end-user dashboards" (Cube was evaluated and rejected for that third role).

The question for innovators: should Atlas *also* expose a public / innovator-facing Metabase, or is internal-only the right line?

The hard architectural fact: **Metabase is a SQL/JDBC client, not a REST client.** It cannot connect to `api-atlas.helpers.no`. Using Metabase against Atlas requires Postgres access — which Atlas does not expose publicly today (PostgREST is the deliberate governed surface). Reversing that posture is a security expansion, not a UI tweak.

- **(a) Internal-only — match UIS's scope.** Innovators get PostgREST + OpenMetadata (per **[Q1]**) + JupyterHub for code-shaped exploration. Customer frontend `atlas.helpers.no` is the end-user-facing exploration UI.
- **(b) Add a separate public-ingress Metabase.** Second Metabase deployment with public auth (Authentik) or anonymous read-only. Costs: second JVM service to operate, query-cost / timeout / abuse-mitigation that Tailscale-gated internal use sidesteps, **and** a public read-only Postgres role that does not exist today.
- **(c) Document the self-host pattern.** Innovator runs Metabase locally pointed at a public Postgres role on Atlas. Same Postgres-exposure decision as (b), no operational cost on Atlas side.
- **(d) Embedded curated dashboards.** Atlas embeds Metabase question iframes into `atlas.helpers.no` (a "data tour" page). Pre-built views, not exploration. This is a customer-frontend feature, not an innovator surface.
- **Tentative recommendation**: **(a) internal-only.** Deciding factor is the SQL-vs-REST architecture: making Metabase work for innovators requires opening a public Postgres surface, which is a meaningfully different security posture from "PostgREST is the public API" — that decision belongs in its own INVESTIGATE, not as a side-effect of choosing an exploration client. Innovators with SQL-shaped exploration needs use JupyterHub (UIS) or self-host their preferred client against PostgREST. (b) is reachable later if real demand surfaces *and* the Postgres-exposure question is answered separately. (d) revisits if `atlas.helpers.no` adds a data-tour page.

---

## Open questions

- **[Q8]** **OpenMetadata + dbt Core**: how stable is the OpenMetadata dbt connector against dbt Core projects (vs. dbt Cloud)? Does UIS's instance accept external dbt project ingestion, or is it tenant-scoped? Spike: try ingesting Atlas's `manifest.json` into UIS OpenMetadata; document any rough edges.
- **[Q9]** **Cube.dev re-evaluation trigger**: define the concrete signal that flips **[Q2]** from (d) to (b). Candidates: "the third LLM consumer mis-joins kommune_nr without `is_active` filter and produces wrong rows in production"; "Atlas adds 10+ derived measures that don't fit `marts.*`"; "an external developer files an issue specifically asking for typed joins".
- **[Q10]** **Backstage as UIS-internal**: should Atlas appear in UIS's Backstage catalog at all? This is mostly a UIS contributor question; flag for the UIS-side conversation, do not decide here.
- **[Q11]** **Qdrant for catalog semantic search**: out of scope for v1, but worth noting — once the catalogue has prose (definitions, source READMEs, `common-schema.md` chunks), Qdrant could power semantic search inside OpenMetadata or `developer-atlas.helpers.no`. Defer until catalogue content exists.
- **[Q12]** **MCP host posture**: does Atlas *host* an MCP server (`mcp.atlas.helpers.no`?) or only document how innovators run dbt-mcp + Postgres MCP locally against Atlas's `manifest.json` and the read-only Postgres role? Hosted MCP is a new operational surface; client-side is free but raises the bar for integration. Cross-link to [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md) `agent-integration.md` content.
- **[Q13]** **Public Postgres role — separate INVESTIGATE?**: **[Q7]** option (b)/(c) requires a public read-only Postgres role on the Atlas DB. Atlas's current posture is "PostgREST is the public surface; Postgres stays cluster-internal." If a future innovator demand pushes (b) or (c), the Postgres-exposure question is a stand-alone decision (security, cost, abuse mitigation) and should get its own INVESTIGATE rather than being decided implicitly by adopting Metabase. Flag for now; create `INVESTIGATE-public-postgres-role.md` when demand materialises.
- **[Q14]** **Relationship to [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md)**: this INVESTIGATE inherits its decisions on dbt-MCP and dbt-osmosis. Confirm it does not contradict any of its open questions ([Q24] dbt-mcp Core maturity, [Q25] dbt-docs sunset). Likely overlaps with [Q24] (resolving it resolves a prerequisite for both).

---

## Out of scope for this INVESTIGATE

- **Implementation of any chosen surface** — handled by follow-on PLANs.
- **Cost / operations modelling** — UIS-stack services are already operated; Cube.dev is the only "new service" and its cost is bounded by whether the trigger in **[Q9]** fires.
- **Re-deciding the MCP-as-machine-interface choice** — owned by [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md).
- **The OpenAPI spec rendering** — owned by [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md) [Q2].
- **Auth implementation details** — deferred per **[Q3]**.
- **Private Atlas deployments and their ACL story** — owned by [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md).

---

## Recommended outcome (subject to user review)

**Discovery**: dbt-MCP (machine, settled in semantic-foundation INVESTIGATE) **+ OpenMetadata via UIS** (human, ingested from `manifest.json`). Single source of truth in dbt; two renderings.

**Query / semantic**: PostgREST + declared join keys in `meta:` + generated canonical-IDs doc. **Defer Cube.dev** until **[Q9]** trigger fires.

**Governance**: **Defer** Gravitee / Authentik / Unity Catalog. Lift defer on keyed-tier or private-deployment trigger.

**Innovator landing**: `developer-atlas.helpers.no` (already scoped). Backstage only if UIS contributors want Atlas registered in their internal catalog.

**Chat / NL surface**: document the pattern on `agent-integration.md`; do not host an Atlas-branded Open WebUI in v1.

**Exploration client (Metabase)**: **internal-only** per UIS's scope (Tailscale-gated, request-from-Atlas, first consumer is the Atlas dev team). Not innovator-facing in v1. Revisiting requires a separate INVESTIGATE on public Postgres exposure (**[Q13]**) before the question is even decidable.

**Join discoverability** (the crux): `meta: { joins: [...] }` on dbt models, generated cheatsheet doc, surfaced to LLMs via dbt-MCP and to humans via the cheatsheet + OpenMetadata.

The follow-on PLANs (numbering tentative):

1. **PLAN — Declare joins in `meta:` + generate canonical-IDs cheatsheet** — adds the `meta: { joins: [...] }` blocks to all `marts.*` conformed models, plus a small TS generator that emits `developers/canonical-ids.md` from `manifest.json`, plus a CI check that fails when a model's join key isn't declared.
2. **PLAN — Ingest Atlas dbt project into UIS OpenMetadata** — depends on **[Q8]** spike; wires OpenMetadata's dbt connector against `manifest.json` + the read-only Postgres role for sample-data preview.
3. **PLAN — Provision `metabase_atlas_reader` role + register Atlas as a Metabase data source** — Atlas-side coordination work for UIS's Metabase deployment (PLAN-002 in their `INVESTIGATE-metabase.md`). Atlas owns the role provisioning + initial collection seeding (Data Quality / Dim Spine Validation / Atlas Exploration); UIS owns the Metabase install. Internal-team scope — not innovator-facing.
4. **PLAN (deferred, trigger-gated) — Adopt Cube.dev semantic layer** — only when **[Q9]** trigger fires; adds Cube as a service, declares joins / measures, exposes Cube's MCP server alongside dbt-MCP.

PLAN 1 is the highest-leverage and is the prerequisite for PLAN 2 (OpenMetadata picks up join metadata from `meta:` automatically). PLAN 3 is small, gated on UIS's Metabase deployment landing. PLAN 4 stays in backlog with a written trigger.

---

## Cross-references

- [INVESTIGATE-semantic-foundation-before-expansion.md](INVESTIGATE-semantic-foundation-before-expansion.md) — settled the **machine** semantic interface as dbt-MCP + Postgres MCP. This INVESTIGATE inherits that and asks the broader surface question.
- [INVESTIGATE-developer-docs-surface.md](INVESTIGATE-developer-docs-surface.md) — owns `developer-atlas.helpers.no`; this INVESTIGATE confirms it as the innovator landing surface.
- [INVESTIGATE-private-atlas-deployments.md](INVESTIGATE-private-atlas-deployments.md) — the trigger for governance work in **[Q3]**.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — tagging is one form of cross-dataset relation; settles separately but feeds the same `meta:` and OpenMetadata surfaces.
- UIS's `INVESTIGATE-metabase.md` (urbalurba-infrastructure repo, `website/docs/ai-developer/plans/backlog/`) — the request-from-Atlas Metabase deployment that **[Q7]** scopes against; also the source of the prior Cube reject precedent referenced in **[Q2]**.
- [PLAN-004-postgrest-api-v1-wrapper.md](../completed/PLAN-004-postgrest-api-v1-wrapper.md) — the existing PostgREST query surface this INVESTIGATE builds on.
- [`docs/research/common-schema.md`](../../../../docs/research/common-schema.md) — the prose entity model that becomes seed content for OpenMetadata's glossary terms.
- [`docs/stack/naming-conventions.md`](../../../../../docs/stack/naming-conventions.md) — canonical IDs conventions; the generated cheatsheet links here for canonical content.
- UIS service docs — the inventory at [uis.sovereignsky.no](https://uis.sovereignsky.no/), specifically:
  - [OpenMetadata](https://uis.sovereignsky.no/docs/services/analytics/openmetadata)
  - [Unity Catalog](https://uis.sovereignsky.no/docs/services/analytics/unity-catalog)
  - [Backstage](https://uis.sovereignsky.no/docs/services/management/backstage)
  - [PostgREST](https://uis.sovereignsky.no/docs/services/integration/postgrest)
  - [Gravitee](https://uis.sovereignsky.no/docs/services/integration/gravitee)
  - [JupyterHub](https://uis.sovereignsky.no/docs/services/analytics/jupyterhub)
  - [Qdrant](https://uis.sovereignsky.no/docs/services/databases/qdrant)
  - [LiteLLM](https://uis.sovereignsky.no/docs/services/ai/litellm)
  - [Open WebUI](https://uis.sovereignsky.no/docs/services/ai/openwebui)

---

## Next steps

- [ ] User reviews **[Q1]** through **[Q7]** and confirms or redirects each tentative recommendation.
- [ ] Resolve **[Q8]** (OpenMetadata + dbt Core spike) — small ~half-day investigation; needed before PLAN 2.
- [ ] Decide whether **[Q12]** (hosted MCP vs. client-side) is in this INVESTIGATE or split out.
- [ ] On acceptance, move this file `backlog/` → `active/` and split into PLANs 1–4 above.
- [ ] On completion of all PLANs (or trigger-gated deferral of PLAN 4), move this file `active/` → `completed/`.

— signed, the Atlas implementation team (via Claude Code agent), 2026-05-01
