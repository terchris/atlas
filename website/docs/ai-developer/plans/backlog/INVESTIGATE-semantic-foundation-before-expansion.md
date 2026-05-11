# Investigate: Lock the semantic foundation before adding more NGO supply sources

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide what semantic-layer artifacts (concept catalogue, dbt model contracts, cross-NGO taxonomy decisions) must land **before** Atlas adds more NGO supply sources beyond Folkehjelp, so that those decisions don't get baked into 5+ more `supply__<ngo>_*` models and have to be retroactively undone.

**Last Updated**: 2026-04-25

**Origin**: [`docs/ideas/semantic-data-platform.md`](https://github.com/terchris/atlas/tree/main/docs/ideas/semantic-data-platform.md) proposed a canonical semantic layer "before dbt transformations are defined". A repo-wide alignment evaluation (captured in [`docs/ideas/semantic-data-platform-discussion.md`](https://github.com/terchris/atlas/tree/main/docs/ideas/semantic-data-platform-discussion.md)) found that ~70–80% of that layer is already implicitly built — but is *unpackaged* (scattered across `schema.yml`, `common-schema.md`, INVESTIGATE plans, and seed READMEs) rather than factored out as a first-class artifact. The follow-up question — "but we can't continue adding more data until we have a clear definition, so we don't have to redo later?" — is the framing this investigation answers.

---

## Questions to Answer

1. **[Q1]** Which semantic decisions are **already locked** in the repo (no rework risk from adding more sources) vs. **not yet locked** (rework risk grows with each new source added)?
2. **[Q2]** Should NGO supply-source expansion (everything past PLAN-003 Folkehjelp) pause until the unlocked decisions land? Or can it continue if each new source explicitly accepts the rework risk?
3. **[Q3]** What goes in the Concept Catalogue — which concepts, what file format, hand-curated vs. auto-generated from dbt's `manifest.json` vs. hybrid?
4. **[Q4]** Cross-NGO canonical activity taxonomy ([common-schema.md:450](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md#L450) flags this as still TBD) — extend `ref_atlas_service_category`, build a separate cross-NGO `dim_canonical_activity`, or stay per-NGO and resolve at query time?
5. **[Q5]** Regional-without-orgnr chapter modelling ([common-schema.md:458](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md#L458) flags Redd Barna's "20 lokallag + 5 HQ regions" as TBD) — model regions as a separate entity, stretch `dim_chapter` with a new `chapter_kind` enum, or accept asymmetric coverage and document the gap?
6. **[Q6]** SDG/ICNPO indicator tagging approach — defer to [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) to settle, or fold its decision into this investigation so the catalogue ships with tagging in place?
7. **[Q7]** dbt model contract scope — apply `contract: { enforced: true }` to all of `marts.*`, only the cross-NGO conformed dimensions (`dim_kommune`, `dim_chapter`, `dim_activity`, `dim_ngo`, `fact_kommune_indicators`, `fact_chapter_activities`), or none yet?
8. **[Q8]** What's the operational rule for "this decision is locked"? Just docs in the catalogue, or enforced via dbt contracts + tests + CI?

---

## Current State

### What's already locked (zero or near-zero rework risk)

The 19 ingest sources and 17 indicator models in [`atlas-data/dbt/models/`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/) demonstrate a stable, proven pattern. These canonical elements are consistent across every source:

- **Canonical identifiers**: `kommune_nr` (4-digit, SSB Klass 131), `fylke_nr` (2-digit, SSB Klass 104), `orgnr` (Brreg 9-digit), `source_id` (e.g. `ssb-08764`, `fhi-mobbing`), `chapter_id` (NGO-namespaced slug), `activity_id` (NGO-namespaced slug).
- **Source → indicator mapping pattern**: every `indicators__<source_id>` model in [models/indicators/](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/indicators/) follows the same shape: extract `region_code` → `kommune_nr` / `fylke_nr` by regex, normalize sex via `decode_sex` macro, parse periods via `period_start_year` / `period_end_year`, materialize as `marts.indicators__*` table with FK tests against `dim_kommune` / `dim_fylke`.
- **Cross-source union pattern**: [`fact_kommune_indicators`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/marts/fact_kommune_indicators.sql) UNION ALL of all kommune-resolved indicator passthroughs, joined to `dim_kommune` + `dim_fylke`.
- **Reference vocabulary pattern**: `ref_*` seeds in [seeds/](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/) decode upstream codes to labels (4 columns: `code`, `label_no`, `label_en`, `sort_order`).
- **Repo boundary contract**: `atlas-data` writes `marts.*`, frontend reads via read-only role (documented in [atlas-data/README.md:26-34](https://github.com/terchris/atlas/tree/main/atlas-data/README.md#L26-L34)).

Adding source #20 of the same shape (another SSB or FHI table) **does not** create rework risk — it slots into the existing patterns mechanically. The catalogue, when built, will auto-augment with these new sources.

### What's not yet locked (rework risk grows with each new source)

The supply side is much earlier and has actively-open semantic questions. These are baked into every new `supply__<ngo>_*` model added:

- **Cross-NGO activity taxonomy** — the 22-row [`ref_atlas_service_category.csv`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/ref_atlas_service_category.csv) is the start, but [`common-schema.md:450`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md#L450) explicitly flags a deeper cross-org canonical taxonomy ("elderly_visiting_scheme" spanning RC Besøkstjeneste + N.K.S. Omsorgsberedskap + Nasjonalforeningen Aktivitetsvenn) as TBD. Each new NGO supply source adds another ~50 globalActivityName values that need mapping.
- **`chapter_subtype` vocabulary** — [dim_chapter schema.yml:158-166](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/dimensions/schema.yml#L158-L166) keeps it free-text in v1; promotion to `accepted_values` is gated on "3+ NGOs populate it consistently". The values that get added to v1 NGOs determine that vocabulary forever.
- **Regional-without-orgnr modelling** — [`common-schema.md:458`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md#L458) flags Redd Barna's HQ-administered regions as not fitting the current `dim_chapter` shape. Adding more Tier C / hybrid orgs will surface more of these.
- **`chapter_data_shape` enum coverage** — currently `api_canonical | cms_bins | programme_only | no_structure`. The next 5 NGOs may surface a fifth shape (e.g. "hybrid api+scrape", "kommune-list-only").
- **SDG/ICNPO indicator tagging** — [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) is in backlog. Whatever approach wins (Option A through E in that file) will need to be retroactively applied to all 17 existing indicator models — fewer is cheaper.

### What's "unpackaged" (the discussion-file finding)

The semantic content exists but is scattered:

- **Entity definitions**: [`docs/research/common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md) (470 lines of prose entity model).
- **Per-model column definitions**: dbt `schema.yml` files (~700 lines across `models/dimensions/`, `models/indicators/`, `models/marts/`, `models/supply/`).
- **Reference vocabularies**: [`atlas-data/dbt/seeds/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/README.md) + 10 CSV seeds.
- **Source provenance**: per-source READMEs under [`atlas-data/ingest/src/sources/<id>/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/ingest/src/sources/) + the catalogue at [`docs/research/data-sources.md`](https://github.com/terchris/atlas/tree/main/docs/research/data-sources.md).
- **Architectural rationale**: the 18 `INVESTIGATE-*.md` and `PLAN-*.md` files in `plans/completed/`.

A non-engineer (journalist, partnering NGO, future external developer matching the **Dev** persona in [personas.md](https://github.com/terchris/atlas/tree/main/docs/research/personas.md)) currently has no single entry point to "what does Atlas mean by `kommune` / `chapter` / `activity` / `service_category`?".

---

## The freeze/continue split (proposed)

The honest answer to "can we continue adding more data" is: **yes for some, no for others**. The freeze is *supply-side only* — indicator sources stay flowing.

**Why the asymmetry matters:** the dominant 2026 catalogue-failure pattern is "we built it; nobody pulled on it." A semantic interface with no fresh data behind it is a museum exhibit. Indicator sources have zero rework risk (the `indicators__<source_id>` pattern is locked) and are what makes the MCP-exposed semantics worth pulling on. Freezing them while we polish the interface is the failure mode we want to avoid. The freeze applies to the supply-side decisions that are still semantically open (cross-NGO taxonomy, regional chapters, `chapter_subtype` vocabulary), not to the data flow that demonstrates the interface.

### Continue in parallel (no rework risk)

- **[Q9]** Adding more SSB/FHI/Bufdir/IMDi indicator sources following the established `indicators__<source_id>` pattern. The pattern is locked; new sources slot in mechanically. MCP auto-surfaces them via `manifest.json`. **This is the demand-side: keep it flowing so the interface has something worth consuming.**
- **[Q10]** Completing PLAN-003 (Folkehjelp supply ingest) — already in flight, already fits the existing `supply__<ngo>_*` pattern, and adding the second NGO is what will surface most of the open semantic questions in concrete form.

### Pause until foundation locks (supply side only)

- **[Q11]** Adding the 3rd through Nth NGO supply sources (N.K.S., Nasjonalforeningen, 4H, Speiderforbundet, Frelsesarmeen, Kirkens Bymisjon, etc.). Each one bakes assumptions about cross-NGO activity taxonomy, `chapter_subtype` vocabulary, regional-without-orgnr modelling — all currently unlocked. The pause is on these *decisions*, not on data flow generally.
- **[Q12]** Adding Tier C profile sources (NRC, KN, SOS, UNICEF, etc. — the donate-only orgs from [common-schema.md:271-296](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md#L271-L296)). The `Profile` entity is sketched but not yet implemented in dbt; adding multiple at once locks the wrong shape.

---

## Options for the Concept Catalogue

### Option A — `dbt docs generate` only

Use dbt's built-in docs site, hosted statically. Auto-generates from `schema.yml` descriptions + lineage graph + tests.

**Pros:**
- Zero new tooling. Already runnable today.
- Stays in sync with dbt models automatically.
- Renders lineage DAG.

**Cons:**
- Dbt-shaped, not concept-shaped — a reader sees `dim_kommune` (a model), not "kommune" (a concept) with its narrative definition, source-of-truth statement, and worked example.
- Doesn't carry [`common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md) prose, INVESTIGATE-plan rationale, or per-source provenance narratives.
- Not LLM-optimized — the JSON manifest is dbt-shaped, requires interpretation.

### Option B — Hand-curated `docs/semantic/<concept>.md` per concept

One MD file per concept (`kommune.md`, `fylke.md`, `ngo.md`, `chapter.md`, `activity.md`, `indicator.md`, `source.md`, `service_category.md`), linked from a top-level `docs/semantic/README.md`.

**Pros:**
- Reader-first: each concept has its own page with definition, identifier, source-of-truth, examples, change-log.
- Easy to author and review in PRs.
- Renderable by Docusaurus / GitHub directly.

**Cons:**
- Two sources of truth (the MD file + the dbt `schema.yml`) — drift risk.
- Manual cross-checking that catalogue matches reality.
- Not directly machine-consumable.

### Option C — Structured YAML concept files + generator

One YAML per concept under `docs/semantic/concepts/<concept>.yml`. Each carries hand-written fields (definition, source-of-truth, change-log, examples) plus a reference to dbt model name(s). A small Node/TypeScript generator script:

1. Reads the YAML files.
2. Reads dbt's `manifest.json` (already produced by `dbt parse`).
3. Cross-checks coverage (every `dim_*` / `fact_*` / `crosswalk_*` model in `marts` is referenced from at least one concept; every concept references real dbt models).
4. Renders to:
   - `docs/semantic/concepts.json` — single machine-readable artifact for LLM/API consumption.
   - `docs/semantic/<concept>.md` — auto-rendered MD for human browsing.
   - `docs/semantic/openapi.yaml` (later) — OpenAPI spec for the read API, when that lands.

**Pros:**
- Single source of truth (YAML), with auto-rendered projections for humans, LLMs, and developers.
- Drift detection built in (the generator fails CI if a model exists in `marts` but no concept references it).
- LLM-optimized: chunked by concept, stable IDs, predictable structure.
- Foundation for the public API (the same concept-id → model mapping seeds the API endpoints).

**Cons:**
- Most upfront tooling work (~3–5 days for the generator).
- Yet another file format in the repo.

### Option D — dbt `semantic_models:` + `groups:` (dbt's own semantic layer)

Use dbt-native `semantic_models:` (introduced in dbt 1.6+) to declare entities, dimensions, and metrics inside the dbt project. Render via dbt docs.

**Pros:**
- Native to the tool already in use.
- Standard format; future tooling (e.g. dbt's MetricFlow) consumes it.

**Cons:**
- dbt-internal — not visible to consumers who don't run dbt.
- Designed for BI metric definition, not for concept-level documentation aimed at external developers / LLMs / journalists.
- Doesn't replace the prose in [`common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md).
- Less portable than YAML if we move off dbt later.
- **Trap (verify before adopting):** the *consumption* side of dbt's Semantic Layer (the SL APIs that AI agents and BI tools call) is dbt-Cloud-only. dbt Core projects can declare `semantic_models:` locally but cannot expose them via the SL APIs. So "we'll graduate from dbt-docs to dbt Semantic Layer later" hides a paid SaaS dependency. Atlas runs dbt Core against Postgres locally, so this option is a dead end for external consumption unless we also adopt dbt Cloud.

### Option E — dbt MCP server + `manifest.json` (machine interface, recommended)

Run [dbt-mcp](https://github.com/dbt-labs/dbt-mcp) against the local dbt Core project. The MCP (Model Context Protocol) server exposes dbt's Discovery API — every model, column, description, lineage edge, freshness signal — over a protocol that Claude / GPT / any MCP client consumes natively. Pair it with a Postgres MCP server (Anthropic ships one) scoped to the existing read-only role so an LLM can both *understand* the semantics and *fetch the rows*.

The static dbt-docs HTML site stays as a fallback view for human browsing; the **machine** interface is MCP + `manifest.json`.

**Pros:**
- Direct match for the audience identified in the voice round (Q4 — "best for LLM"). MCP is the protocol agent clients already speak; static HTML is what humans read.
- Works on dbt Core + Postgres locally — no dbt Cloud, no SaaS account, no paid dependency (unlike Option D).
- `manifest.json` is the same artifact Option C wants to consume, so MCP doesn't *replace* the YAML-concept idea — it sits in front of it.
- Postgres MCP scoping is ~1 hour to wire up against the existing read-only role.
- Aligns with the live trajectory of the dbt ecosystem (see trap below on dbt-docs deprecation).

**Cons:**
- MCP is newer than dbt-docs — fewer worked Norwegian/Nordic precedents. **[Q24]** flagged below.
- Doesn't replace narrative prose ([`common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md)) — that still needs to be linkable from dbt models via `meta:` fields so MCP exposes it.
- MCP clients are still mostly desktop/agent contexts; not a substitute for an HTTP API when one is needed (PLAN-C territory).

---

## Recommendation candidates (to discuss, not yet chosen)

**Tentative pick: Option E (dbt MCP + `manifest.json`), with a thin slice of Option C for the narrative layer.** Reasoning:

- The Q4 voice-round decision was "best for LLM." In 2026 that points at MCP, not at a static docs site or hand-curated YAML. dbt's own AI tooling reads `manifest.json` over MCP; Claude / GPT clients consume MCP natively. Shipping the rendered HTML site is shipping the *least* useful artifact for the audience we said we cared about.
- It is the only option that gives an LLM **both** "what does this concept mean" (dbt MCP) and "fetch me the rows" (Postgres MCP) in one move, against the existing dbt Core + Postgres stack with no SaaS dependency.
- Option C's structured-YAML idea isn't wasted — concept-level prose (definition, source-of-truth, change-log) lives in `meta:` fields on dbt models (or a small number of YAML concept files referenced from there), so MCP surfaces them. Single source of truth survives, but rendered through MCP rather than through a custom generator.
- [`common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md) stays as the narrative layer; dbt models link to it via `meta: { concept_doc: "..." }` so MCP can expose the link. Avoids the "two sources of truth" trap of Option B.
- Option A (static dbt-docs site) is kept as the **fallback view for humans**, not as the primary interface.

But this is a real call to make. Two traps to verify before locking it in: **[Q24]** (dbt Core MCP maturity) and **[Q25]** (dbt-docs static-site sunset trajectory).

---

## Recommendation — phased plan (subject to revision)

A 3-week structural pause before NGO supply expansion resumes, with parallel data work continuing where safe.

### **[Q13]** PLAN-A — Expose Atlas semantics via dbt MCP + `manifest.json` (week 1)

Stand up the **machine-readable semantic interface** for the 8 already-locked concepts. No new semantic decisions; surfaces what already exists. Static dbt-docs HTML stays as a fallback view for human browsing.

Concepts to surface (each maps 1:1 to existing dbt models / seeds):
1. `kommune` (sourced from `dim_kommune`)
2. `fylke` (sourced from `dim_fylke`)
3. `ngo` (sourced from `dim_ngo`)
4. `chapter` (sourced from `dim_chapter`)
5. `activity` (sourced from `dim_activity`)
6. `service_category` (sourced from `ref_atlas_service_category`)
7. `indicator` (sourced from `indicators__*` family)
8. `source` (sourced from per-source READMEs + `mart_ingest_health`)

Scope (in order of dependency):

1. **dbt MCP server** (~1 day): run [dbt-mcp](https://github.com/dbt-labs/dbt-mcp) against the local dbt Core project. Verifies `manifest.json` is current, exposes the Discovery API to MCP clients.
2. **Link narrative prose into dbt models** (~0.5 day): add `meta: { concept_doc: "docs/research/common-schema.md#kommune" }` (or per-concept anchor) on the 8 conformed models so MCP surfaces the link to `common-schema.md`. Avoids the two-sources-of-truth trap.
3. **Postgres MCP server scoped to read-only role** (~1 hour): wire up Anthropic's Postgres MCP against the existing read-only role on the Atlas database. Together with dbt MCP, an LLM gets both "what does this mean" and "fetch me the rows" in one client. *(Note: as of the dogfood decision in [`INVESTIGATE-public-api-surface.md`](../completed/INVESTIGATE-public-api-surface.md), the **PostgREST HTTP API** also becomes a fetch path for LLMs that prefer governed REST over raw SQL. MCP is still the right primary fetch mechanism for agents that already understand schema via dbt MCP; PostgREST adds a parallel option for cache-friendly, gateway-protected reads later.)*
4. **dbt-osmosis + CI coverage gate** (~0.5 day): replace any "manual schema.yml audit" notion with [dbt-osmosis](https://github.com/z3z1ma/dbt-osmosis) propagating column descriptions across the lineage, plus a CI check that fails if any `marts.*` model has missing description / undocumented columns / no concept link. Manual audits decay; automation doesn't.
5. **Fallback dbt-docs HTML site** (~0.5 day, lower priority): publish `dbt docs generate` output as a static site for human browsing. Note **[Q25]** trajectory before investing in custom theming.

Output: MCP-accessible Atlas semantic interface, narrative prose linked from models, automated coverage gate in CI, fallback HTML site for humans.

### **[Q14]** PLAN-B — Resolve open semantic questions (week 2)

Three small INVESTIGATE plans, each producing a decision documented in the catalogue:

1. **Cross-NGO activity taxonomy** — settle Q4 above. Likely outcome: extend `ref_atlas_service_category` to ~30 rows + add a higher-level "activity family" grouping; or introduce a new `dim_canonical_activity` if the cross-org work justifies it.
2. **Regional-without-orgnr chapter modelling** — settle Q5 above.
3. **SDG/ICNPO indicator tagging approach** — pull [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) out of backlog and resolve it.

### **[Q15]** PLAN-C — Defer model contracts until a real external consumer materialises

**Defer, do not run in week 3.** Resolves **[Q23]**: Atlas's only consumer today is its own Next.js frontend. Freezing `marts.*` shapes via `contract: { enforced: true }` for *hypothetical* external developers is YAGNI — it adds CI burden and slows iteration on the supply side without protecting any real consumer.

**Trigger condition**: lift this defer when a real external consumer materialises. The two plausible candidates are Tilskuddsmatcher and Lisa (per [`goal.md:232`](https://github.com/terchris/atlas/tree/main/docs/research/goal.md#L232) — "Lisa-first vs. public-first"). When that happens, contract scope is **only the conformed dimensions** the new consumer actually touches — not all of `marts.*`.

**Format choice when triggered**: prefer **ODCS v3** ([Open Data Contract Standard](https://opendatacontract.com/)) generated *from* `manifest.json` rather than dbt-native `contract:` blocks. ODCS is vendor-neutral and portable if Atlas ever moves off dbt; dbt-native contracts lock the spec into a tool-specific YAML shape. The MCP server (PLAN-A) already exposes `manifest.json`, so ODCS generation is a downstream rendering step, not a parallel artifact.

**Until trigger fires**: PLAN-A's dbt-osmosis CI gate already prevents the worst regressions (undocumented columns, missing descriptions). That's the right level of rigour for "frontend is the only consumer."

Models that *would* be in scope when the trigger fires: `dim_kommune`, `dim_fylke`, `dim_ngo`, `dim_chapter`, `dim_activity`, `fact_kommune_indicators`, `fact_chapter_activities`, `chapter_kommune_coverage`, `mart_ingest_health`, plus the `ref_*` seeds. Subset of these depending on which consumer triggers.

### **[Q16]** Resume NGO supply expansion (week 4+)

After PLAN-A/B/C complete, the 3rd through Nth NGO supply sources can land knowing the cross-NGO contracts are stable. Each new `supply__<ngo>_*` plugs into the existing pattern; each new NGO joins the catalogue automatically.

---

## Open Questions

1. **[Q17]** Is 3 weeks the right amount of structural pause? Could be compressed to 2 weeks if we accept a thinner v1 catalogue (e.g. only the 4 most-used concepts: kommune, ngo, chapter, indicator).
2. **[Q18]** Does this investigation conflict with or supersede [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md), or does that one just become a sub-task of PLAN-B above?
3. **[Q19]** Should PLAN-A include the public read API (OpenAPI + HTTP endpoints), or is that a separate downstream PLAN once at least one external consumer (e.g. Tilskuddsmatcher) materializes? The discussion file's "Lisa-first wedge" framing suggests Tilskuddsmatcher is plausibly the first external-shaped consumer, so the API may not be deferrable for long.
4. **[Q20]** Naming — call the artifact "Concept Catalogue", "Semantic Registry", "Data Dictionary", or "Atlas Glossary"? Pick before building.
5. **[Q21]** Where does the catalogue live in the repo — `docs/semantic/`, `atlas-data/semantic/`, or a new top-level `semantic/`? Repo-boundary implications: if it includes auto-generated artifacts from `manifest.json`, it likely belongs in `atlas-data/`; if it's primarily prose for external consumers, `docs/` makes more sense.
6. **[Q22]** What does "more NGO supply source paused" mean operationally — block PRs, or just discourage in planning? PRs that add new NGOs would still be valuable as test cases for the catalogue; the question is whether they merge before PLAN-A/B/C finish.
7. **[Q23]** ~~Does the **Dev** persona ([personas.md](https://github.com/terchris/atlas/tree/main/docs/research/personas.md) tertiary) actually exist in real form yet, or is this all speculative? If no real external developer is asking, does the YAGNI argument win for the API+contract layer (PLAN-C)?~~ **Resolved: YAGNI wins.** PLAN-C deferred until a real external consumer (Tilskuddsmatcher / Lisa) materialises. See [Q15] above for the trigger condition and ODCS-v3 format choice.
8. **[Q24]** **Trap to verify before locking PLAN-A**: how mature is [dbt-mcp](https://github.com/dbt-labs/dbt-mcp) against dbt Core (vs. dbt Cloud)? The recommendation in PLAN-A assumes Core support is production-ready. Spike: stand up dbt-mcp locally against the existing `atlas-data/dbt` project, exercise the Discovery API tools from a Claude Desktop / Code MCP client, document any rough edges. If Core support is shaky, fall back to Option C (YAML + generator) for v1 and revisit MCP when stable.
9. **[Q25]** **Trap to acknowledge in PLAN-A**: dbt's static-site `dbt-docs` renderer is being quietly succeeded by dbt Platform Catalog (Cloud-only). Building heavy custom theming or tooling on top of the static renderer locks Atlas onto a sunset trajectory. The PLAN-A "fallback HTML site" item is fine as a thin `dbt docs generate` artifact; do not invest beyond that. The live trajectory for the *machine* interface is MCP, which is the primary deliverable anyway.
10. **[Q26]** **Follow-up surfaced from the 2026-04-27 dbt audit**: [`fact_kommune_indicators`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/marts/fact_kommune_indicators.sql) bakes source-specific headline-slice filters directly into the cross-source UNION SQL — `household_type = '0000'` (ssb-06944), `age_group = '16_120'` (fhi-bor-alene), `parents_education = '0' AND immigration_category = '0' AND sex = 'all'` (fhi-vgs-gjennomforing), `age_group = '0_120' AND housing_status = 'trangt'` (fhi-trangbodd), and so on. If an upstream source revs a `contents_code` or adds a dimension value, the fact silently produces wrong rows rather than failing loudly. Replace the inline filters with a declarative `ref_indicator_headline_slice` seed (one row per `source_id` carrying the slice predicate as data, plus an `accepted_values` test on every dimension column the slice references), then drive the UNION via a small jinja loop. **Not a blocker for PLAN-A.** Defer until either: (a) indicator source count crosses ~25, or (b) the first time a silent miss is caught in production. Until then the existing pattern is fine — flagging it so it doesn't get lost.

---

## Strategic context — why this matters for Atlas's stated goals

From [`docs/research/goal.md`](https://github.com/terchris/atlas/tree/main/docs/research/goal.md):

- **Goal #4: "Make the sector legible"** ([goal.md:89](https://github.com/terchris/atlas/tree/main/docs/research/goal.md#L89)) — explicitly frames the data layer as "valuable as a public good on its own — for journalists, researchers, policy planners, and engaged citizens — and is what makes the app reusable beyond the engagement flow." A concept catalogue is the surface that makes "legible" real for non-engineers.
- **"Om appen" page** ([goal.md:123](https://github.com/terchris/atlas/tree/main/docs/research/goal.md#L123) + [goal.md:207](https://github.com/terchris/atlas/tree/main/docs/research/goal.md#L207)) — already a v1 success criterion. It needs *something* to render: per-source provenance, the data model, the concepts. The catalogue feeds it directly.
- **Open decision #1: Lisa-first vs. public-first** ([goal.md:232](https://github.com/terchris/atlas/tree/main/docs/research/goal.md#L232)) — Tilskuddsmatcher is the closest thing to a real external-shaped consumer of the data layer. If Lisa-first wins, the API + catalogue become near-term load-bearing.
- **Personas served**: [personas.md](https://github.com/terchris/atlas/tree/main/docs/research/personas.md) **Dev** (tertiary), **Ola** (primary, data-curious), **Signe** (secondary, planning), **Lisa** (secondary, tilskuddsmatcher). All four benefit from the catalogue; none has a good entry point today.

---

## Next Steps

- [ ] Resolve **[Q1]** through **[Q8]** in conversation with the user before splitting into PLANs.
- [ ] Decide the freeze/continue split (**[Q9]** through **[Q12]**) — needs explicit agreement before merging the next NGO supply PR.
- [ ] Pick catalogue format (Options A/B/C/D).
- [ ] Pick naming (**[Q20]**).
- [ ] Once decided: split into `PLAN-001-concept-catalogue.md`, `PLAN-002-resolve-open-semantic-questions.md`, `PLAN-003-dbt-contracts-and-freeze.md` per the phased plan above.

### Not in scope for this investigation

- Designing the public read API in detail — that's a separate PLAN once the catalogue exists and a real consumer is confirmed.
- Building Docusaurus or any human-rendered site — the catalogue's machine-readable artifacts come first; rendering is downstream.
- Re-deciding any already-locked semantic conventions (canonical IDs, the `raw → indicators__ → fact` pattern).

### Prerequisites

- None. This investigation can start immediately. PLAN-003 (Folkehjelp supply ingest) can continue in parallel — it's the second NGO and surfaces concrete material for **[Q4]** and **[Q5]**.

---

## Cross-references

- [`docs/ideas/semantic-data-platform.md`](https://github.com/terchris/atlas/tree/main/docs/ideas/semantic-data-platform.md) — original proposal that triggered this work.
- [`docs/ideas/semantic-data-platform-discussion.md`](https://github.com/terchris/atlas/tree/main/docs/ideas/semantic-data-platform-discussion.md) — the alignment evaluation and ChatGPT reframing that produced the freeze/continue framing.
- [`docs/research/common-schema.md`](https://github.com/terchris/atlas/tree/main/docs/research/common-schema.md) — the prose entity model that becomes the seed content for the catalogue.
- [`docs/research/goal.md`](https://github.com/terchris/atlas/tree/main/docs/research/goal.md) — strategic context (Goal #4, Om appen, Lisa-first decision).
- [`docs/research/personas.md`](https://github.com/terchris/atlas/tree/main/docs/research/personas.md) — Dev / Ola / Signe / Lisa personas this serves.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — the SDG/ICNPO tagging investigation that becomes a sub-task of PLAN-B (or stays separate per **[Q18]**).
- [INVESTIGATE-multi-ngo-supply-model-extensions.md](INVESTIGATE-multi-ngo-supply-model-extensions.md) — the supply-side investigation that surfaced `chapter_subtype` and the cross-NGO activity questions.
- [`atlas-data/dbt/models/dimensions/schema.yml`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/models/dimensions/schema.yml) — the current `schema.yml` whose descriptions become the seed content for the catalogue's column-level metadata.
- [`atlas-data/dbt/seeds/README.md`](https://github.com/terchris/atlas/tree/main/atlas-data/dbt/seeds/README.md) — reference vocabulary documentation.
