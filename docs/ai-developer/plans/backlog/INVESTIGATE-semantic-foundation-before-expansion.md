# Investigate: Lock the semantic foundation before adding more NGO supply sources

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog

**Goal**: Decide what semantic-layer artifacts (concept catalogue, dbt model contracts, cross-NGO taxonomy decisions) must land **before** Atlas adds more NGO supply sources beyond Folkehjelp, so that those decisions don't get baked into 5+ more `supply__<ngo>_*` models and have to be retroactively undone.

**Last Updated**: 2026-04-25

**Origin**: [`docs/ideas/semantic-data-platform.md`](../../../ideas/semantic-data-platform.md) proposed a canonical semantic layer "before dbt transformations are defined". A repo-wide alignment evaluation (captured in [`docs/ideas/semantic-data-platform-discussion.md`](../../../ideas/semantic-data-platform-discussion.md)) found that ~70–80% of that layer is already implicitly built — but is *unpackaged* (scattered across `schema.yml`, `common-schema.md`, INVESTIGATE plans, and seed READMEs) rather than factored out as a first-class artifact. The follow-up question — "but we can't continue adding more data until we have a clear definition, so we don't have to redo later?" — is the framing this investigation answers.

---

## Questions to Answer

1. **[Q1]** Which semantic decisions are **already locked** in the repo (no rework risk from adding more sources) vs. **not yet locked** (rework risk grows with each new source added)?
2. **[Q2]** Should NGO supply-source expansion (everything past PLAN-003 Folkehjelp) pause until the unlocked decisions land? Or can it continue if each new source explicitly accepts the rework risk?
3. **[Q3]** What goes in the Concept Catalogue — which concepts, what file format, hand-curated vs. auto-generated from dbt's `manifest.json` vs. hybrid?
4. **[Q4]** Cross-NGO canonical activity taxonomy ([common-schema.md:450](../../../research/common-schema.md#L450) flags this as still TBD) — extend `ref_atlas_service_category`, build a separate cross-NGO `dim_canonical_activity`, or stay per-NGO and resolve at query time?
5. **[Q5]** Regional-without-orgnr chapter modelling ([common-schema.md:458](../../../research/common-schema.md#L458) flags Redd Barna's "20 lokallag + 5 HQ regions" as TBD) — model regions as a separate entity, stretch `dim_chapter` with a new `chapter_kind` enum, or accept asymmetric coverage and document the gap?
6. **[Q6]** SDG/ICNPO indicator tagging approach — defer to [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) to settle, or fold its decision into this investigation so the catalogue ships with tagging in place?
7. **[Q7]** dbt model contract scope — apply `contract: { enforced: true }` to all of `marts.*`, only the cross-NGO conformed dimensions (`dim_kommune`, `dim_chapter`, `dim_activity`, `dim_ngo`, `fact_kommune_indicators`, `fact_chapter_activities`), or none yet?
8. **[Q8]** What's the operational rule for "this decision is locked"? Just docs in the catalogue, or enforced via dbt contracts + tests + CI?

---

## Current State

### What's already locked (zero or near-zero rework risk)

The 19 ingest sources and 17 indicator models in [`atlas-data-repo/dbt/models/`](../../../../atlas-data-repo/dbt/models/) demonstrate a stable, proven pattern. These canonical elements are consistent across every source:

- **Canonical identifiers**: `kommune_nr` (4-digit, SSB Klass 131), `fylke_nr` (2-digit, SSB Klass 104), `orgnr` (Brreg 9-digit), `source_id` (e.g. `ssb-08764`, `fhi-mobbing`), `chapter_id` (NGO-namespaced slug), `activity_id` (NGO-namespaced slug).
- **Source → indicator mapping pattern**: every `indicators__<source_id>` model in [models/indicators/](../../../../atlas-data-repo/dbt/models/indicators/) follows the same shape: extract `region_code` → `kommune_nr` / `fylke_nr` by regex, normalize sex via `decode_sex` macro, parse periods via `period_start_year` / `period_end_year`, materialize as `marts.indicators__*` table with FK tests against `dim_kommune` / `dim_fylke`.
- **Cross-source union pattern**: [`fact_kommune_indicators`](../../../../atlas-data-repo/dbt/models/marts/fact_kommune_indicators.sql) UNION ALL of all kommune-resolved indicator passthroughs, joined to `dim_kommune` + `dim_fylke`.
- **Reference vocabulary pattern**: `ref_*` seeds in [seeds/](../../../../atlas-data-repo/dbt/seeds/) decode upstream codes to labels (4 columns: `code`, `label_no`, `label_en`, `sort_order`).
- **Repo boundary contract**: `atlas-data` writes `marts.*`, frontend reads via read-only role (documented in [atlas-data-repo/README.md:26-34](../../../../atlas-data-repo/README.md#L26-L34)).

Adding source #20 of the same shape (another SSB or FHI table) **does not** create rework risk — it slots into the existing patterns mechanically. The catalogue, when built, will auto-augment with these new sources.

### What's not yet locked (rework risk grows with each new source)

The supply side is much earlier and has actively-open semantic questions. These are baked into every new `supply__<ngo>_*` model added:

- **Cross-NGO activity taxonomy** — the 22-row [`ref_atlas_service_category.csv`](../../../../atlas-data-repo/dbt/seeds/ref_atlas_service_category.csv) is the start, but [`common-schema.md:450`](../../../research/common-schema.md#L450) explicitly flags a deeper cross-org canonical taxonomy ("elderly_visiting_scheme" spanning RC Besøkstjeneste + N.K.S. Omsorgsberedskap + Nasjonalforeningen Aktivitetsvenn) as TBD. Each new NGO supply source adds another ~50 globalActivityName values that need mapping.
- **`chapter_subtype` vocabulary** — [dim_chapter schema.yml:158-166](../../../../atlas-data-repo/dbt/models/dimensions/schema.yml#L158-L166) keeps it free-text in v1; promotion to `accepted_values` is gated on "3+ NGOs populate it consistently". The values that get added to v1 NGOs determine that vocabulary forever.
- **Regional-without-orgnr modelling** — [`common-schema.md:458`](../../../research/common-schema.md#L458) flags Redd Barna's HQ-administered regions as not fitting the current `dim_chapter` shape. Adding more Tier C / hybrid orgs will surface more of these.
- **`chapter_data_shape` enum coverage** — currently `api_canonical | cms_bins | programme_only | no_structure`. The next 5 NGOs may surface a fifth shape (e.g. "hybrid api+scrape", "kommune-list-only").
- **SDG/ICNPO indicator tagging** — [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) is in backlog. Whatever approach wins (Option A through E in that file) will need to be retroactively applied to all 17 existing indicator models — fewer is cheaper.

### What's "unpackaged" (the discussion-file finding)

The semantic content exists but is scattered:

- **Entity definitions**: [`docs/research/common-schema.md`](../../../research/common-schema.md) (470 lines of prose entity model).
- **Per-model column definitions**: dbt `schema.yml` files (~700 lines across `models/dimensions/`, `models/indicators/`, `models/marts/`, `models/supply/`).
- **Reference vocabularies**: [`atlas-data-repo/dbt/seeds/README.md`](../../../../atlas-data-repo/dbt/seeds/README.md) + 10 CSV seeds.
- **Source provenance**: per-source READMEs under [`atlas-data-repo/ingest/src/sources/<id>/README.md`](../../../../atlas-data-repo/ingest/src/sources/) + the catalogue at [`docs/research/data-sources.md`](../../../research/data-sources.md).
- **Architectural rationale**: the 18 `INVESTIGATE-*.md` and `PLAN-*.md` files in `plans/completed/`.

A non-engineer (journalist, partnering NGO, future external developer matching the **Dev** persona in [personas.md](../../../research/personas.md)) currently has no single entry point to "what does Atlas mean by `kommune` / `chapter` / `activity` / `service_category`?".

---

## The freeze/continue split (proposed)

The honest answer to "can we continue adding more data" is: **yes for some, no for others**. The split:

### Continue in parallel (no rework risk)

- **[Q9]** Adding more SSB/FHI/Bufdir/IMDi indicator sources following the established `indicators__<source_id>` pattern. The pattern is locked; new sources slot in mechanically. The catalogue auto-augments.
- **[Q10]** Completing PLAN-003 (Folkehjelp supply ingest) — already in flight, already fits the existing `supply__<ngo>_*` pattern, and adding the second NGO is what will surface most of the open semantic questions in concrete form.

### Pause until foundation locks

- **[Q11]** Adding the 3rd through Nth NGO supply sources (N.K.S., Nasjonalforeningen, 4H, Speiderforbundet, Frelsesarmeen, Kirkens Bymisjon, etc.). Each one bakes assumptions about cross-NGO activity taxonomy, `chapter_subtype` vocabulary, regional-without-orgnr modelling — all currently unlocked.
- **[Q12]** Adding Tier C profile sources (NRC, KN, SOS, UNICEF, etc. — the donate-only orgs from [common-schema.md:271-296](../../../research/common-schema.md#L271-L296)). The `Profile` entity is sketched but not yet implemented in dbt; adding multiple at once locks the wrong shape.

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
- Doesn't carry [`common-schema.md`](../../../research/common-schema.md) prose, INVESTIGATE-plan rationale, or per-source provenance narratives.
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
- Doesn't replace the prose in [`common-schema.md`](../../../research/common-schema.md).
- Less portable than YAML if we move off dbt later.

---

## Recommendation candidates (to discuss, not yet chosen)

**Tentative pick: Option C (structured YAML + generator).** Reasoning:

- It is the only option that produces *one source of truth* with *three projections* (LLM JSON, human MD, future OpenAPI). The discussion file's framing ("don't build three products, build one foundation rendered three ways") fits this option directly.
- The auto-augmentation from `manifest.json` solves the drift problem that kills hand-curated docs.
- The generator is small (1 script, ~200 LOC) and the YAML concept files are short (~50 lines each × 8 concepts = ~400 lines hand-written content, mostly distilled from existing `common-schema.md`).
- Foundation for the public API: when Tilskuddsmatcher or the next external consumer materializes, the same concept registry seeds the OpenAPI spec.

But this is a real call to make — Options A and B are cheaper if we accept the tradeoffs.

---

## Recommendation — phased plan (subject to revision)

A 3-week structural pause before NGO supply expansion resumes, with parallel data work continuing where safe.

### **[Q13]** PLAN-A — Concept Catalogue v1 (week 1)

Stand up the catalogue structure with the 8 already-locked concepts. No new semantic decisions; documents what exists.

Concepts to include:
1. `kommune` (sourced from `dim_kommune`)
2. `fylke` (sourced from `dim_fylke`)
3. `ngo` (sourced from `dim_ngo`)
4. `chapter` (sourced from `dim_chapter`)
5. `activity` (sourced from `dim_activity`)
6. `service_category` (sourced from `ref_atlas_service_category`)
7. `indicator` (sourced from `indicators__*` family)
8. `source` (sourced from per-source READMEs + `mart_ingest_health`)

Output: chosen format from Option A/B/C/D + generator/render tooling + CI check that catalogue covers all `marts.*` public models.

### **[Q14]** PLAN-B — Resolve open semantic questions (week 2)

Three small INVESTIGATE plans, each producing a decision documented in the catalogue:

1. **Cross-NGO activity taxonomy** — settle Q4 above. Likely outcome: extend `ref_atlas_service_category` to ~30 rows + add a higher-level "activity family" grouping; or introduce a new `dim_canonical_activity` if the cross-org work justifies it.
2. **Regional-without-orgnr chapter modelling** — settle Q5 above.
3. **SDG/ICNPO indicator tagging approach** — pull [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) out of backlog and resolve it.

### **[Q15]** PLAN-C — dbt model contracts + freeze (week 3)

Apply `contract: { enforced: true }` to the public conformed dimensions and facts. Add `versions:` where appropriate. Document the contract surface in the catalogue. CI fails on breaking changes to these models.

Specifically: `dim_kommune`, `dim_fylke`, `dim_ngo`, `dim_chapter`, `dim_activity`, `fact_kommune_indicators`, `fact_chapter_activities`, `chapter_kommune_coverage`, `mart_ingest_health`, plus the `ref_*` seeds.

### **[Q16]** Resume NGO supply expansion (week 4+)

After PLAN-A/B/C complete, the 3rd through Nth NGO supply sources can land knowing the cross-NGO contracts are stable. Each new `supply__<ngo>_*` plugs into the existing pattern; each new NGO joins the catalogue automatically.

---

## Open Questions

1. **[Q17]** Is 3 weeks the right amount of structural pause? Could be compressed to 2 weeks if we accept a thinner v1 catalogue (e.g. only the 4 most-used concepts: kommune, ngo, chapter, indicator).
2. **[Q18]** Does this investigation conflict with or supersede [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md), or does that one just become a sub-task of PLAN-B above?
3. **[Q19]** Should PLAN-A include the public read API (OpenAPI + HTTP endpoints), or is that a separate downstream PLAN once at least one external consumer (e.g. Tilskuddsmatcher) materializes? The discussion file's "Lisa-first wedge" framing suggests Tilskuddsmatcher is plausibly the first external-shaped consumer, so the API may not be deferrable for long.
4. **[Q20]** Naming — call the artifact "Concept Catalogue", "Semantic Registry", "Data Dictionary", or "Atlas Glossary"? Pick before building.
5. **[Q21]** Where does the catalogue live in the repo — `docs/semantic/`, `atlas-data-repo/semantic/`, or a new top-level `semantic/`? Repo-boundary implications: if it includes auto-generated artifacts from `manifest.json`, it likely belongs in `atlas-data-repo/`; if it's primarily prose for external consumers, `docs/` makes more sense.
6. **[Q22]** What does "more NGO supply source paused" mean operationally — block PRs, or just discourage in planning? PRs that add new NGOs would still be valuable as test cases for the catalogue; the question is whether they merge before PLAN-A/B/C finish.
7. **[Q23]** Does the **Dev** persona ([personas.md](../../../research/personas.md) tertiary) actually exist in real form yet, or is this all speculative? If no real external developer is asking, does the YAGNI argument win for the API+contract layer (PLAN-C)?

---

## Strategic context — why this matters for Atlas's stated goals

From [`docs/research/goal.md`](../../../research/goal.md):

- **Goal #4: "Make the sector legible"** ([goal.md:89](../../../research/goal.md#L89)) — explicitly frames the data layer as "valuable as a public good on its own — for journalists, researchers, policy planners, and engaged citizens — and is what makes the app reusable beyond the engagement flow." A concept catalogue is the surface that makes "legible" real for non-engineers.
- **"Om appen" page** ([goal.md:123](../../../research/goal.md#L123) + [goal.md:207](../../../research/goal.md#L207)) — already a v1 success criterion. It needs *something* to render: per-source provenance, the data model, the concepts. The catalogue feeds it directly.
- **Open decision #1: Lisa-first vs. public-first** ([goal.md:232](../../../research/goal.md#L232)) — Tilskuddsmatcher is the closest thing to a real external-shaped consumer of the data layer. If Lisa-first wins, the API + catalogue become near-term load-bearing.
- **Personas served**: [personas.md](../../../research/personas.md) **Dev** (tertiary), **Ola** (primary, data-curious), **Signe** (secondary, planning), **Lisa** (secondary, tilskuddsmatcher). All four benefit from the catalogue; none has a good entry point today.

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

- [`docs/ideas/semantic-data-platform.md`](../../../ideas/semantic-data-platform.md) — original proposal that triggered this work.
- [`docs/ideas/semantic-data-platform-discussion.md`](../../../ideas/semantic-data-platform-discussion.md) — the alignment evaluation and ChatGPT reframing that produced the freeze/continue framing.
- [`docs/research/common-schema.md`](../../../research/common-schema.md) — the prose entity model that becomes the seed content for the catalogue.
- [`docs/research/goal.md`](../../../research/goal.md) — strategic context (Goal #4, Om appen, Lisa-first decision).
- [`docs/research/personas.md`](../../../research/personas.md) — Dev / Ola / Signe / Lisa personas this serves.
- [INVESTIGATE-tag-indicators-sdg-icnpo.md](INVESTIGATE-tag-indicators-sdg-icnpo.md) — the SDG/ICNPO tagging investigation that becomes a sub-task of PLAN-B (or stays separate per **[Q18]**).
- [INVESTIGATE-multi-ngo-supply-model-extensions.md](INVESTIGATE-multi-ngo-supply-model-extensions.md) — the supply-side investigation that surfaced `chapter_subtype` and the cross-NGO activity questions.
- [`atlas-data-repo/dbt/models/dimensions/schema.yml`](../../../../atlas-data-repo/dbt/models/dimensions/schema.yml) — the current `schema.yml` whose descriptions become the seed content for the catalogue's column-level metadata.
- [`atlas-data-repo/dbt/seeds/README.md`](../../../../atlas-data-repo/dbt/seeds/README.md) — reference vocabulary documentation.
