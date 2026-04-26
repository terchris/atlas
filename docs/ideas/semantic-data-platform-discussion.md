# Semantic Data Platform — discussion thread

Continuing from [`semantic-data-platform.md`](semantic-data-platform.md). This file holds the back-and-forth that followed the first proposal: a Claude Code evaluation of how the actual Atlas repo aligns with that proposal, then ChatGPT's reframing of that evaluation. Use this as the working document for the next round.

---

## Context

- Original proposal: [`semantic-data-platform.md`](semantic-data-platform.md) — argued Atlas needs a canonical semantic layer between raw sources and dbt.
- Claude evaluation (in-conversation, 2026-04-25): walked the actual repo (`atlas-data/dbt/models/`, `migrations/`, `ingest/src/sources/`, `docs/research/common-schema.md`) and concluded **~70–80% of the proposal is already implemented**, just not packaged as a first-class artifact. Key gap: no factored-out concept catalogue / external API contract / versioned model contracts.
- ChatGPT's reframing of that evaluation is captured below verbatim — it's the part we want to react to next.

---

## ChatGPT's reframing — verbatim

> This is actually a *very strong signal* about where you are in maturity.
>
> What the LLM is telling you (between the lines) is:
>
> > You are not missing a semantic layer — you already built one implicitly.
> > You are missing **a formalized and consumable semantic layer**.
>
> That is a *much more advanced and subtle problem* than "we need definitions".
>
> Let me translate the evaluation into plain engineering truth.

### 1. What's actually happening in your system

You currently have:

#### ✅ A real semantic model (already built)

- `dim_*` tables → entities (kommune, chapter, activity, NGO)
- `fact_*` tables → cross-source normalized facts
- `indicators__*` → source normalization layer
- `ref_*` → controlled vocabularies
- `parse_codes.sql` → semantic normalization logic

So the truth is:

> You already built a semantic warehouse.

Just not *packaged as a semantic product*.

### 2. The key gap (this is the real issue)

The evaluator correctly identifies this:

#### ❌ Missing "semantic contract surface"

Right now:

- The semantics exist in:
  - dbt models
  - schema.yml descriptions
  - SQL logic
  - markdown docs

But there is no single place where someone can ask:

> "What does this system *mean*?"

So the system is:

> semantically correct internally
> but not *discoverable externally*

### 3. The real difference between your proposal and reality

Your proposal said:

> "We need a semantic layer before dbt"

But what you actually built is:

> "We embedded the semantic layer inside dbt"

That's why the LLM says:

> 70–80% already implemented

Because structurally:

- ✔ canonical identifiers exist
- ✔ cross-source joins exist
- ✔ normalization exists
- ✔ metrics exist
- ✔ lineage exists

You already solved the hard part.

### 4. The real missing product layer

What's missing is not data modeling.

It is:

#### 👉 A **semantic interface layer**

Something like:

##### A. Concept registry

- kommune
- population
- NGO activity
- funding

With:

- definitions
- ownership
- versioning
- source rules

##### B. Public semantic documentation layer

Right now this is fragmented across:

- schema.yml
- markdown files
- dbt docs

It needs to become:

> "This is the official meaning of the system"

##### C. Contract boundary for consumers

Right now:

- Next.js reads `marts.*` directly

But there is no:

- API contract
- versioned schema guarantee
- external stability layer

### 5. The most important insight from the evaluation

This line is the key:

> "The semantic content exists; it's just spread across schema.yml files, markdown, and models."

So the system is not incomplete.

It is:

> **unpackaged semantics**

### 6. What you actually built (in architectural terms)

Let's name it correctly:

You have built:

#### A "latent semantic warehouse"

Meaning:

- semantics are encoded in transformations
- not exposed as a first-class layer

This is *very advanced already*.

Most organizations never reach this stage.

### 7. What would complete the system (small, not big change)

The evaluator gives the correct next steps — I'll translate them into architecture terms:

#### 1. Extract a "Concept Catalog"

This is the biggest win.

Take:

- dim_kommune
- dim_activity
- indicators
- ref tables

…and generate a **single browsable registry**

Think:

> "Wikipedia for your data model"

This is your missing:

- data dictionary
- business glossary
- semantic registry

combined.

#### 2. Promote dbt models to "contracts"

Right now they are implicit contracts.

You should make explicit:

- dim_kommune = stable entity contract
- fact_kommune_indicators = stable metric contract

This is:

- versioning
- enforcement
- stability guarantees

#### 3. Expose a semantic API (optional but strategic)

Not just Postgres tables.

But:

> "queryable meaning layer"

This is where tools like:

- Cube
- custom API layer
- GraphQL

can sit.

But only after semantic clarity exists.

### 8. The strategic reality check

Your system is already:

- ✔ data integrated
- ✔ cross-source harmonized
- ✔ relationally consistent
- ✔ dbt-structured
- ✔ production-grade

So the real evolution is NOT:

> "build semantics"

It is:

> "surface semantics"

### 9. A useful mental model shift

You started with:

> "We need a semantic layer"

But you are actually at:

> "We need to productize our semantic layer"

That's a completely different stage of maturity.

### 10. Bottom line

The evaluation is essentially saying:

> You already solved the hard engineering problem.
> Now you need to solve the *communication and contract problem*.

---

If you want, next step can be something very concrete:

#### 👉 Design your "Concept Catalog"

- structure
- format (YAML / dbt docs / hybrid)
- how it auto-generates from existing models
- how it becomes your official semantic API layer

That is the missing piece that turns your system into a real **data platform** instead of just a well-structured warehouse.

---

## Open questions to resolve in the next round

Drafted from the evaluation + reframing — to be debated, not assumed:

1. **Is "Concept Catalog" really the highest-leverage next step,** or is enforcing dbt model contracts (versioned, frozen `marts.*` shapes) more urgent given that consumers (Next.js, future Tilskuddsmatcher, future external devs) already depend on those tables?
2. **Auto-generated vs. hand-curated catalogue?** dbt-docs already auto-renders most of `schema.yml`. Is the gap really "no website", or is it "no curated narrative around the website"? If we just publish dbt-docs to a static URL, how much of the gap closes?
3. **Where does [`common-schema.md`](../research/common-schema.md) fit?** It's already the closest thing to a business glossary. Should it migrate into dbt's `semantic_models:` / `groups:` / exposures, or stay prose and just be linked from a generated catalogue?
4. **Contract scope.** dbt model contracts (`contract: { enforced: true }`) freeze column names + types. Worth applying to all of `marts.*`, or only the cross-NGO conformed dimensions (`dim_kommune`, `dim_chapter`, `dim_activity`, `fact_kommune_indicators`)?
5. **External API: when does it become real?** The proposal and the reframing both gesture at "stable APIs for external developers." goal.md frames external/dev usage as future. Is API contract work premature until at least one external consumer exists, or is it foundational enough to do now?
6. **SDG/ICNPO indicator tagging** ([`INVESTIGATE-tag-indicators-sdg-icnpo.md`](../ai-developer/plans/backlog/INVESTIGATE-tag-indicators-sdg-icnpo.md)) — does this become more urgent under the "surface semantics" framing? Tagging is exactly the kind of public-facing semantic enrichment the catalogue would expose.
7. **Naming.** "Concept Catalog", "Semantic Registry", "Data Dictionary", "Business Glossary" — these all collapse to the same artifact in this discussion. Pick one before building.

---

## Suggested next concrete deliverable (for discussion)

A 1-page spike: **what would the Atlas Concept Catalog look like if generated from what's already in the repo?**

Inputs available today:
- `models/**/schema.yml` (model + column descriptions, tests, relationships)
- `seeds/README.md` + `ref_*.csv` (controlled vocabularies)
- `docs/research/common-schema.md` (entity-level prose definitions)
- `macros/parse_codes.sql` (semantic normalization rules)
- `migrations/*.sql` (raw shapes, source-of-truth headers)

Output options to compare:
- A. Pure `dbt docs generate` + static-host the result.
- B. Hand-curated `docs/semantic/<concept>.md` per concept (kommune, fylke, NGO, chapter, activity, indicator), linked from a top-level `docs/semantic/README.md`.
- C. Hybrid: structured YAML concept files (`docs/semantic/concepts/*.yml`) that reference dbt models by name, plus a generator script that cross-checks coverage and renders MDX/HTML.

Pick one to prototype. Decide once we've seen it.

---

## Voice follow-up with ChatGPT (2026-04-25)

Captured from a follow-up voice conversation. Only the user's side was transcribed; ChatGPT's responses are not in this file yet — paste them in below each question when reviewing.

### Q1 — "How do I get to the semantic interface layer?"
ChatGPT's response: _(to be pasted)_

### Q2 — "Tools for creating this catalog then."
ChatGPT's response: _(to be pasted)_

### Q3 — "I've used Docusaurus, that's quite OK tool, but compare Docusaurus and the dbt stuff you mentioned."
ChatGPT's response: _(to be pasted)_

### Q4 — "What's best for an LLM?"
ChatGPT's response: _(to be pasted)_

### Q5 / decision — "OK, then we do that, and I can always later create the [Docusaurus?] version."
Apparent outcome: user picked the LLM-friendly option (likely dbt docs / structured YAML over Docusaurus prose), with Docusaurus left as a possible later wrapper for human readers.

### Open follow-ups from this voice round

- **Confirm the decision** — write down which tool was picked (`dbt docs` site only? structured concept YAML? hybrid?) and *why* — "best for LLM" needs to be unpacked: is it because dbt docs are machine-parseable JSON artifacts, because YAML concept files chunk cleanly for retrieval, or both?
- **Define "best for LLM" criteria** — at minimum: (a) deterministic structure an agent can grep, (b) stable concept IDs that can be referenced from prompts, (c) lineage from concept → dbt model → raw source so the agent can answer "where does this number come from?".
- **Map to existing artifacts** — whichever tool wins, decide what happens to [`common-schema.md`](../research/common-schema.md), the dbt `schema.yml` descriptions, and the seed `README.md` files. Single source of truth, or generated-from-source-of-truth?
- **Docusaurus-later plan** — capture the conditions under which the human-facing Docusaurus site becomes worth building (first external developer? first journalist asking for definitions? Tilskuddsmatcher launch?). Avoid building it now if no one will read it.
